import { isYmd, planDeductions } from '../../loan-rules';
import { shapeLoan } from './loans';
import { withRetry } from '../db/db-retry';

export function runEndOf(runKey, cutoffEnd) {
  if (isYmd(cutoffEnd)) return cutoffEnd;
  const m = /^crew-(\d{4}-\d{2}-\d{2})$/.exec(String(runKey || ''));
  return m ? m[1] : null;
}

export const runDateOf = (endYmd) => (isYmd(endYmd) ? new Date(`${endYmd}T00:00:00.000Z`) : new Date());

export function deductionOps(db, plan, { runKey, endYmd }) {
  const date = runDateOf(endYmd);
  const now = new Date();
  const ops = [];
  for (const w of plan.writes) {
    ops.push(db.loanEntry.create({
      data: { loanId: w.loanId, date, type: 'DEDUCTION', amount: w.amount, shortfall: w.shortfall, note: w.remark, payslipId: runKey },
    }));
    if (w.settles) ops.push(db.loan.update({ where: { id: w.loanId }, data: { isSettled: true, settledAt: now } }));
  }
  return ops;
}

export async function loadRunLoans(db, runKey) {
  const rows = await db.loan.findMany({
    where: { OR: [{ isSettled: false }, { entries: { some: { payslipId: runKey } } }] },
    include: { employee: true, entries: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(shapeLoan);
}

export async function applyLoanDeductions(db, { scope, runKey, cutoffEnd = null, available }) {
  const key = typeof runKey === 'string' ? runKey.trim() : '';
  if (!key) throw new Error('Missing run key.');
  const crew = scope === 'crew';
  const endYmd = runEndOf(key, cutoffEnd);

  const loans = await withRetry(() => loadRunLoans(db, key));
  const plan = planDeductions(loans, { crew, runKey: key, endYmd, available });
  if (plan.writes.length) {
    await withRetry(() => db.$transaction(deductionOps(db, plan, { runKey: key, endYmd })));
  }

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