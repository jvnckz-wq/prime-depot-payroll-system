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
//
// Phase 2 (Sep 2026): a deduction never takes more than the pay actually left.
//   Order         cash advances first (oldest first), then the loan installment.
//   Floor         net pay stops at P0; there is no minimum take-home.
//   Carry-over    staff: the unpaid part is recorded on the ledger entry as its
//                 `shortfall` and added to the next installment (an advance just
//                 stays open, still due in full). Crew (paid daily): nothing is
//                 stacked; a day without pay takes nothing and the loan simply
//                 runs one day longer.

export const LOAN_PURPOSES = ['Hospitalization', 'Emergency', 'Other'];
// Database enum (LoanPurpose) <-> label shown on screen.
export const PURPOSE_ENUM = { Hospitalization: 'HOSPITALIZATION', Emergency: 'EMERGENCY', Other: 'OTHER' };
export const PURPOSE_LABEL = { HOSPITALIZATION: 'Hospitalization', EMERGENCY: 'Emergency', OTHER: 'Other' };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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

// The cutoff right before the one that contains `ymd`.
export function prevCutoff(ymd) {
  const { y, m, d } = parts(ymd);
  if (d > 15) return cutoffOf(`${y}-${pad2(m)}-01`);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return cutoffOf(`${py}-${pad2(pm)}-16`);
}

