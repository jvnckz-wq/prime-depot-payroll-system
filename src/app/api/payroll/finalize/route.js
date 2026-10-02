import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { deductionOps } from '@/lib/server/services/loans-apply';
import { cutoffOf, planDeductions, staffRunKey, withPlan } from '@/lib/loan-rules';
import { computeStaffPayroll } from '@/lib/payroll';
import { loadStaffPayrollInputs, staffAvailable, toDate } from '@/lib/server/services/payroll-inputs';

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const ymdOf = (d) => new Date(d).toISOString().slice(0, 10);
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const intOf = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function buildSlips({ staff, attendanceById, statutory }, loans, runKey) {
  return staff.map((e) => {
    const calc = computeStaffPayroll(e, loans, statutory, attendanceById.get(e.id), runKey);
    return {
      employeeId: e.id,
      employeeName: e.name,
      daysPresent: intOf(calc.days),
      basicPay: money(calc.gross),
      overtimeWeekday: money(calc.otWeekday),
      overtimeWeekend: money(calc.otWeekend),
      allowances: money(calc.allowance),
      grossPay: money(calc.gross),
      sssDeduction: money(calc.sss),
      philhealthDeduction: money(calc.phic),
      pagibigDeduction: money(calc.mp1),
      mp2Deduction: money(calc.mp2),
      companyCover: money(calc.companyCover),
      tardinessDeduction: money(calc.tardiness),
      loanDeduction: money(calc.loanDeduction),
      advanceDeduction: money(calc.advanceDeduction),
      totalDeductions: money(calc.totalDeductions),
      netPay: money(calc.net),
    };
  });
}

const CENTAVO = 0.011;

