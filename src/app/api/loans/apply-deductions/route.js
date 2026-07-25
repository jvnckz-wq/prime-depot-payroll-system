import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

const isCrew = (position) => position === 'DRIVER' || position === 'PAHINANTE';

/// POST /api/loans/apply-deductions
/// Body: { scope: 'crew' | 'staff', runKey: string }
///
/// Deducts one instalment from every eligible loan in the group. The runKey
/// (e.g. "crew-2026-07-25" or "staff-May 01–15") is stamped on each entry it
/// writes. That stamp is the idempotency guard: run the same key twice and the
/// second pass finds the stamp already there and skips the loan, so a
/// double-click or a retry can never deduct twice.
///
/// No interactive transaction is used — the Neon pooler doesn't run those
/// reliably — and because the run is idempotent, finishing a partial run later
/// simply completes the rest without ever double-charging.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const scope = body.scope === 'staff' ? 'staff' : 'crew';
    const runKey = typeof body.runKey === 'string' ? body.runKey.trim() : '';
    if (!runKey) return NextResponse.json({ error: 'Missing run key.' }, { status: 400 });

    // All active loans + their employee and ledger. Group is decided in JS.
    const loans = await prisma.loan.findMany({
      where: { isPaused: false, isSettled: false },
      include: { employee: true, entries: true },
    });

    const eligible = loans.filter((l) =>
      scope === 'crew' ? isCrew(l.employee?.position) : !isCrew(l.employee?.position)
    );

    let applied = 0;
    let skipped = 0;
    let total = 0;

    for (const loan of eligible) {
      // Already deducted under this run key — leave it alone.
      if (loan.entries.some((e) => e.payslipId === runKey)) { skipped++; continue; }

      const balance = loan.entries.reduce(
        (b, e) => (e.type === 'GRANT' ? b + Number(e.amount) : b - Number(e.amount)), 0);
      if (balance <= 0) continue;

      const amount = Math.min(Number(loan.deductionPerRun) || 0, balance);
      if (amount <= 0) continue;

      await prisma.loanEntry.create({
        data: { loanId: loan.id, date: new Date(), type: 'DEDUCTION', amount, note: `Payroll deduction — ${runKey}`, payslipId: runKey },
      });
      applied++;
      total += amount;
    }

    return NextResponse.json({ applied, skipped, total, eligible: eligible.length });
  } catch (err) {
    console.error('POST /api/loans/apply-deductions failed:', err);
    return NextResponse.json({ error: 'Could not apply deductions: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
