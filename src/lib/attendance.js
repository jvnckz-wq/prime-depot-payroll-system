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
      // getUTCDay() counts from Sunday; WEEKDAYS starts on Monday. We read the
      // weekday in UTC because these dates are stored at UTC midnight and every
      // other attendance path (import, DTR, weekend-OT split) reads them the
      // same way — using local getDay() here would pick the wrong day on a
      // server whose timezone is behind UTC.
      const key = WEEKDAYS[(d.getUTCDay() + 6) % 7].key;
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

/* ============================= SUMMARIES ============================= */

/// Roll a period's Attendance rows up into one summary per employee.
///
/// Extracted from GET /api/attendance so the payroll finalize route can build
/// the exact same numbers from the exact same code. That matters more than it
/// looks: finalize recomputes each payslip server-side, and if it counted days
/// present or split weekend overtime even slightly differently from the screen
/// the admin reviewed, every cutoff would end in an argument about which figure
/// is real. One function, one answer.
///
/// `rows` are Attendance records, optionally with `employee: { name }` included.
/// Returns rows sorted by employee id, numerically where the ids are numbers.
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

    // Weekend OT (Sat/Sun) is paid at a higher multiplier than weekday OT.
    // Read in UTC, because these dates are stored at UTC midnight.
    const dow = new Date(a.date).getUTCDay();
    if (dow === 0 || dow === 6) s.otWeekendMins += a.overtimeMins;
    else s.otWeekdayMins += a.overtimeMins;
  }

  return [...byEmp.values()].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' }));
}
