import { POSITION_LABEL } from './employees';
import { LOAN_PURPOSES, PURPOSE_LABEL } from '../../loan-rules';

const num = (d) => (d == null ? 0 : Number(d));

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';

const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function purposeOf(loan) {
  const legacy = loan.note && !LOAN_PURPOSES.includes(loan.note) ? loan.note : null;
  if (loan.purpose) return loan.purpose === 'OTHER' && legacy ? legacy : (PURPOSE_LABEL[loan.purpose] || 'Other');
  return loan.note || 'Other';
}

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
      shortfall: num(e.shortfall),
    }));

  const kind = loan.type === 'CASH_ADVANCE' ? 'CASH_ADVANCE' : 'LOAN';
  const purpose = kind === 'LOAN' ? purposeOf(loan) : null;
  return {
    id: loan.id,
    employeeId: loan.employeeId,
    kind,
    purpose,
    dateGranted: ymd(loan.dateGranted),
    settledAt: ymd(loan.settledAt),
    isCrew: loan.employee?.position === 'DRIVER' || loan.employee?.position === 'PAHINANTE',
    active: loan.employee?.status !== 'INACTIVE',
    createdAt: loan.createdAt ? new Date(loan.createdAt).toISOString() : null,
    person: loan.employee?.name || '—',
    role: loan.employee ? (POSITION_LABEL[loan.employee.position] ?? loan.employee.position) : '—',
    type: kind === 'CASH_ADVANCE' ? 'Cash Advance' : purpose,
    principal: num(loan.principal),
    perCutoff: num(loan.deductionPerRun),
    paused: loan.isPaused,
    settled: loan.isSettled,
    entries,
  };
}