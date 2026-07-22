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
