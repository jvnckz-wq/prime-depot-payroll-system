import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { shapeLoan } from '@/lib/server/services/loans';
import { LOAN_MAX_BALANCE, isYmd, todayYmdManila } from '@/lib/loan-rules';

const balanceOf = (entries) =>
  entries.reduce((b, e) => (e.type === 'GRANT' ? b + Number(e.amount) : b - Number(e.amount)), 0);
const money = (v) => Math.round(Number(v) * 100) / 100;

/// PATCH /api/loans/:id
///  - { isPaused: true|false }  → pause or resume deductions (the loan stays).
///                                Loans only; a cash advance cannot be paused.
///  - { topUp: { amount, date?, perCutoff? } } → add money to an active loan.
///  - { settle: true }          → clear the remaining balance with one final
///                                deduction and lock the loan as fully paid.
///                                No longer on the Loans page (loans close by
///                                themselves at zero); kept for corrections.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();
    const existing = await prisma.loan.findUnique({ where: { id }, include: { entries: true } });
    if (!existing) return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });

    if (body.settle) {
      const balance = balanceOf(existing.entries);
      const data = { isSettled: true, settledAt: new Date() };
      if (balance > 0) {
        data.entries = {
          create: [{ date: new Date(), type: 'DEDUCTION', amount: balance, note: 'Marked fully paid — remaining balance cleared' }],
        };
      }
      const loan = await prisma.loan.update({ where: { id }, data, include: { employee: true, entries: true } });
      return NextResponse.json({ loan: shapeLoan(loan) });
    }

    // Top-up: more money on the same loan, so there is still one balance and
    // one installment (the one-active-loan rule). Written as a single update
    // with a nested ledger entry, which the database applies atomically.
    if (body.topUp) {
      if (existing.type !== 'LOAN') return NextResponse.json({ error: 'Only a loan can be topped up. Record a new cash advance instead.' }, { status: 400 });
      const balance = balanceOf(existing.entries);
      if (existing.isSettled || balance <= 0) return NextResponse.json({ error: 'This loan is already fully paid. Record a new loan instead.' }, { status: 400 });
      const amount = money(body.topUp.amount);
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter a top-up amount greater than zero.' }, { status: 400 });
      if (balance + amount > LOAN_MAX_BALANCE + 0.004) {
        const room = Math.max(0, Math.round((LOAN_MAX_BALANCE - balance) * 100) / 100);
        return NextResponse.json({ error: `A loan balance can be at most ₱${LOAN_MAX_BALANCE.toLocaleString('en-PH')}. At most ₱${room.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} can be added.` }, { status: 400 });
      }
      const date = body.topUp.date == null || body.topUp.date === '' ? todayYmdManila() : String(body.topUp.date);
      if (!isYmd(date)) return NextResponse.json({ error: 'The date given is not a valid date.' }, { status: 400 });
      const data = { principal: { increment: amount } };
      if (body.topUp.perCutoff != null && body.topUp.perCutoff !== '') {
        const perRun = money(body.topUp.perCutoff);
        if (!Number.isFinite(perRun) || perRun <= 0) return NextResponse.json({ error: 'Enter a deduction greater than zero.' }, { status: 400 });
        if (perRun > balance + amount) return NextResponse.json({ error: 'The deduction cannot be more than the new balance.' }, { status: 400 });
        data.deductionPerRun = perRun;
      }
      const when = new Date(date + 'T00:00:00Z');
      data.entries = { create: [{ date: when, type: 'GRANT', amount, note: 'Top-up, added to existing loan' }] };
      const loan = await prisma.loan.update({ where: { id }, data, include: { employee: true, entries: true } });
      return NextResponse.json({ loan: shapeLoan(loan) });
    }

    const data = {};
    if (typeof body.isPaused === 'boolean') {
      // A cash advance is taken in full on its cutoff; it cannot be put off.
      if (existing.type === 'CASH_ADVANCE' && body.isPaused) {
        return NextResponse.json({ error: 'A cash advance cannot be paused. It is deducted in full on its cutoff.' }, { status: 400 });
      }
      data.isPaused = body.isPaused;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

    const loan = await prisma.loan.update({ where: { id }, data, include: { employee: true, entries: true } });
    return NextResponse.json({ loan: shapeLoan(loan) });
  } catch (err) {
    console.error('PATCH /api/loans/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the loan.' }, { status: 500 });
  }
}
