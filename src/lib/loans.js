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

// Stored dates are UTC midnight; read them back as 'YYYY-MM-DD' with no shift.
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// `type` (LOAN / CASH_ADVANCE) is the kind. For a loan, `note` holds its
// purpose (Hospitalization, Emergency, Other). Records made before the Sep 2026
// split may still carry an old label there ("School Allowance", ...); it is
// shown as-is rather than hidden, so no history is lost.

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
    }));

  const kind = loan.type === 'CASH_ADVANCE' ? 'CASH_ADVANCE' : 'LOAN';
  const purpose = kind === 'LOAN' ? (loan.note || 'Other') : null;
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
