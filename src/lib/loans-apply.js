// Shared loan-deduction core. Both the standalone "Apply Cutoff Deductions"
// button and the Finalize/Release flow deduct instalments through THIS function,
// so the money logic lives in exactly one place — the manifest/payslip lesson
// applied to the loan ledger.

import { dueAmount, grantedBy, isYmd } from './loan-rules';
import { shapeLoan } from './loans';

export const isCrewPosition = (position) =>
  position === 'DRIVER' || position === 'PAHINANTE';

// Which day closes this run: an explicit cutoff end wins; a crew key
// ("crew-YYYY-MM-DD") carries its own day. Without either (an old caller), no
// grant-date filter is applied, which is the previous behaviour.
export function runEndOf(runKey, cutoffEnd) {
  if (isYmd(cutoffEnd)) return cutoffEnd;
  const m = /^crew-(\d{4}-\d{2}-\d{2})$/.exec(String(runKey || ''));
  return m ? m[1] : null;
}

// Ledger remark for a deduction, e.g. "Payroll September 16–30, 2026".
const remarkFor = (key) => (key.startsWith('staff-') ? `Payroll ${key.slice(6)}` : key.startsWith('crew-') ? `Crew pay ${key.slice(5)}` : `Payroll ${key}`);

// Deduct from every eligible, open loan in scope, stamping each ledger entry
// with runKey. The stamp is the idempotency guard: run the same key twice and
// the second pass finds it already there and skips, so a double-click, a
// retry, or a re-finalize can never deduct twice.
//
// Rules (src/lib/loan-rules.js): a cash advance is taken in full, a loan takes
// one installment, and only money given on or before the run's last day is
// touched. A deduction that brings the balance to zero also closes the loan
// (isSettled + settledAt), which is what moves it to History.
//
// Everything is written in ONE batch transaction (an array, not an interactive
// callback: the Neon pooler drops interactive transactions). The run is all or
// nothing, so there is no half-applied cutoff to clean up.
export async function applyLoanDeductions(prisma, { scope, runKey, cutoffEnd = null }) {
  const key = typeof runKey === 'string' ? runKey.trim() : '';
  if (!key) throw new Error('Missing run key.');
  const group = scope === 'crew' ? 'crew' : 'staff';
  const endYmd = runEndOf(key, cutoffEnd);

  const rows = await prisma.loan.findMany({
    where: { isPaused: false, isSettled: false },
    include: { employee: true, entries: true },
  });

  const eligible = rows.filter((l) =>
    group === 'crew' ? isCrewPosition(l.employee?.position) : !isCrewPosition(l.employee?.position),
  );

  const ops = [];
  let applied = 0;
  let skipped = 0;
  let settled = 0;
  let total = 0;
  const now = new Date();

  for (const row of eligible) {
    // Already deducted under this run key — leave it alone.
    if (row.entries.some((e) => e.payslipId === key)) { skipped++; continue; }

    const loan = shapeLoan(row);
    if (!grantedBy(loan, endYmd)) continue;

    const amount = dueAmount(loan);
    if (amount <= 0) continue;

    ops.push(prisma.loanEntry.create({
      data: { loanId: row.id, date: now, type: 'DEDUCTION', amount, note: remarkFor(key), payslipId: key },
    }));
    applied++;
    total += amount;

    // Paid off by this deduction: close it in the same batch.
    const remaining = loan.entries.reduce((b, e) => (e.type === 'grant' ? b + e.amount : b - e.amount), 0) - amount;
    if (remaining <= 0.004) {
      ops.push(prisma.loan.update({ where: { id: row.id }, data: { isSettled: true, settledAt: now } }));
      settled++;
    }
  }

  if (ops.length) await prisma.$transaction(ops);

  return { applied, skipped, settled, total: Math.round(total * 100) / 100, eligible: eligible.length };
}
