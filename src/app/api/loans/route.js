import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { shapeLoan } from '@/lib/server/services/loans';
import { isDailyPosition } from '@/lib/positions';
import {
  LOAN_MAX_BALANCE, LOAN_PURPOSES, PURPOSE_ENUM, advancedInCutoff, balanceOf, cutoffOf, isYmd, periodLabel, projectedGross, todayYmdManila, workingDaysIn,
} from '@/lib/loan-rules';

export async function GET() {
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
const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      const unit = isDailyPosition(employee.position) ? 'day' : 'cutoff';
      if (!Number.isFinite(perRun) || perRun <= 0) return bad(`Enter the deduction per ${unit}.`);
      if (perRun > principal) return bad(`The deduction per ${unit} cannot be more than the loan itself.`);
      if (principal > LOAN_MAX_BALANCE) return bad(`A loan can be at most ${peso(LOAN_MAX_BALANCE)}.`);

      const current = await prisma.loan.findMany({
        where: { employeeId, type: 'LOAN', isSettled: false },
        include: { employee: true, entries: true },
      });
      const open = current.map(shapeLoan).find((l) => balanceOf(l) > 0);
      if (open) {
        return bad(`${employee.name} already has an active loan (balance ${peso(balanceOf(open))}). Add to it with a top-up instead.`, 409, { activeLoanId: open.id });
      }
      data = { employeeId, type: 'LOAN', purpose: PURPOSE_ENUM[purpose], principal, deductionPerRun: perRun, dateGranted: granted };
    } else {
      if (isDailyPosition(employee.position)) return bad('Crew are paid daily, so cash advances are for office staff only.');

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
      data = { employeeId, type: 'CASH_ADVANCE', note: 'Cash Advance', principal, deductionPerRun: principal, dateGranted: granted };
    }

    const loan = await prisma.loan.create({
      data: { ...data, entries: { create: [{ date: granted, type: 'GRANT', amount: principal, note: kind === 'LOAN' ? `${body.purpose.trim()} loan` : 'Cash advance' }] } },
      include: { employee: true, entries: true },
    });
    return NextResponse.json({ loan: shapeLoan(loan) });
  } catch (err) {
    console.error('POST /api/loans failed:', err);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