function verifyAgainstClient(computed, claimed) {
  if (!Array.isArray(claimed) || claimed.length === 0) return null;

  const byId = new Map(computed.map((p) => [String(p.employeeId), p]));

  for (const slip of claimed) {
    const id = String(slip?.employeeId ?? '');
    if (!id) continue;

    const ours = byId.get(id);
    if (!ours) {
      return `The payroll on screen includes ${id}, who is no longer in this cutoff.`;
    }

    if (slip.netPay == null || slip.netPay === '') continue;

    const theirs = Number(slip.netPay);
    if (Number.isFinite(theirs) && Math.abs(theirs - ours.netPay) > CENTAVO) {
      return `${ours.employeeName}'s net pay has changed since this page was loaded `
        + `(shown ₱${theirs.toFixed(2)}, now ₱${ours.netPay.toFixed(2)}).`;
    }
  }

  if (claimed.length !== computed.length) {
    return `This cutoff now has ${computed.length} payslip(s); the page was showing ${claimed.length}.`;
  }

  return null;
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { start, end, label } = body;
    if (!ymdRe.test(String(start)) || !ymdRe.test(String(end))) {
      return NextResponse.json({ error: 'A valid cutoff start and end are required.' }, { status: 400 });
    }
    if (typeof label !== 'string' || !label.trim()) {
      return NextResponse.json({ error: 'A cutoff label is required.' }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: 'The cutoff end cannot fall before its start.' }, { status: 400 });
    }

    const cut = cutoffOf(start);
    if (end > cut.end) {
      return NextResponse.json({ error: 'The attendance range crosses into the next cutoff. Release one cutoff at a time.' }, { status: 400 });
    }
    const runKey = staffRunKey(start);
    const startDate = toDate(start);
    const endDate = toDate(end);

    const existing = await prisma.payrollPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
    if (existing?.isReleased) {
      return NextResponse.json({ error: 'This cutoff is already released. Un-finalize it first to make changes.' }, { status: 409 });
    }
    const clash = await prisma.payrollPeriod.findFirst({
      where: { isReleased: true, startDate: { lte: toDate(cut.end) }, endDate: { gte: toDate(cut.start) } },
    });
    if (clash) {
      return NextResponse.json({ error: `${clash.label} is already released for this cutoff. Un-finalize it first, then release the updated attendance.` }, { status: 409 });
    }

    const inputs = await loadStaffPayrollInputs(prisma, { start, end });
    if (inputs.staff.length === 0) {
      return NextResponse.json({ error: 'There are no staff payslips to finalize.' }, { status: 400 });
    }

    const drift = verifyAgainstClient(buildSlips(inputs, inputs.loans, runKey), body.payslips);
    if (drift) {
      return NextResponse.json(
        { error: `${drift} Refresh Staff Payroll, review the updated figures, and release again.` },
        { status: 409 }
      );
    }

    const plan = planDeductions(inputs.loans, { crew: false, runKey, endYmd: cut.end, available: staffAvailable(inputs) });

    const slips = buildSlips(inputs, withPlan(inputs.loans, plan, { runKey, endYmd: cut.end }), runKey);
    const rows = slips.map(({ employeeName, ...slip }) => ({ ...slip, payrollType: 'STAFF', withholdingTax: 0, otherDeductions: 0 }));

    const now = new Date();
    const results = await withRetry(() => prismaBase.$transaction([
      ...deductionOps(prismaBase, plan, { runKey, endYmd: cut.end }),
      prismaBase.payrollPeriod.upsert({
        where: { startDate_endDate: { startDate, endDate } },
        create: { label: label.trim(), startDate, endDate, isReleased: true, releasedAt: now, payslips: { createMany: { data: rows } } },
        update: { label: label.trim(), isReleased: true, releasedAt: now, payslips: { deleteMany: {}, createMany: { data: rows } } },
      }),
    ]));
    const period = results[results.length - 1];
    const netTotal = slips.reduce((s, p) => s + p.netPay, 0);

    await logSecurityEvent('PAYROLL_FINALIZED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'payrollPeriod',
      targetId: period.id,
      detail: `Released ${period.label}: ${slips.length} payslip(s), net ₱${netTotal.toFixed(2)}`
        + (plan.writes.length ? `; loans ₱${plan.total.toFixed(2)} deducted, ₱${plan.unpaidTotal.toFixed(2)} carried over.` : '.'),
    });

    return NextResponse.json({
      released: true,
      periodId: period.id,
      label: period.label,
      payslips: slips.length,
      loans: { applied: plan.applied, skipped: plan.skipped, settled: plan.settled, total: plan.total, short: plan.short, unpaidTotal: plan.unpaidTotal },
    });
  } catch (err) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'This cutoff was just released or its deductions applied by someone else. Refresh Staff Payroll.' }, { status: 409 });
    }
    console.error('POST /api/payroll/finalize failed:', err);
    return NextResponse.json({ error: 'Could not finalize the cutoff: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { start, end } = body;
    if (!ymdRe.test(String(start)) || !ymdRe.test(String(end))) {
      return NextResponse.json({ error: 'A valid cutoff start and end are required.' }, { status: 400 });
    }
    const startDate = toDate(start);
    const endDate = toDate(end);

    const period = await prisma.payrollPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
    if (!period) return NextResponse.json({ error: 'That cutoff has not been released.' }, { status: 404 });

    const startYmd = ymdOf(period.startDate);
    const cut = cutoffOf(startYmd);
    const keys = [...new Set([staffRunKey(startYmd), `staff-${period.label}`])];

    const touched = await prisma.loanEntry.findMany({ where: { payslipId: { in: keys }, type: 'DEDUCTION' }, select: { loanId: true } });
    const loanIds = [...new Set(touched.map((t) => t.loanId))];

    if (loanIds.length) {
      const later = await prisma.loanEntry.findFirst({
        where: { loanId: { in: loanIds }, type: 'DEDUCTION', payslipId: { startsWith: 'staff-', notIn: keys }, date: { gt: toDate(cut.end) } },
        orderBy: { date: 'desc' },
        select: { payslipId: true },
      });
      if (later) {
        return NextResponse.json({
          error: `Deductions for ${later.payslipId.slice(6)} were already taken from the same loans, and they include what this cutoff carried over. Un-finalize ${later.payslipId.slice(6)} first.`,
        }, { status: 409 });
      }
    }

    const [reversed] = await withRetry(() => prismaBase.$transaction([
      prismaBase.loanEntry.deleteMany({ where: { payslipId: { in: keys }, type: 'DEDUCTION' } }),
      prismaBase.loan.updateMany({ where: { id: { in: loanIds }, isSettled: true }, data: { isSettled: false, settledAt: null } }),
      prismaBase.payslip.deleteMany({ where: { payrollPeriodId: period.id } }),
      prismaBase.payrollPeriod.update({ where: { id: period.id }, data: { isReleased: false, releasedAt: null } }),
    ]));

    await logSecurityEvent('PAYROLL_UNFINALIZED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'payrollPeriod',
      targetId: period.id,
      detail: `Un-released ${period.label}; ${reversed.count} loan deduction(s) reversed.`,
    });

    return NextResponse.json({ unreleased: true, loanEntriesReversed: reversed.count });
  } catch (err) {
    console.error('DELETE /api/payroll/finalize failed:', err);
    return NextResponse.json({ error: 'Could not un-finalize the cutoff: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
