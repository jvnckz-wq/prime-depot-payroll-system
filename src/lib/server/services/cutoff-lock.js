// Finds released cutoffs so their attendance cannot be changed.
import { prisma } from '../db/prisma';
import { cutoffOf, finalizedMessage } from '../../loan-rules';

const asDate = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const isCutoffShaped = (start, end) => { const c = cutoffOf(start); return c.start === start && c.end === end; };

export async function finalizedCutoffsBetween(fromYmd, toYmd) {
  const rows = await prisma.payrollPeriod.findMany({
    where: { isReleased: true, startDate: { lte: asDate(toYmd) }, endDate: { gte: asDate(fromYmd) } },
    select: { startDate: true, endDate: true, label: true, releasedAt: true },
  });
  return rows
    .map((r) => ({ start: ymdOf(r.startDate), end: ymdOf(r.endDate), label: r.label, releasedAt: r.releasedAt }))
    .filter((r) => isCutoffShaped(r.start, r.end));
}

// Only a cutoff finalized today can still be un-finalized, so only then does the message say so.
export const lockedMessage = (locked) => finalizedMessage(locked[0].label || `${locked[0].start} to ${locked[0].end}`, locked[0].releasedAt);

export async function cutoffsWithAttendance() {
  const [dates, released] = await Promise.all([
    prisma.attendance.findMany({ distinct: ['date'], select: { date: true } }),
    prisma.payrollPeriod.findMany({ where: { isReleased: true }, select: { startDate: true, endDate: true } }),
  ]);
  const done = new Set(released.map((r) => `${ymdOf(r.startDate)}|${ymdOf(r.endDate)}`));
  const byStart = new Map();
  for (const { date } of dates) {
    const c = cutoffOf(ymdOf(date));
    const entry = byStart.get(c.start) || { start: c.start, end: c.end, days: 0 };
    entry.days += 1;
    byStart.set(c.start, entry);
  }
  return [...byStart.values()]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((c) => ({ ...c, finalized: done.has(`${c.start}|${c.end}`) }));
}

// Days between from and to (inclusive) that fall inside a finalized cutoff.
export async function lockedDays(fromYmd, toYmd) {
  const locked = await finalizedCutoffsBetween(fromYmd, toYmd);
  const set = new Set();
  for (const c of locked) {
    for (let d = new Date(`${c.start}T00:00:00Z`); d <= new Date(`${c.end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      set.add(d.toISOString().slice(0, 10));
    }
  }
  return { set, labels: locked.map((c) => c.label || `${c.start} to ${c.end}`) };
}
