// Shapes loan records for the app.
import { POSITION_LABEL } from './employees';
import { isDailyPosition } from '../../positions';
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
  // Cash advances given before they had a purpose have none.
  const purpose = kind === 'LOAN' ? purposeOf(loan) : (PURPOSE_LABEL[loan.purpose] || null);
  return {
    id: loan.id,
    employeeId: loan.employeeId,
    kind,
    purpose,
    dateGranted: ymd(loan.dateGranted),
    settledAt: ymd(loan.settledAt),
    isCrew: isDailyPosition(loan.employee?.position),
    active: loan.employee?.status !== 'INACTIVE',
    createdAt: loan.createdAt ? new Date(loan.createdAt).toISOString() : null,
    person: loan.employee?.name || '--',
    role: loan.employee ? (POSITION_LABEL[loan.employee.position] ?? loan.employee.position) : '--',
    type: kind === 'CASH_ADVANCE' ? 'Cash Advance' : purpose,
    principal: num(loan.principal),
    perCutoff: num(loan.deductionPerRun),
    paused: loan.isPaused,
    settled: loan.isSettled,
    entries,
  };
}
// A cash advance needs at least one day worked or on paid leave in its cutoff, up to the date given.
export const NO_ATTENDANCE_MESSAGE = 'No attendance yet this cutoff.';

export async function hasAttendanceForAdvance(prisma, employeeId, fromYmd, toYmd) {
  const n = await prisma.attendance.count({
    where: {
      employeeId,
      date: { gte: new Date(`${fromYmd}T00:00:00Z`), lte: new Date(`${toYmd}T00:00:00Z`) },
      OR: [
        { isLeave: true },
        { isAbsent: false, OR: [{ timeIn: { not: null } }, { timeOut: { not: null } }, { isAssumedIn: true }] },
      ],
    },
  });
  return n > 0;
}
