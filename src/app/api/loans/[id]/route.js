import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { shapeLoan } from '../../../../lib/loans';

const balanceOf = (entries) =>
  entries.reduce((b, e) => (e.type === 'GRANT' ? b + Number(e.amount) : b - Number(e.amount)), 0);

/// PATCH /api/loans/:id
///  - { isPaused: true|false }  → pause or resume deductions (the loan stays).
///  - { settle: true }          → clear the remaining balance with one final
///                                deduction and lock the loan as fully paid.
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

    const data = {};
    if (typeof body.isPaused === 'boolean') data.isPaused = body.isPaused;
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

    const loan = await prisma.loan.update({ where: { id }, data, include: { employee: true, entries: true } });
    return NextResponse.json({ loan: shapeLoan(loan) });
  } catch (err) {
    console.error('PATCH /api/loans/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the loan.' }, { status: 500 });
  }
}
