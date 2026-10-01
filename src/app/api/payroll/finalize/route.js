import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { deductionOps } from '@/lib/server/services/loans-apply';
import { cutoffOf, planDeductions, staffRunKey, withPlan } from '@/lib/loan-rules';
import { computeStaffPayroll } from '@/lib/payroll';
import { loadStaffPayrollInputs, staffAvailable, toDate } from '@/lib/server/services/payroll-inputs';

// A released cutoff is stored as a snapshot: once written, its figures never
// move even if rates, statutory tables, or employee records change later.
//
// Every peso in that snapshot is computed HERE, on the server, from the
// database. It used to be taken from the request body — the browser ran
// computeStaffPayroll, posted the results, and this route wrote down whatever
// it was told, clamping each figure to "a positive number with two decimals"
// but never checking it was the RIGHT number. Anyone able to reach the endpoint
// could name their own net pay and have it stored as the permanent record of
// what the company owed.
//
// The fix is not more validation of the incoming numbers; it is not to need
// them. computeStaffPayroll is a pure function, so the server runs the very
// same code over the very same inputs and stores its own answer. The client's
// figures are still accepted, but only to be compared — see verifyAgainstClient
// below, which turns a stale browser tab into a clear error instead of a
// silently different payslip.

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

/// Every staff payslip of a cutoff, from the loaded inputs and a set of loans.
///
/// The employee set is exactly what Staff Payroll shows on screen (see
/// loadStaffPayrollInputs): the stored snapshot must match the reviewed screen,
/// and a server that quietly included different people would defeat that just
/// as thoroughly as trusting the browser's arithmetic did.
///
/// `loans` is passed in so the same function can build the payslips twice:
/// once from the ledger as it is now (to compare with the screen) and once
/// with this cutoff's deductions added (what gets stored).
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
      // MP1 and MP2 apart, as computed: on a short payslip MP2 (voluntary) is
      // only what fits, and the company covers what the pay could not.
      pagibigDeduction: money(calc.mp1),
      mp2Deduction: money(calc.mp2),
      companyCover: money(calc.companyCover),
      tardinessDeduction: money(calc.tardiness),
      // Loans and cash advances are stored apart (Phase 2), as the payslip
      // shows them. Snapshots from before kept both in loanDeduction.
      loanDeduction: money(calc.loanDeduction),
      advanceDeduction: money(calc.advanceDeduction),
      totalDeductions: money(calc.totalDeductions),
      netPay: money(calc.net),
    };
  });
}

// A centavo of slack per payslip, for the last bit of floating-point rounding.
const CENTAVO = 0.011;

/// Compare what the browser thought it was releasing against what the server
/// computed, and describe the first real disagreement.
///
/// This is not a security check — the stored figures are the server's either
/// way, so a tampered payload changes nothing. It exists for the honest case: a
/// tab left open since before an attendance re-import or a rate change would
/// otherwise release numbers the admin never actually saw. Better to stop and
/// say "refresh" than to store a payslip nobody reviewed.
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

    // A slip that carries no net pay at all is skipped rather than read as
    // zero — Number(null) is 0, which would otherwise be reported as a wild
    // mismatch. Nothing is lost by skipping: the amount stored is the server's
    // either way, and this comparison exists only to catch a stale screen.
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

