// Loans & Cash Advances: the business rules, in one pure module.
//
// The browser (forms, previews, payslips) and the server (API validation,
// Apply Deductions, Finalize) import the SAME functions from here, so a rule is
// written once and can never mean one thing on screen and another in the
// ledger. No database, no React: every function takes plain values and is
// covered by scripts/loans-phase1.test.mjs.
//
// Client rules (confirmed Sep 2026):
//   Loan          paid in installments per cutoff (crew: per day), may exceed a
//                 cutoff's pay, for emergencies. One active loan per employee;
//                 extra money is a top-up on that same loan.
//   Cash advance  deducted IN FULL on the payroll of the cutoff it was given in,
//                 staff only (crew are paid daily), capped at the projected
//                 gross pay for that cutoff.

export const LOAN_PURPOSES = ['Hospitalization', 'Emergency', 'Other'];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const isYmd = (s) => typeof s === 'string' && YMD_RE.test(s);

// Split 'YYYY-MM-DD' by hand so the day never shifts across timezones.
const parts = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return { y, m, d }; };
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Today as 'YYYY-MM-DD' in Philippine time. The server runs in UTC, so a plain
// toISOString() would still say "yesterday" until 8 AM Manila time.
export function todayYmdManila(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// The semi-monthly cutoff (1-15 or 16-end) that contains a date.
export function cutoffOf(ymd) {
  const { y, m, d } = parts(ymd);
  if (d <= 15) return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-15` };
  return { start: `${y}-${pad2(m)}-16`, end: `${y}-${pad2(m)}-${pad2(lastDay(y, m))}` };
}

// The cutoff right after the one that contains `ymd`.
export function nextCutoff(ymd) {
  const { y, m, d } = parts(ymd);
  if (d <= 15) return cutoffOf(`${y}-${pad2(m)}-16`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return cutoffOf(`${ny}-${pad2(nm)}-01`);
}

// Working days used for the cash-advance limit: Monday to Saturday.
// ASSUMPTION pending the client's answer (Sundays are a paid half-day for some
// staff). Change it here and every screen and the API follow.
export function workingDaysIn({ start, end }) {
  const a = parts(start); const b = parts(end);
  let t = Date.UTC(a.y, a.m - 1, a.d);
  const stop = Date.UTC(b.y, b.m - 1, b.d);
  let n = 0;
  for (; t <= stop; t += 86400000) if (new Date(t).getUTCDay() !== 0) n++;
  return n;
}

// Hard limit for a cash advance: the daily rate over the cutoff's working days.
export function projectedGross(rate, period) {
  return round2((Number(rate) || 0) * workingDaysIn(period));
}

// "Sep 30", "Sep 30, 2026"
export function shortDate(ymd, withYear = false) {
  if (!isYmd(ymd)) return '';
  const { y, m, d } = parts(ymd);
  return `${MONTHS_SHORT[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}
// "Sep 16-30, 2026"
export function periodLabel({ start, end }) {
  const a = parts(start); const b = parts(end);
  return `${MONTHS_SHORT[a.m - 1]} ${a.d}-${b.d}, ${a.y}`;
}

export const isCashAdvance = (loan) => loan?.kind === 'CASH_ADVANCE';

// Money still owed, from the ledger (the balance is never stored).
export function balanceOf(loan) {
  return round2((loan?.entries || []).reduce((b, e) => (e.type === 'grant' ? b + e.amount : b - e.amount), 0));
}

// Active = still owed and not closed. A loan paid down to zero before the
// auto-settle existed also counts as done, so History picks it up.
export function isOpen(loan) {
  return !loan.settled && balanceOf(loan) > 0.004;
}

// Was the money given on or before the cutoff's last day? Deductions only ever
// touch loans that exist by then, so an advance given on Oct 2 can never be
// taken from the Sep 16-30 payroll even if that payroll is applied late.
export function grantedBy(loan, endYmd) {
  if (!isYmd(endYmd) || !isYmd(loan?.dateGranted)) return true;
  return loan.dateGranted <= endYmd;
}

// What one payroll run takes from this loan: a cash advance goes in full, a loan
// takes one installment (never more than what is left).
export function dueAmount(loan) {
  const bal = balanceOf(loan);
  if (bal <= 0) return 0;
  if (isCashAdvance(loan)) return bal;
  return round2(Math.min(Number(loan.perCutoff) || 0, bal));
}

// How long a loan takes to finish at a given installment, starting with the
// payroll of the cutoff that contains `fromYmd`.
export function payoffPlan(balance, perRun, fromYmd) {
  const bal = Number(balance) || 0;
  const per = Number(perRun) || 0;
  if (bal <= 0 || per <= 0 || !isYmd(fromYmd)) return null;
  const count = Math.ceil(round2(bal / per) - 1e-9);
  let cut = cutoffOf(fromYmd);
  const first = cut.end;
  for (let i = 1; i < count; i++) cut = nextCutoff(cut.end);
  return { count, first, last: cut.end };
}

// Sum of cash advances an employee already took in a cutoff.
export function advancedInCutoff(loans, employeeId, period) {
  return round2(loans
    .filter((l) => isCashAdvance(l) && l.employeeId === employeeId
      && isYmd(l.dateGranted) && l.dateGranted >= period.start && l.dateGranted <= period.end)
    .reduce((s, l) => s + (Number(l.principal) || 0), 0));
}
