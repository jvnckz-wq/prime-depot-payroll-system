// Shared loan-deduction core. Both the standalone "Apply Cutoff Deductions"
// button and the Finalize/Release flow deduct instalments through THIS function,
// so the money logic lives in exactly one place — the manifest/payslip lesson
// applied to the loan ledger.

export const isCrewPosition = (position) =>
  position === 'DRIVER' || position === 'PAHINANTE';

// Deduct one instalment from every eligible, unsettled loan in scope, stamping
// each ledger entry with runKey. The stamp is the idempotency guard: run the
// same key twice and the second pass finds it already there and skips, so a
// double-click, a retry, or a re-finalize can never deduct twice.
//
// No interactive transaction (the Neon pooler doesn't run those reliably); the
// run is idempotent, so a partial run simply completes later without ever
// double-charging.
export async function applyLoanDeductions(prisma, { scope, runKey }) {
  const key = typeof runKey === 'string' ? runKey.trim() : '';
  if (!key) throw new Error('Missing run key.');
  const group = scope === 'crew' ? 'crew' : 'staff';

  const loans = await prisma.loan.findMany({
    where: { isPaused: false, isSettled: false },
    include: { employee: true, entries: true },
  });

  const eligible = loans.filter((l) =>
    group === 'crew' ? isCrewPosition(l.employee?.position) : !isCrewPosition(l.employee?.position),
  );

  let applied = 0;
  let skipped = 0;
  let total = 0;

  for (const loan of eligible) {
    // Already deducted under this run key — leave it alone.
    if (loan.entries.some((e) => e.payslipId === key)) { skipped++; continue; }

    const balance = loan.entries.reduce(
      (b, e) => (e.type === 'GRANT' ? b + Number(e.amount) : b - Number(e.amount)), 0);
    if (balance <= 0) continue;

    const amount = Math.min(Number(loan.deductionPerRun) || 0, balance);
    if (amount <= 0) continue;

    await prisma.loanEntry.create({
      data: { loanId: loan.id, date: new Date(), type: 'DEDUCTION', amount, note: `Payroll deduction — ${key}`, payslipId: key },
    });
    applied++;
    total += amount;
  }

  return { applied, skipped, total, eligible: eligible.length };
}
