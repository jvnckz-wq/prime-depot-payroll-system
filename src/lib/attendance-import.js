// Parser for the ZKTeco biometric attendance export (.xls / BIFF8).
//
// The export has three kinds of sheet:
//   - "Attendance Statistic Table" — one row per enrolled user (User ID + Name),
//     including users who never punched. This is the roster.
//   - "Shift Setting Table" — the monthly shift grid (not needed here).
//   - "1,2,3", "4,5,6", … — detail sheets, three users laid out SIDE BY SIDE in
//     column blocks. Each block is a "Time Card": one row per day, with the
//     punch times as Excel day-fractions in Before-Noon In/Out, After-Noon
//     In/Out, and Overtime In/Out columns.
//
// parseZktecoXls returns the period, the full roster, and every day's first and
// last punch per user. It makes no payroll decisions — matching to employees
// and computing tardiness happen in the import route.

import * as XLSX from 'xlsx';

// An Excel time is a fraction of a 24-hour day. 0.2361 → 05:40.
function fracToHHMM(f) {
  if (typeof f !== 'number' || !isFinite(f) || f <= 0 || f >= 1) return null;
  let mins = Math.round(f * 1440);
  if (mins >= 1440) mins = 1439;
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const ymd = (d) => d.toISOString().slice(0, 10);

export function parseZktecoXls(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  // --- Period, from the statistic header "Date:05-01-2026~05-15-2026" ---
  const statName = wb.SheetNames.find((n) => /statistic/i.test(n));
  const stat = statName ? XLSX.utils.sheet_to_json(wb.Sheets[statName], { header: 1, raw: false }) : [];
  let period = null;
  for (const row of stat.slice(0, 4)) {
    const m = String((row && row[0]) || '').match(/(\d{2})-(\d{2})-(\d{4})~(\d{2})-(\d{2})-(\d{4})/);
    if (m) {
      period = {
        start: new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])),
        end: new Date(Date.UTC(+m[6], +m[4] - 1, +m[5])),
      };
      break;
    }
  }
  if (!period) throw new Error('Could not read the reporting period from the file. Is this a ZKTeco attendance export?');

  // --- Roster: every enrolled user (User ID + Name), even zero-punch ones ---
  const roster = [];
  const seen = new Set();
  // The statistic table has a header row with "User ID"; data follows below it.
  let dataStarted = false;
  for (const row of stat) {
    const first = String((row && row[0]) || '').trim();
    if (first === 'User ID') { dataStarted = true; continue; }
    if (!dataStarted) continue;
    const userId = first;
    const name = String((row && row[1]) || '').trim();
    if (/^\d+$/.test(userId) && !seen.has(userId)) {
      seen.add(userId);
      roster.push({ userId, name });
    }
  }

  // --- Punches, from the detail sheets ---
  // userId -> { name, days: { 'YYYY-MM-DD': { timeIn, timeOut } } }
  const punchMap = new Map();
  const detailSheets = wb.SheetNames.filter((n) => /^[\d,\s]+$/.test(n));

  for (const sheetName of detailSheets) {
    const A = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true });
    for (let r = 0; r < A.length; r++) {
      const rowArr = A[r] || [];
      for (let c = 0; c < rowArr.length; c++) {
        if (String(rowArr[c]).trim() !== 'User ID') continue;
        const userId = String(rowArr[c + 1] ?? '').trim();
        if (!/^\d+$/.test(userId)) continue;
        const name = String((A[r - 1] && A[r - 1][c + 1]) ?? '').trim();
        const base = c - 8; // day-label column for this block
        if (!punchMap.has(userId)) punchMap.set(userId, { name, days: {} });
        const rec = punchMap.get(userId);

        // Walk the day rows of this block. A month rollover shows up as the day
        // number decreasing, so track it against the period's start month.
        let month = period.start.getUTCMonth();
        let year = period.start.getUTCFullYear();
        let prevDay = 0;
        for (let rr = r; rr < A.length; rr++) {
          const label = String((A[rr] && A[rr][base]) ?? '').trim();
          const dm = label.match(/^(\d{1,2})\s+[A-Za-z]{2}$/);
          if (!dm) continue;
          const day = +dm[1];
          if (prevDay && day < prevDay) { month += 1; if (month > 11) { month = 0; year += 1; } }
          prevDay = day;

          const times = [base + 1, base + 3, base + 6, base + 8, base + 10, base + 12]
            .map((cc) => fracToHHMM(A[rr][cc]))
            .filter(Boolean)
            .sort();
          if (!times.length) continue;

          // Morning punches (before noon) are arrivals; afternoon punches are
          // departures. A day with only an afternoon scan therefore has NO
          // time-in — the person forgot to scan in — rather than an arrival that
          // is eleven hours "late". The import penalises the missing in-scan.
          const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          const morning = times.filter((t) => toMin(t) < 720);
          const afternoon = times.filter((t) => toMin(t) >= 720);
          const timeIn = morning[0] || null;
          const timeOut = afternoon.length
            ? afternoon[afternoon.length - 1]
            : (morning.length >= 2 ? morning[morning.length - 1] : null);

          const dateStr = ymd(new Date(Date.UTC(year, month, day)));
          rec.days[dateStr] = { timeIn, timeOut };
        }
      }
    }
  }

  return { period, roster, punches: punchMap };
}
