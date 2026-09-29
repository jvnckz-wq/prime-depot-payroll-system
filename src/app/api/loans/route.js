import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/auth';
import { shapeLoan } from '../../../lib/loans';
import { isCrewPosition } from '../../../lib/loans-apply';
import {
  LOAN_PURPOSES, advancedInCutoff, balanceOf, cutoffOf, isYmd, periodLabel, projectedGross, todayYmdManila, workingDaysIn,
} from '../../../lib/loan-rules';

export async function GET() {
  // Loans are Operations Head only — a Checker never sees anyone's balances.
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const loans = await prisma.loan.findMany({
      include: { employee: true, entries: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ loans: loans.map(shapeLoan) });
  } catch (err) {
    console.error('GET /api/loans failed:', err);
    return NextResponse.json({ error: 'Could not load loans.' }, { status: 500 });
  }
}

const bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
const money = (v) => Math.round(Number(v) * 100) / 100;
// Local formatter: lib/utils pulls in the xlsx library, which a route has no use for.
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/// POST /api/loans
/// Body: { employeeId, kind: 'LOAN' | 'CASH_ADVANCE', principal, date?, purpose?, perCutoff? }
///
/// Every rule the forms show is enforced again here (src/lib/loan-rules.js), so
/// nothing can be slipped past the UI by calling the API directly:
///   LOAN          purpose from the list, installment required (> 0, <= amount),
///                 and one active loan per employee (more money = top-up).
///   CASH_ADVANCE  staff only, taken in full, and the cutoff's advances together
///                 may not exceed the projected gross pay for that cutoff.
///
/// Granting writes the loan and its first ledger entry together, so the
/// balance is correct from the very first read.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const kind = body.kind === 'CASH_ADVANCE' ? 'CASH_ADVANCE' : body.kind === 'LOAN' ? 'LOAN' : null;
    if (!kind) return bad('Choose whether this is a loan or a cash advance.');

    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) return bad('Please choose the employee.');
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return bad('That employee no longer exists. Refresh and try again.');
    if (employee.status !== 'ACTIVE') return bad(`${employee.name} is inactive, so nothing can be granted.`);

    const principal = money(body.principal);
    if (!Number.isFinite(principal) || principal <= 0) return bad('Enter an amount greater than zero.');

    const date = body.date == null || body.date === '' ? todayYmdManila() : String(body.date);
    if (!isYmd(date)) return bad('The date given is not a valid date.');
    const granted = new Date(date + 'T00:00:00Z');

    let data;
    if (kind === 'LOAN') {
      const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
      if (!LOAN_PURPOSES.includes(purpose)) return bad(`Choose a purpose: ${LOAN_PURPOSES.join(', ')}.`);
      const perRun = money(body.perCutoff);
      const unit = isCrewPosition(employee.position) ? 'day' : 'cutoff';
      if (!Number.isFinite(perRun) || perRun <= 0) return bad(`Enter the deduction per ${unit}.`);
      if (perRun > principal) return bad(`The deduction per ${unit} cannot be more than the loan itself.`);

      // One active loan per employee. Extra money is a top-up on that loan so
      // there is one balance and one installment to follow.
      const current = await prisma.loan.findMany({
        where: { employeeId, type: 'LOAN', isSettled: false },
        include: { employee: true, entries: true },
      });
      const open = current.map(shapeLoan).find((l) => balanceOf(l) > 0);
      if (open) {
        return bad(`${employee.name} already has an active loan (balance ${peso(balanceOf(open))}). Add to it with a top-up instead.`, 409, { activeLoanId: open.id });
      }
      data = { employeeId, type: 'LOAN', note: purpose, principal, deductionPerRun: perRun, dateGranted: granted };
    } else {
      if (isCrewPosition(employee.position)) return bad('Crew are paid daily, so cash advances are for office staff only.');

      // Hard limit: projected gross pay for the cutoff the advance falls in,
      // minus what was already advanced in that cutoff.
      const period = cutoffOf(date);
      const limit = projectedGross(employee.dailyRate, period);
      const siblings = await prisma.loan.findMany({
        where: { employeeId, type: 'CASH_ADVANCE', dateGranted: { gte: new Date(period.start + 'T00:00:00Z'), lte: new Date(period.end + 'T00:00:00Z') } },
        include: { employee: true, entries: true },
      });
      const already = advancedInCutoff(siblings.map(shapeLoan), employeeId, period);
      const room = money(limit - already);
      if (principal > room + 0.004) {
        return bad(
          `Over the limit for ${periodLabel(period)}: ${workingDaysIn(period)} working days × ${peso(employee.dailyRate)} = ${peso(limit)}`
          + (already > 0 ? `, ${peso(already)} already advanced` : '')
          + `. At most ${peso(Math.max(0, room))} can be advanced.`,
        );
      }
      // Taken in full on the cutoff's payroll: the installment is the whole amount.
      data = { employeeId, type: 'CASH_ADVANCE', note: 'Cash Advance', principal, deductionPerRun: principal, dateGranted: granted };
    }

    const loan = await prisma.loan.create({
      data: { ...data, entries: { create: [{ date: granted, type: 'GRANT', amount: principal, note: kind === 'LOAN' ? `${data.note} loan` : 'Cash advance' }] } },
      include: { employee: true, entries: true },
    });
    return NextResponse.json({ loan: shapeLoan(loan) });
  } catch (err) {
    console.error('POST /api/loans failed:', err);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
