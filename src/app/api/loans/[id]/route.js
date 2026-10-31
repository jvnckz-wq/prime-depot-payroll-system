// PATCH /api/loans/[id]: settle, pause or resume one loan.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { shapeLoan } from '@/lib/server/services/loans';

const balanceOf = (entries) =>
  entries.reduce((b, e) => (e.type === 'GRANT' ? b + Number(e.amount) : b - Number(e.amount)), 0);
const money = (v) => Math.round(Number(v) * 100) / 100;

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
          create: [{ date: new Date(), type: 'DEDUCTION', amount: balance, note: 'Marked fully paid, remaining balance cleared' }],
        };
      }
      const loan = await prisma.loan.update({ where: { id }, data, include: { employee: true, entries: true } });
      return NextResponse.json({ loan: shapeLoan(loan) });
    }

    const data = {};
    if (typeof body.isPaused === 'boolean') {
      if (existing.type === 'CASH_ADVANCE' && body.isPaused) {
        return NextResponse.json({ error: 'A cash advance cannot be paused. It is deducted in full on its cutoff.' }, { status: 400 });
      }
      data.isPaused = body.isPaused;
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

    const loan = await prisma.loan.update({ where: { id }, data, include: { employee: true, entries: true } });
    const shaped = shapeLoan(loan);
    if (data.isPaused !== existing.isPaused) {
      const balance = Math.max(0, money(balanceOf(existing.entries)));
      await logSecurityEvent(data.isPaused ? 'LOAN_PAUSED' : 'LOAN_RESUMED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'loan',
        targetId: id,
        detail: `${loan.employee?.name || 'Employee ' + existing.employeeId}, ${shaped.purpose || 'Loan'}, balance ₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      });
    }
    return NextResponse.json({ loan: shaped });
  } catch (err) {
    console.error('PATCH /api/loans/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the loan.' }, { status: 500 });
  }
}
