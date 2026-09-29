import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { shapeEmployee } from '@/lib/employees';
import { shapeLoan } from '@/lib/loans';
import { deductionOps, isCrewPosition } from '@/lib/loans-apply';
import { planDeductions, todayYmdManila } from '@/lib/loan-rules';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Ledger key for the loan deductions taken from one employee's final pay. Like
// a payroll run key, it is the idempotency stamp: recording twice finds it and
// skips, and Undo deletes exactly these entries.
const finalKey = (employeeId) => `final-${employeeId}`;

const loadFinalLoans = (employeeId) => prisma.loan.findMany({
  where: { employeeId, OR: [{ isSettled: false }, { entries: { some: { payslipId: finalKey(employeeId) } } }] },
  include: { employee: true, entries: true },
  orderBy: { createdAt: 'asc' },
});

/// POST /api/payroll/final-pay  { employeeId, finalPayTotal }
///
/// Deducts what the employee still owes from their final pay (Phase 3
/// assumption, pending the client; the signed acknowledgment slip carries the
/// employee's consent). Same rules as payroll: cash advances first, then loans,
/// never more than the final pay (net stops at P0). Here the WHOLE balance is
/// due, paused or not. Whatever the final pay cannot cover stays on the ledger
/// as the unpaid balance: nothing is written off by the system.
///
/// The final pay itself is worked out on the form (editable, as on the
/// client's FINAL PAY sheet), so its total is the cap the Operations Head sends.
/// The server still decides the order, the amounts, and the balances.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    const total = round2(body.finalPayTotal);
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
    if (!Number.isFinite(total) || total < 0) return NextResponse.json({ error: 'Enter a final pay total of zero or more.' }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    const key = finalKey(employeeId);
    const today = todayYmdManila();
    const loans = (await loadFinalLoans(employeeId)).map(shapeLoan);
    const plan = planDeductions(loans, { crew: isCrewPosition(emp.position), runKey: key, endYmd: today, available: { [employeeId]: total }, full: true });
    if (loans.some((l) => l.entries.some((e) => e.payslipId === key))) {
      return NextResponse.json({ error: 'The deduction from this final pay is already recorded. Undo it first to record it again.' }, { status: 409 });
    }
    if (plan.writes.length === 0) return NextResponse.json({ error: 'There is nothing owed to deduct.' }, { status: 400 });

    await prisma.$transaction(deductionOps(prisma, plan, { runKey: key, endYmd: today }));
    return NextResponse.json({ recorded: true, total: plan.total, unpaidTotal: plan.unpaidTotal, settled: plan.settled });
  } catch (err) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'This deduction was just recorded. Refresh the page.' }, { status: 409 });
    console.error('POST /api/payroll/final-pay failed:', err);
    return NextResponse.json({ error: 'Could not record the deduction.' }, { status: 500 });
  }
}

/// DELETE /api/payroll/final-pay  { employeeId }  (undo, admin only)
/// Removes the final-pay deductions and re-opens any loan they had closed, in
/// one batch transaction, like un-finalizing a cutoff.
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
    const key = finalKey(employeeId);
    const touched = await prisma.loanEntry.findMany({ where: { payslipId: key, type: 'DEDUCTION' }, select: { loanId: true } });
    if (!touched.length) return NextResponse.json({ error: 'Nothing was recorded from this final pay.' }, { status: 404 });
    const loanIds = [...new Set(touched.map((t) => t.loanId))];
    const [removed] = await prisma.$transaction([
      prisma.loanEntry.deleteMany({ where: { payslipId: key, type: 'DEDUCTION' } }),
      prisma.loan.updateMany({ where: { id: { in: loanIds }, isSettled: true }, data: { isSettled: false, settledAt: null } }),
    ]);
    return NextResponse.json({ undone: true, entries: removed.count });
  } catch (err) {
    console.error('DELETE /api/payroll/final-pay failed:', err);
    return NextResponse.json({ error: 'Could not undo the deduction.' }, { status: 500 });
  }
}

/// GET /api/payroll/final-pay?employeeId=ID
/// Auto-fill context for a resigning employee's final pay: the last imported
/// cutoff's days worked + OT/allowances, and the total basic salary they've
/// earned this year (for the pro-rated 13th month). Everything is editable on
/// the form — this is just the starting point.
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    const shaped = shapeEmployee(emp);

    // Latest imported cutoff.
    const latest = await prisma.importBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { importedAt: 'desc' },
    });
    const period = latest && latest.periodStart && latest.periodEnd
      ? { start: latest.periodStart, end: latest.periodEnd } : null;

    // This employee's attendance for that cutoff.
    let days = 0, otWeekdayMins = 0, otWeekendMins = 0, lateMins = 0;
    if (period) {
      const rows = await prisma.attendance.findMany({
        where: { employeeId, date: { gte: period.start, lte: period.end } },
      });
      for (const a of rows) {
        if (!a.isAbsent) days++;
        lateMins += a.tardinessMins;
        const dow = new Date(a.date).getUTCDay();
        if (dow === 0 || dow === 6) otWeekendMins += a.overtimeMins;
        else otWeekdayMins += a.overtimeMins;
      }
    }

    const hourly = shaped.rate / 8;
    const otWeekday = round2(hourly * (otWeekdayMins / 60) * 1.25);
    const otWeekend = round2(hourly * (otWeekendMins / 60) * 1.30);
    const allowance = round2(Number(shaped.allowance) || 0);
    const otAndAllowances = round2(otWeekday + otWeekend + allowance);

    // Total basic salary earned this year, from released payslips (for the
    // pro-rated 13th month). May be incomplete if older cutoffs predate the
    // system, so the form lets the admin adjust it.
    const yearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00.000Z`);
    const yslips = await prisma.payslip.findMany({
      where: { employeeId, payrollType: 'STAFF', payrollPeriod: { startDate: { gte: yearStart } } },
      select: { basicPay: true },
    });
    const yearBasic = round2(yslips.reduce((s, p) => s + Number(p.basicPay), 0));

    // Unused leave for the year, monetised in the final pay. Days taken are the
    // attendance rows flagged as leave; the balance is credits minus those.
    const leaveUsed = await prisma.attendance.count({
      where: { employeeId, isLeave: true, date: { gte: yearStart } },
    });
    const leaveCredits = shaped.leaveCredits ?? 5;
    const leaveRemaining = Math.max(0, leaveCredits - leaveUsed);

    // Loans and cash advances still owed, plus any already settled from this
    // final pay (so a recorded deduction keeps showing on the sheet).
    const loans = (await loadFinalLoans(employeeId)).map(shapeLoan);

    return NextResponse.json({
      finalKey: finalKey(employeeId),
      loans,
      employee: { id: shaped.id, name: shaped.name, position: shaped.position, rate: shaped.rate },
      period: period ? { start: ymd(period.start), end: ymd(period.end) } : null,
      days,
      otAndAllowances,
      yearBasic,
      yearPayslips: yslips.length,
      leaveCredits,
      leaveUsed,
      leaveRemaining,
    });
  } catch (err) {
    console.error('GET /api/payroll/final-pay failed:', err);
    return NextResponse.json({ error: 'Could not load final-pay details.' }, { status: 500 });
  }
}