// The ledger key a staff payroll run stamps on its deductions, e.g.
// "staff-September 16–30, 2026". It names the CALENDAR cutoff, never the
// imported attendance range: an import that stops on the 29th and a later one
// that reaches the 30th are the same cutoff and must share one key, or the
// second Apply would deduct again. The text matches lib/utils cutoffLabel, so
// keys written before this change (import range = full cutoff) still match.
export function staffRunKey(ymdInCutoff) {
  const c = cutoffOf(ymdInCutoff);
  const a = parts(c.start); const b = parts(c.end);
  return `staff-${MONTHS_LONG[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
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
// "Sep 16-30" (no year), for KPI labels and warnings.
export function shortPeriod({ start, end }) {
  const a = parts(start); const b = parts(end);
  return `${MONTHS_SHORT[a.m - 1]} ${a.d}-${b.d}`;
}

// Peso text for ledger remarks. Kept local: lib/utils pulls in the xlsx library.
export const pesoText = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

// The unpaid part carried INTO a staff run that ends on `endYmd`: the shortfall
// recorded on the latest payroll deduction dated before that day. It is read
// from the ledger, never stored on the loan (the same principle as the balance),
// so un-finalizing a cutoff, which deletes its entries, reverts it by itself.
// Without endYmd it reads the latest entry: "what the next run will add".
// Returns { amount, fromYmd } (fromYmd = the cutoff that came out short).
export function carryOf(loan, endYmd = null) {
  let last = null;
  for (const e of loan?.entries || []) {
    if (e.type !== 'deduction' || !e.payslipId) continue;
    if (isYmd(endYmd) && isYmd(e.ymd) && e.ymd >= endYmd) continue;
    last = e;
  }
  const amount = last ? round2(Number(last.shortfall) || 0) : 0;
  return { amount, fromYmd: amount > 0 ? last.ymd || null : null };
}

// What one payroll run is due to take from this loan, before checking pay:
//   cash advance  the whole open balance (a short one stays due in full)
//   staff loan    one installment + what the last cutoff left unpaid
//   crew loan     one daily installment, nothing stacked (see header)
// Never more than the balance.
export function dueFor(loan, { endYmd = null, crew = null } = {}) {
  const bal = balanceOf(loan);
  if (bal <= 0) return 0;
  if (isCashAdvance(loan)) return bal;
  const isCrew = crew == null ? !!loan.isCrew : crew;
  const carry = isCrew ? 0 : carryOf(loan, endYmd).amount;
  return round2(Math.min((Number(loan.perCutoff) || 0) + carry, bal));
}

// Kept for existing callers: the next run's due amount.
export function dueAmount(loan) {
  return dueFor(loan);
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

// --- Phase 2: deduct only from pay that is actually there -------------------

const byText = (a, b) => String(a || '').localeCompare(String(b || ''));

// Ledger remark for a deduction, e.g. "Payroll September 16–30, 2026 · P360.00
// short, carried over". Written once, when the entry is made.
function remarkFor(key, w) {
  if (w.final) {
    if (w.unpaid <= 0.004) return 'Final pay';
    return w.amount <= 0.004
      ? `Final pay · nothing left to deduct, ${pesoText(w.unpaid)} still unpaid`
      : `Final pay · ${pesoText(w.unpaid)} still unpaid`;
  }
  const base = key.startsWith('staff-') ? `Payroll ${key.slice(6)}`
    : key.startsWith('crew-') ? `Crew pay ${shortDate(key.slice(5), true) || key.slice(5)}`
      : `Payroll ${key}`;
  if (w.crew) {
    if (w.unpaid <= 0.004) return base;
    return w.amount <= 0.004 ? `${base} · no pay that day, nothing taken` : `${base} · only ${pesoText(w.amount)} earned`;
  }
  if (w.shortfall > 0.004) {
    return w.amount <= 0.004
      ? `${base} · nothing taken, ${pesoText(w.shortfall)} carried over`
      : `${base} · ${pesoText(w.shortfall)} short, carried over`;
  }
  if (w.carriedIn > 0.004) return `${base} · incl. ${pesoText(w.carriedIn)} carried over`;
  return base;
}

// Decide what one payroll run deducts, from pay that is actually available.
// Pure: no database, no React. The server runs it to write the ledger, and the
// browser runs the very same function to preview the run before it happens.
//
//   loans      shaped loans (lib/server/services/loans.js shapeLoan)
//   crew       true = the crew group (daily), false = staff (per cutoff)
//   runKey     the idempotency stamp; a loan already stamped is skipped
//   endYmd     last day the run pays for (cutoff end, or the crew day)
//   available  employeeId -> pay left after contributions and tardiness,
//              before any loan (Map or plain object). An employee missing from
//              it has no pay in this run: P0, unless no longer employed, in
//              which case the loan is left for final pay (Phase 3).
//
// Per employee, cash advances are taken first (oldest first), then loans. Each
// takes what is due, but never more than is left, so net pay stops at P0.
//
//   full       final pay (Phase 3): everything still owed is due at once, even
//              on a paused loan, and whatever the final pay cannot cover stays
//              on the ledger as the unpaid balance (nothing carries: there is
//              no next payroll).
export function planDeductions(loans, { crew = false, runKey, endYmd = null, available, full = false } = {}) {
  const key = String(runKey || '').trim();
  if (!key) throw new Error('Missing run key.');
  if (available == null) throw new Error('Missing available pay.');
  const availOf = (id) => (available instanceof Map ? available.get(id) : available[id]);
  const group = (loans || []).filter((l) => !!l.isCrew === !!crew);

  // Money this run already took from each person (an earlier Apply, then a new
  // advance before Finalize): it has left their pay, so it is not available.
  const takenAlready = new Map();
  for (const l of group) {
    const t = (l.entries || []).filter((e) => e.type === 'deduction' && e.payslipId === key).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (t > 0) takenAlready.set(l.employeeId, round2((takenAlready.get(l.employeeId) || 0) + t));
  }

  let skipped = 0;
  const due = [];
  for (const l of group) {
    if (l.settled || (l.paused && !full) || balanceOf(l) <= 0.004) continue;
    if (!grantedBy(l, endYmd)) continue;
    if ((l.entries || []).some((e) => e.payslipId === key)) { skipped++; continue; }
    due.push(l);
  }
  const rank = (l) => (isCashAdvance(l) ? 0 : 1);
  due.sort((a, b) => byText(a.employeeId, b.employeeId) || rank(a) - rank(b)
    || byText(a.dateGranted, b.dateGranted) || byText(a.createdAt, b.createdAt));

  const left = new Map();
  const writes = [];
  for (const l of due) {
    const raw = availOf(l.employeeId);
    if (raw === undefined && l.active === false) continue;
    if (!left.has(l.employeeId)) {
      left.set(l.employeeId, round2(Math.max(0, (Number(raw) || 0) - (takenAlready.get(l.employeeId) || 0))));
    }
    const amountDue = full ? balanceOf(l) : dueFor(l, { endYmd, crew });
    const have = left.get(l.employeeId);
    const amount = round2(Math.max(0, Math.min(amountDue, have)));
    left.set(l.employeeId, round2(have - amount));
    const unpaid = round2(amountDue - amount);
    const w = {
      loanId: l.id, employeeId: l.employeeId, person: l.person, kind: l.kind, crew: !!crew, final: !!full,
      due: amountDue, amount, unpaid,
      // Carried to the next run: staff payroll only. Crew are not stacked, and
      // final pay has no next run (the unpaid part is simply the balance left).
      shortfall: crew || full ? 0 : unpaid,
      carriedIn: crew || full || isCashAdvance(l) ? 0 : carryOf(l, endYmd).amount,
      settles: balanceOf(l) - amount <= 0.004,
    };
    w.remark = remarkFor(key, w);
    writes.push(w);
  }

  const taken = writes.filter((w) => w.amount > 0.004);
  return {
    writes,
    eligible: due.length + skipped,
    skipped,
    applied: taken.length,
    settled: writes.filter((w) => w.settles).length,
    total: round2(taken.reduce((s, w) => s + w.amount, 0)),
    short: writes.filter((w) => w.unpaid > 0.004).map((w) => ({ employeeId: w.employeeId, person: w.person, kind: w.kind, due: w.due, amount: w.amount, unpaid: w.unpaid })),
    unpaidTotal: round2(writes.reduce((s, w) => s + w.unpaid, 0)),
  };
}

// The same loans as if a plan had been written: its entries appended (dated at
// the run's end, as the server writes them) and paid-off loans closed. Lets the
// server build the payslips of a release before anything is stored, and so
// write the ledger and the payslips in one transaction.
export function withPlan(loans, plan, { runKey, endYmd }) {
  const byLoan = new Map(plan.writes.map((w) => [w.loanId, w]));
  return (loans || []).map((l) => {
    const w = byLoan.get(l.id);
    if (!w) return l;
    const entry = { date: shortDate(endYmd, true), ymd: endYmd, type: 'deduction', amount: w.amount, shortfall: w.shortfall, remark: w.remark, payslipId: runKey };
    return { ...l, settled: l.settled || w.settles, entries: [...(l.entries || []), entry] };
  });
}
