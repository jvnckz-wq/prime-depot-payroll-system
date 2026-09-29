// Shared loan-deduction core. Both "Apply Deductions" buttons and the
// Finalize/Release flow deduct through THIS module, so the money logic lives in
// exactly one place.
//
// What to take is decided by planDeductions (src/lib/loan-rules.js), a pure
// function the browser also runs to preview a run. This module only loads the
// loans and turns the plan into database writes.

import { isYmd, planDeductions } from './loan-rules';
import { shapeLoan } from './loans';

export const isCrewPosition = (position) =>
  position === 'DRIVER' || position === 'PAHINANTE';

// Which day closes this run: an explicit cutoff end wins; a crew key
// ("crew-YYYY-MM-DD") carries its own day. Without either, no grant-date
// filter is applied.
export function runEndOf(runKey, cutoffEnd) {
  if (isYmd(cutoffEnd)) return cutoffEnd;
  const m = /^crew-(\d{4}-\d{2}-\d{2})$/.exec(String(runKey || ''));
  return m ? m[1] : null;
}

// The date a run's entries carry: the last day it pays for (Sep 30 for the
// Sep 16-30 payroll, the day itself for crew), not the moment of the click.
// The ledger then reads in cutoff order, the carry-over can find "the entry
// before this run", and createdAt still records when it was actually written.
export const runDateOf = (endYmd) => (isYmd(endYmd) ? new Date(`${endYmd}T00:00:00.000Z`) : new Date());

// Prisma writes for a plan: one ledger entry per loan (a P0 entry too, when
// nothing could be taken: it is the idempotency stamp and shows why), and the
// loan closed in the same batch when this deduction pays it off. Returned, not
// run, so Finalize can put them in the same transaction as the payslips.
export function deductionOps(prisma, plan, { runKey, endYmd }) {
  const date = runDateOf(endYmd);
  const now = new Date();
  const ops = [];
  for (const w of plan.writes) {
    ops.push(prisma.loanEntry.create({
      data: { loanId: w.loanId, date, type: 'DEDUCTION', amount: w.amount, shortfall: w.shortfall, note: w.remark, payslipId: runKey },
    }));
    if (w.settles) ops.push(prisma.loan.update({ where: { id: w.loanId }, data: { isSettled: true, settledAt: now } }));
  }
  return ops;
}

// Every loan a run could touch: the open ones, plus any already stamped with
// this run's key (even if that deduction closed them), because money already
// taken by this run is no longer available to it.
export async function loadRunLoans(prisma, runKey) {
  const rows = await prisma.loan.findMany({
    where: { OR: [{ isSettled: false }, { entries: { some: { payslipId: runKey } } }] },
    include: { employee: true, entries: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(shapeLoan);
}

// Deduct from every eligible loan in scope, from pay that is actually there.
// `available` maps employeeId -> pay left after contributions and tardiness
// (staff) or that day's earnings (crew); see src/lib/payroll-inputs.js.
//
// Idempotent on runKey: a loan already stamped with it is skipped, so a
// double-click, a retry, or a re-finalize can never deduct twice. Everything is
// written in ONE batch transaction (an array, not an interactive callback: the
// Neon pooler drops interactive transactions), so a run is all or nothing.
export async function applyLoanDeductions(prisma, { scope, runKey, cutoffEnd = null, available }) {
  const key = typeof runKey === 'string' ? runKey.trim() : '';
  if (!key) throw new Error('Missing run key.');
  const crew = scope === 'crew';
  const endYmd = runEndOf(key, cutoffEnd);

  const loans = await loadRunLoans(prisma, key);
  const plan = planDeductions(loans, { crew, runKey: key, endYmd, available });
  const ops = deductionOps(prisma, plan, { runKey: key, endYmd });
  if (ops.length) await prisma.$transaction(ops);

  return {
    applied: plan.applied,
    skipped: plan.skipped,
    settled: plan.settled,
    total: plan.total,
    eligible: plan.eligible,
    short: plan.short,
    unpaidTotal: plan.unpaidTotal,
  };
}
