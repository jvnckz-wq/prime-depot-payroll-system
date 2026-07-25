// Shared loan mapping. The database stores a loan and an append-only ledger of
// entries; the balance is never stored, only derived from the entries (a locked
// rule). This module turns a database row into exactly the shape the Loans view,
// the payroll math, and loanBalance/loanLedger already expect — so nothing on
// the frontend has to change how it reads a loan.

import { POSITION_LABEL } from './employees';

const num = (d) => (d == null ? 0 : Number(d));

// Dates are stored at UTC midnight, so format in UTC to avoid a one-day shift.
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';

// The coarse database enum keeps two categories; the specific label the user
// picked ("Cash Advance (Bali)", "School Allowance", …) is preserved in `note`.
const CASH_ADVANCE_LABELS = new Set(['Cash Advance (Bali)', 'Cash Advance', 'Company Cash Advance']);
export function typeToEnum(label) {
  return CASH_ADVANCE_LABELS.has(label) ? 'CASH_ADVANCE' : 'LOAN';
}

// The frontend ledger uses 'grant' / 'deduction'; loanBalance and loanLedger
// depend on exactly those strings.
export function shapeLoan(loan) {
  const entries = (loan.entries || [])
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt))
    .map((e) => ({
      date: fmtDate(e.date),
      type: e.type === 'GRANT' ? 'grant' : 'deduction',
      amount: num(e.amount),
      remark: e.note || (e.type === 'GRANT' ? 'Granted' : 'Deducted'),
    }));

  return {
    id: loan.id,
    person: loan.employee?.name || '—',
    // Role is the person's position (e.g. "Driver") — crew are not tied to a
    // truck, so no "· TRK-02" is attached.
    role: loan.employee ? (POSITION_LABEL[loan.employee.position] ?? loan.employee.position) : '—',
    type: loan.note || (loan.type === 'CASH_ADVANCE' ? 'Cash Advance' : 'Loan'),
    principal: num(loan.principal),
    perCutoff: num(loan.deductionPerRun),
    paused: loan.isPaused,
    settled: loan.isSettled,
    entries,
  };
}