/// POST /api/payroll/finalize
/// Body: { start, end, label, payslips? }
///
/// `start`, `end`, and `label` identify the cutoff. `payslips` is OPTIONAL and
/// advisory — send what the screen was showing and this route will refuse to
/// release if it no longer matches what the database says, which catches a tab
/// left open across an attendance re-import. Omit it and the cutoff is released
/// from the database alone. Either way, the amounts written are the ones
/// computed here.
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

    // The attendance range may stop early (Sep 16-29), but it always belongs to
    // one calendar cutoff, and that cutoff is what the loans are keyed on.
    const cut = cutoffOf(start);
    if (end > cut.end) {
      return NextResponse.json({ error: 'The attendance range crosses into the next cutoff. Release one cutoff at a time.' }, { status: 400 });
    }
    const runKey = staffRunKey(start);
    const startDate = toDate(start);
    const endDate = toDate(end);

    // Guard: don't silently re-release. Un-finalize first if a correction is needed.
    const existing = await prisma.payrollPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
    if (existing?.isReleased) {
      return NextResponse.json({ error: 'This cutoff is already released. Un-finalize it first to make changes.' }, { status: 409 });
    }
    // Guard: one release per calendar cutoff. Without it, Sep 16-29 and a later
    // Sep 16-30 import could both be released: two snapshots of one payroll.
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

    // 1. Compare with the screen BEFORE anything is written. The screen shows
    //    only deductions already applied, so it is compared with the ledger as
    //    it is now. (Comparing after deducting made the first Finalize fail
    //    whenever Apply had not been pressed, with the loans already charged.)
    const drift = verifyAgainstClient(buildSlips(inputs, inputs.loans, runKey), body.payslips);
    if (drift) {
      return NextResponse.json(
        { error: `${drift} Refresh Staff Payroll, review the updated figures, and release again.` },
        { status: 409 }
      );
    }

    // 2. This cutoff's deductions, from pay that is actually there (advances
    //    first, then the loan installment, net never below P0). Loans already
    //    applied with "Apply Cutoff Deductions" are skipped, not taken twice.
    const plan = planDeductions(inputs.loans, { crew: false, runKey, endYmd: cut.end, available: staffAvailable(inputs) });

    // 3. The payslips as they will be once those deductions are in the ledger.
    const slips = buildSlips(inputs, withPlan(inputs.loans, plan, { runKey, endYmd: cut.end }), runKey);
    const rows = slips.map(({ employeeName, ...slip }) => ({ ...slip, payrollType: 'STAFF', withholdingTax: 0, otherDeductions: 0 }));
    // withholdingTax: most staff fall below the taxable threshold; BIR compute is future work.

    // 4. ONE batch transaction: ledger entries, loans closed, the period, and
    //    every payslip. All of it is stored or none of it is, so a failure can
    //    never leave a released cutoff with half its payslips.
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
    // Unique (loanId, payslipId): another release of this cutoff got there first.
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'This cutoff was just released or its deductions applied by someone else. Refresh Staff Payroll.' }, { status: 409 });
    }
    console.error('POST /api/payroll/finalize failed:', err);
    return NextResponse.json({ error: 'Could not finalize the cutoff: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}

/// DELETE /api/payroll/finalize  — un-finalize (admin only).
/// Body: { start, end }. Reverses the release: removes the snapshot payslips,
/// reverses this cutoff's loan deductions, and marks the period unreleased so it
/// can be recomputed and released again cleanly.
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

    // This cutoff's key, plus the older label-based key (from before keys named
    // the calendar cutoff), so a period released before Phase 2 still reverses.
    const startYmd = ymdOf(period.startDate);
    const cut = cutoffOf(startYmd);
    const keys = [...new Set([staffRunKey(startYmd), `staff-${period.label}`])];

    const touched = await prisma.loanEntry.findMany({ where: { payslipId: { in: keys }, type: 'DEDUCTION' }, select: { loanId: true } });
    const loanIds = [...new Set(touched.map((t) => t.loanId))];

    // Newest first. If a LATER cutoff already deducted from the same loans, its
    // installment was built on this cutoff's carry-over; removing this one
    // underneath it would leave that later figure wrong. Undo the later one first.
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

    // Reverse this cutoff's loan deductions so balances are restored (P0 entries
    // too, so any carry-over reverts with them), then drop the snapshot and mark
    // the period unreleased. A loan that this cutoff paid off was closed
    // (isSettled) by the same run, so it is re-opened here or it would sit in
    // History with money still owed. One batch transaction: the reversal
    // happens completely or not at all.
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
