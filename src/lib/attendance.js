import { DTR_DATES, DTR_DAYS, REAL_DTR } from '../data/seed';

export function seedRand(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
// Position-sensitive string hash — a plain character-code sum would treat 'EMP-001' and
// 'EMP-010' as the same seed (same characters, different order), producing identical
// generated data for two different employees.
export function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}
export function genAttendanceHistory(empId) {
  const seed = hashStr(empId) * 97 + 13;
  const rand = seedRand(seed);
  const cutoffs = ['Feb 16–28', 'Mar 1–15', 'Mar 16–31', 'Apr 1–15', 'Apr 16–30', 'May 1–15'];
  return cutoffs.map(c => {
    const absent = Math.floor(rand() * 2.4);
    const present = 13 - absent;
    const late = Math.floor(rand() * 50);
    const daysLate = late > 0 ? Math.max(1, Math.floor(late / 18)) : 0;
    const ot = Math.floor(rand() * 90);
    return { cutoff: c, present, absent, late, daysLate, ot };
  });
}

/* ============================= SEED DATA ============================= */

export function buildDtrRows(empId) {
  const real = REAL_DTR[empId];
  if (real) {
    return real.map(([tIn, tOut, late, ot, absent], i) => ({ date: DTR_DATES[i], day: DTR_DAYS[i], in: tIn, out: tOut, late, ot, absent }));
  }
  // Deterministic per-employee approximation for staff without a captured screenshot —
  // stable across renders, but distinct from every other employee's pattern.
  const seed = hashStr(empId) * 53 + 7;
  const rand = seedRand(seed);
  return DTR_DATES.map((date, i) => {
    const day = DTR_DAYS[i];
    if (day === 'Su') return { date, day, in: '6:40', out: '12:00', late: 0, ot: 0, absent: false };
    if (rand() < 0.05) return { date, day, in: '—', out: '—', late: 0, ot: 0, absent: true };
    const late = rand() < 0.18 ? Math.floor(rand() * 20) + 1 : 0;
    const ot = rand() < 0.15 ? Math.floor(rand() * 60) + 15 : 0;
    const fmt = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    return { date, day, in: fmt(400 + late), out: fmt(1020 + ot), late, ot, absent: false };
  });
}

export function summarizeDtr(empId) {
  const rows = buildDtrRows(empId);
  return {
    daysLate: rows.filter(r => r.late > 0).length,
    late: rows.reduce((s, r) => s + r.late, 0),
    ot: rows.reduce((s, r) => s + r.ot, 0),
    absent: rows.filter(r => r.absent).length,
  };
}

/* ============================= CALL TIMES ============================= */

export const WEEKDAYS = [
  { key: 'MON', label: 'Mon' }, { key: 'TUE', label: 'Tue' }, { key: 'WED', label: 'Wed' },
  { key: 'THU', label: 'Thu' }, { key: 'FRI', label: 'Fri' }, { key: 'SAT', label: 'Sat' },
  { key: 'SUN', label: 'Sun' },
];

// Standard call times by role, used when no early shift applies that day.
const DEFAULT_CALL = { crew: '06:30', staff: '06:40' };
const DEFAULT_EARLY = '06:00';

const CREW_POSITIONS = new Set(['Driver', 'Pahinante', 'Checker', 'DRIVER', 'PAHINANTE', 'CHECKER']);

/// Which call time applies to this employee on this date.
///
/// The early shift is a property of the person, not of their job title: the
/// same administrative staff member can be required at 06:00 on Saturdays and
/// 06:40 the rest of the week. This is the single place that decides, so the
/// attendance import, the DTR view, and any future report all agree.
///
/// Returns "HH:MM" on a 24-hour clock.
export function callTimeFor(employee, date) {
  if (!employee) return DEFAULT_CALL.staff;

  const days = employee.earlyShiftDays || [];
  if (days.length && date) {
    const d = date instanceof Date ? date : new Date(date);
    if (!isNaN(d.getTime())) {
      // getDay() counts from Sunday; WEEKDAYS starts on Monday.
      const key = WEEKDAYS[(d.getDay() + 6) % 7].key;
      if (days.includes(key)) return employee.earlyShiftTime || DEFAULT_EARLY;
    }
  }

  return CREW_POSITIONS.has(employee.position) ? DEFAULT_CALL.crew : DEFAULT_CALL.staff;
}

/// Minutes late against the applicable call time. A missing time-in is
/// penalised a flat 30 minutes, per the client's rule, rather than being
/// treated as on time.
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

/// Human-readable summary of an employee's early shift, for the employee list
/// and the DTR header. Returns null when nothing is required.
export function describeEarlyShift(employee) {
  const days = employee?.earlyShiftDays || [];
  if (!days.length) return null;

  const time = employee.earlyShiftTime || DEFAULT_EARLY;
  if (days.length === 7) return `${time} every day`;

  const labels = WEEKDAYS.filter((w) => days.includes(w.key)).map((w) => w.label);
  return `${time} on ${labels.join(', ')}`;
}
