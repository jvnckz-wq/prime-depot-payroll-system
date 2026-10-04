import { isDailyPosition, isNonRegularPosition } from './positions.js';

export const WEEKDAYS = [
  { key: 'MON', label: 'Mon' }, { key: 'TUE', label: 'Tue' }, { key: 'WED', label: 'Wed' },
  { key: 'THU', label: 'Thu' }, { key: 'FRI', label: 'Fri' }, { key: 'SAT', label: 'Sat' },
  { key: 'SUN', label: 'Sun' },
];

const DEFAULT_CALL = { crew: '06:30', staff: '06:40' };
const DEFAULT_EARLY = '06:00';

export function callTimeFor(employee, date) {
  if (!employee) return DEFAULT_CALL.staff;

  const days = isNonRegularPosition(employee.position) ? [] : (employee.earlyShiftDays || []);
  if (days.length && date) {
    const d = date instanceof Date ? date : new Date(date);
    if (!isNaN(d.getTime())) {
      const key = WEEKDAYS[(d.getUTCDay() + 6) % 7].key;
      if (days.includes(key)) return employee.earlyShiftTime || DEFAULT_EARLY;
    }
  }

  return isDailyPosition(employee.position) ? DEFAULT_CALL.crew : DEFAULT_CALL.staff;
}

export function minutesLate(employee, date, timeIn) {
  if (!timeIn || timeIn === '—') return 30;

  const toMinutes = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return isNaN(h) || isNaN(m) ? null : h * 60 + m;
  };

  const actual = toMinutes(timeIn);
  const expected = toMinutes(callTimeFor(employee, date));
  if (actual == null || expected == null) return 0;

  return Math.max(0, actual - expected);
}

export function describeEarlyShift(employee) {
  const days = employee?.earlyShiftDays || [];
  if (!days.length) return null;

  const time = employee.earlyShiftTime || DEFAULT_EARLY;
  if (days.length === 7) return `${time} every day`;

  const labels = WEEKDAYS.filter((w) => days.includes(w.key)).map((w) => w.label);
  return `${time} on ${labels.join(', ')}`;
}

const _toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const _atTime = (dateStr, hhmm) => (hhmm ? new Date(`${dateStr}T${hhmm}:00.000Z`) : null);

export function pairPunches(times) {
  const sorted = (times || []).filter(Boolean).slice().sort();
  if (!sorted.length) return { timeIn: null, timeOut: null };

  const morning = sorted.filter((t) => _toMin(t) < 720);
  const afternoon = sorted.filter((t) => _toMin(t) >= 720);
  return {
    timeIn: morning[0] || null,
    timeOut: afternoon.length ? afternoon[afternoon.length - 1] : null,
  };
}

export function shiftEndFor(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 0 ? '12:00' : '17:00';
}

export function buildAttendanceRow(emp, dateStr, paired, extra = {}) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (!paired) {
    return { employeeId: emp.id, date, isAbsent: true, tardinessMins: 0, overtimeMins: 0, ...extra };
  }
  const assumedIn = !paired.timeIn;
  const assumedOut = !paired.timeOut;
  const shiftEnd = shiftEndFor(dateStr);
  const timeOut = paired.timeOut || shiftEnd;
  return {
    employeeId: emp.id, date,
    timeIn: _atTime(dateStr, paired.timeIn), timeOut: _atTime(dateStr, timeOut),
    tardinessMins: minutesLate(emp, date, paired.timeIn),
    overtimeMins: assumedOut ? 0 : Math.max(0, _toMin(timeOut) - _toMin(shiftEnd)),
    isAbsent: false, isAssumedIn: assumedIn, isAssumedOut: assumedOut, ...extra,
  };
}

export function summarizeAttendance(rows) {
  const byEmp = new Map();

  for (const a of rows) {
    if (!byEmp.has(a.employeeId)) {
      byEmp.set(a.employeeId, {
        id: a.employeeId,
        name: a.employee?.name || a.employeeId,
        present: 0, absent: 0, leave: 0, daysLate: 0, lateMins: 0, otMins: 0,
        otWeekdayMins: 0, otWeekendMins: 0,
      });
    }
    const s = byEmp.get(a.employeeId);

    if (a.isLeave) s.leave++;
    else if (a.isAbsent) s.absent++;
    else s.present++;

    if (a.tardinessMins > 0) s.daysLate++;
    s.lateMins += a.tardinessMins;
    s.otMins += a.overtimeMins;

    const dow = new Date(a.date).getUTCDay();
    if (dow === 0 || dow === 6) s.otWeekendMins += a.overtimeMins;
    else s.otWeekdayMins += a.overtimeMins;
  }

  return [...byEmp.values()].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' }));
}
export const isClockTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s ?? ''));

export function isCalendarDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''))) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
