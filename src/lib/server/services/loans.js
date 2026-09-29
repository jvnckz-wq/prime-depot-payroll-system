// Shared loan mapping. The database stores a loan and an append-only ledger of
// entries; the balance is never stored, only derived from the entries (a locked
// rule). This module turns a database row into exactly the shape the Loans view,
// the payroll math, and loanBalance/loanLedger already expect — so nothing on
// the frontend has to change how it reads a loan.

import { POSITION_LABEL } from './employees';
import { LOAN_PURPOSES, PURPOSE_LABEL } from '../../loan-rules';

const num = (d) => (d == null ? 0 : Number(d));

// Dates are stored at UTC midnight, so format in UTC to avoid a one-day shift.
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';

// Stored dates are UTC midnight; read them back as 'YYYY-MM-DD' with no shift.
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// `type` (LOAN / CASH_ADVANCE) is the kind. A loan's purpose is its own column
// (LoanPurpose enum) since Phase 2; before that it lived in `note`, and the
// migration copied it over. A record from before the Sep 2026 split may still
// carry an old label in `note` ("School Allowance", ...): it was mapped to
// OTHER, and the old label is shown as-is so no history is lost.
function purposeOf(loan) {
  const legacy = loan.note && !LOAN_PURPOSES.includes(loan.note) ? loan.note : null;
  if (loan.purpose) return loan.purpose === 'OTHER' && legacy ? legacy : (PURPOSE_LABEL[loan.purpose] || 'Other');
  return loan.note || 'Other';
}

// The frontend ledger uses 'grant' / 'deduction'; loanBalance and loanLedger
// depend on exactly those strings.
export function shapeLoan(loan) {
  const entries = (loan.entries || [])
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt))
    .map((e) => ({
      date: fmtDate(e.date),
      ymd: ymd(e.date),
      type: e.type === 'GRANT' ? 'grant' : 'deduction',
      amount: num(e.amount),
      remark: e.note || (e.type === 'GRANT' ? 'Granted' : 'Deducted'),
      payslipId: e.payslipId || null,
      // Unpaid part of a payroll deduction, carried to the next run (Phase 2).
      shortfall: num(e.shortfall),
    }));

  const kind = loan.type === 'CASH_ADVANCE' ? 'CASH_ADVANCE' : 'LOAN';
  const purpose = kind === 'LOAN' ? purposeOf(loan) : null;
  return {
    id: loan.id,
    // Loans are matched to people by employeeId everywhere. `person` is the
    // display name only; two employees can share a name, or a name can be
    // corrected, and neither may move a loan to someone else's payslip.
    employeeId: loan.employeeId,
    kind,
    purpose,
    dateGranted: ymd(loan.dateGranted),
    settledAt: ymd(loan.settledAt),
    isCrew: loan.employee?.position === 'DRIVER' || loan.employee?.position === 'PAHINANTE',
    // Only an employee marked INACTIVE counts as gone (their loan waits for
    // final pay instead of being charged P0 every cutoff).
    active: loan.employee?.status !== 'INACTIVE',
    createdAt: loan.createdAt ? new Date(loan.createdAt).toISOString() : null,
    person: loan.employee?.name || '—',
    // Role is the person's position (e.g. "Driver") — crew are not tied to a
    // truck, so no "· TRK-02" is attached.
    role: loan.employee ? (POSITION_LABEL[loan.employee.position] ?? loan.employee.position) : '—',
    type: kind === 'CASH_ADVANCE' ? 'Cash Advance' : purpose,
    principal: num(loan.principal),
    perCutoff: num(loan.deductionPerRun),
    paused: loan.isPaused,
    settled: loan.isSettled,
    entries,
  };
}
