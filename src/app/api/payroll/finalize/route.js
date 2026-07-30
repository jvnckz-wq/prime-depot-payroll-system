import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { applyLoanDeductions } from '../../../../lib/loans-apply';

// A released cutoff is stored as a snapshot: once written, its figures never
// move even if rates, statutory tables, or employee records change later. The
// numbers come from the same computeStaffPayroll the admin just reviewed on
// screen, so "what you saw is what got finalized." The loan ledger, being
// money-critical, is applied server-side through the shared, idempotent
// applyLoanDeductions rather than trusting the browser.

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (s) => new Date(`${s}T00:00:00.000Z`);
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const intOf = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/// POST /api/payroll/finalize
/// Body: { start, end, label, payslips: [{ employeeId, daysPresent, basicPay,
///   overtimeWeekday, overtimeWeekend, allowances, grossPay, sssDeduction,
///   philhealthDeduction, pagibigDeduction, mp2Deduction, tardinessDeduction,
///   loanDeduction, totalDeductions, netPay }] }
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
    const slips = Array.isArray(body.payslips) ? body.payslips : [];
    if (slips.length === 0) {
      return NextResponse.json({ error: 'There are no staff payslips to finalize.' }, { status: 400 });
    }

    const startDate = toDate(start);
    const endDate = toDate(end);
    const runKey = `staff-${label.trim()}`;

    // Guard: don't silently re-release. Un-finalize first if a correction is needed.
    const existing = await prisma.payrollPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
    if (existing?.isReleased) {
      return NextResponse.json({ error: 'This cutoff is already released. Un-finalize it first to make changes.' }, { status: 409 });
    }

    // Loan ledger first — idempotent, so a retry never double-charges.
    const loanResult = await applyLoanDeductions(prisma, { scope: 'staff', runKey });

    // Create or reuse the period, then (re)write its snapshot cleanly.
    const period = existing
      ? await prisma.payrollPeriod.update({ where: { id: existing.id }, data: { label: label.trim(), isReleased: true, releasedAt: new Date() } })
      : await prisma.payrollPeriod.create({ data: { label: label.trim(), startDate, endDate, isReleased: true, releasedAt: new Date() } });

    await prisma.payslip.deleteMany({ where: { payrollPeriodId: period.id } });

    let written = 0;
    for (const s of slips) {
      const employeeId = typeof s.employeeId === 'string' ? s.employeeId : String(s.employeeId ?? '');
      if (!employeeId) continue;
      await prisma.payslip.create({
        data: {
          payrollPeriodId: period.id,
          employeeId,
          payrollType: 'STAFF',
          daysPresent: intOf(s.daysPresent),
          basicPay: money(s.basicPay),
          overtimeWeekday: money(s.overtimeWeekday),
          overtimeWeekend: money(s.overtimeWeekend),
          allowances: money(s.allowances),
          grossPay: money(s.grossPay),
          sssDeduction: money(s.sssDeduction),
          philhealthDeduction: money(s.philhealthDeduction),
          pagibigDeduction: money(s.pagibigDeduction),
          mp2Deduction: money(s.mp2Deduction),
          withholdingTax: 0, // Most staff fall below the taxable threshold; BIR compute is future work.
          loanDeduction: money(s.loanDeduction),
          tardinessDeduction: money(s.tardinessDeduction),
          otherDeductions: 0,
          totalDeductions: money(s.totalDeductions),
          netPay: money(s.netPay),
        },
      });
      written++;
    }

    return NextResponse.json({
      released: true,
      periodId: period.id,
      label: period.label,
      payslips: written,
      loans: loanResult,
    });
  } catch (err) {
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

    const runKey = `staff-${period.label}`;

    // Reverse this cutoff's loan deductions so balances are restored, then drop
    // the snapshot and mark the period unreleased.
    const reversed = await prisma.loanEntry.deleteMany({ where: { payslipId: runKey, type: 'DEDUCTION' } });
    await prisma.payslip.deleteMany({ where: { payrollPeriodId: period.id } });
    await prisma.payrollPeriod.update({ where: { id: period.id }, data: { isReleased: false, releasedAt: null } });

    return NextResponse.json({ unreleased: true, loanEntriesReversed: reversed.count });
  } catch (err) {
    console.error('DELETE /api/payroll/finalize failed:', err);
    return NextResponse.json({ error: 'Could not un-finalize the cutoff: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
