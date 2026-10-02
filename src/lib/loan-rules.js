export const LOAN_PURPOSES = ['Hospitalization', 'Emergency', 'Other'];
export const PURPOSE_ENUM = { Hospitalization: 'HOSPITALIZATION', Emergency: 'EMERGENCY', Other: 'OTHER' };
export const PURPOSE_LABEL = { HOSPITALIZATION: 'Hospitalization', EMERGENCY: 'Emergency', OTHER: 'Other' };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const isYmd = (s) => typeof s === 'string' && YMD_RE.test(s);

const parts = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return { y, m, d }; };
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function todayYmdManila(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function cutoffOf(ymd) {
  const { y, m, d } = parts(ymd);
  if (d <= 15) return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-15` };
  return { start: `${y}-${pad2(m)}-16`, end: `${y}-${pad2(m)}-${pad2(lastDay(y, m))}` };
}

export function nextCutoff(ymd) {
  const { y, m, d } = parts(ymd);
  if (d <= 15) return cutoffOf(`${y}-${pad2(m)}-16`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return cutoffOf(`${ny}-${pad2(nm)}-01`);
}

export function prevCutoff(ymd) {
  const { y, m, d } = parts(ymd);
  if (d > 15) return cutoffOf(`${y}-${pad2(m)}-01`);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return cutoffOf(`${py}-${pad2(pm)}-16`);
}

export function staffRunKey(ymdInCutoff) {
  const c = cutoffOf(ymdInCutoff);
  const a = parts(c.start); const b = parts(c.end);
  return `staff-${MONTHS_LONG[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
}

export function workingDaysIn({ start, end }) {
  const a = parts(start); const b = parts(end);
  let t = Date.UTC(a.y, a.m - 1, a.d);
  const stop = Date.UTC(b.y, b.m - 1, b.d);
  let n = 0;
  for (; t <= stop; t += 86400000) if (new Date(t).getUTCDay() !== 0) n++;
  return n;
}

export function projectedGross(rate, period) {
  return round2((Number(rate) || 0) * workingDaysIn(period));
}

export function shortDate(ymd, withYear = false) {
  if (!isYmd(ymd)) return '';
  const { y, m, d } = parts(ymd);
  return `${MONTHS_SHORT[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}
export function periodLabel({ start, end }) {
  const a = parts(start); const b = parts(end);
  return `${MONTHS_SHORT[a.m - 1]} ${a.d}-${b.d}, ${a.y}`;
}
export function shortPeriod({ start, end }) {
  const a = parts(start); const b = parts(end);
  return `${MONTHS_SHORT[a.m - 1]} ${a.d}-${b.d}`;
}

export const pesoText = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isCashAdvance = (loan) => loan?.kind === 'CASH_ADVANCE';

export function balanceOf(loan) {
  return round2((loan?.entries || []).reduce((b, e) => (e.type === 'grant' ? b + e.amount : b - e.amount), 0));
}

export function isOpen(loan) {
  return !loan.settled && balanceOf(loan) > 0.004;
}

export function grantedBy(loan, endYmd) {
  if (!isYmd(endYmd) || !isYmd(loan?.dateGranted)) return true;
  return loan.dateGranted <= endYmd;
}

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

export function dueFor(loan, { endYmd = null, crew = null } = {}) {
  const bal = balanceOf(loan);
  if (bal <= 0) return 0;
  if (isCashAdvance(loan)) return bal;
  const isCrew = crew == null ? !!loan.isCrew : crew;
  const carry = isCrew ? 0 : carryOf(loan, endYmd).amount;
  return round2(Math.min((Number(loan.perCutoff) || 0) + carry, bal));
}

export function dueAmount(loan) {
  return dueFor(loan);
}

export const LOAN_MAX_BALANCE = 50000;

export const loanRoomLeft = (balance = 0) => round2(Math.max(0, LOAN_MAX_BALANCE - (Number(balance) || 0)));

function cutoffIndex(ymd) {
  const { y, m, d } = parts(ymd);
  return y * 24 + (m - 1) * 2 + (d <= 15 ? 0 : 1);
}

function cutoffAt(index) {
  const y = Math.floor(index / 24);
  const rest = index - y * 24;
  const m = Math.floor(rest / 2) + 1;
  return cutoffOf(`${y}-${pad2(m)}-${rest % 2 === 0 ? '01' : '16'}`);
}

export function payoffPlan(balance, perRun, fromYmd) {
  const bal = Number(balance) || 0;
  const per = Number(perRun) || 0;
  if (bal <= 0 || per <= 0 || !isYmd(fromYmd)) return null;
  const count = Math.ceil(round2(bal / per) - 1e-9);
  const first = cutoffOf(fromYmd).end;
  const last = cutoffAt(cutoffIndex(fromYmd) + count - 1).end;
  return { count, first, last };
}

export function advancedInCutoff(loans, employeeId, period) {
  return round2(loans
    .filter((l) => isCashAdvance(l) && l.employeeId === employeeId
      && isYmd(l.dateGranted) && l.dateGranted >= period.start && l.dateGranted <= period.end)
    .reduce((s, l) => s + (Number(l.principal) || 0), 0));
}

const byText = (a, b) => String(a || '').localeCompare(String(b || ''));

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

export function planDeductions(loans, { crew = false, runKey, endYmd = null, available, full = false } = {}) {
  const key = String(runKey || '').trim();
  if (!key) throw new Error('Missing run key.');
  if (available == null) throw new Error('Missing available pay.');
  const availOf = (id) => (available instanceof Map ? available.get(id) : available[id]);
  const group = (loans || []).filter((l) => !!l.isCrew === !!crew);

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

export function withPlan(loans, plan, { runKey, endYmd }) {
  const byLoan = new Map(plan.writes.map((w) => [w.loanId, w]));
  return (loans || []).map((l) => {
    const w = byLoan.get(l.id);
    if (!w) return l;
    const entry = { date: shortDate(endYmd, true), ymd: endYmd, type: 'deduction', amount: w.amount, shortfall: w.shortfall, remark: w.remark, payslipId: runKey };
    return { ...l, settled: l.settled || w.settles, entries: [...(l.entries || []), entry] };
  });
}