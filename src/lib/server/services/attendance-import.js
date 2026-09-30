import * as XLSX from 'xlsx';
import { pairPunches } from '../../attendance';

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

  const roster = [];
  const seen = new Set();
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
        const base = c - 8; 
        if (!punchMap.has(userId)) punchMap.set(userId, { name, days: {} });
        const rec = punchMap.get(userId);

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

          const { timeIn, timeOut } = pairPunches(times);

          const dateStr = ymd(new Date(Date.UTC(year, month, day)));
          rec.days[dateStr] = { timeIn, timeOut };
        }
      }
    }
  }

  return { period, roster, punches: punchMap };
}