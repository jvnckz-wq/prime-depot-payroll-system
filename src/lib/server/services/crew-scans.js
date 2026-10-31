// Checks which crew members scanned in on a delivery day.
import { prisma } from '../db/prisma';

const asDate = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const ONLINE_MS = 2 * 60 * 1000;

// Crew who actually scanned on the given dates (a real time in or out, not absent).
export async function scannedSet(dates, ids) {
  const uniqDates = [...new Set(dates)].filter(Boolean);
  const uniqIds = [...new Set(ids)].filter(Boolean);
  if (!uniqDates.length || !uniqIds.length) return new Set();
  const rows = await prisma.attendance.findMany({
    where: {
      date: { in: uniqDates.map(asDate) },
      employeeId: { in: uniqIds },
      isAbsent: false,
      OR: [{ timeIn: { not: null } }, { timeOut: { not: null } }],
    },
    select: { employeeId: true, date: true },
  });
  return new Set(rows.map((r) => `${r.employeeId}|${ymdOf(r.date)}`));
}

// For shaped deliveries: the crew on each one with no scan that day.
export async function withNoScan(shaped, namesById) {
  const live = shaped.filter((d) => !d.voided);
  const seen = await scannedSet(live.map((d) => d.date), live.flatMap((d) => [d.driverId, d.helper1Id, d.helper2Id]));
  return shaped.map((d) => {
    if (d.voided) return { ...d, noScan: [], noScanIds: [] };
    const missingIds = [d.driverId, d.helper1Id, d.helper2Id].filter((id) => id && !seen.has(`${id}|${d.date}`));
    return { ...d, noScan: missingIds.map((id) => namesById.get(id) || id), noScanIds: missingIds };
  });
}

export async function deviceOnline() {
  const sync = await prisma.deviceSync.findUnique({ where: { id: 'primary' }, select: { lastSyncAt: true } }).catch(() => null);
  return !!(sync && Date.now() - new Date(sync.lastSyncAt).getTime() < ONLINE_MS);
}

// Recent deliveries (not voided) that include crew with no scan that day.
export async function countNoScanDeliveries(days = 31) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.delivery.findMany({
    where: { date: { gte: since }, voidedAt: null },
    select: { date: true, driverId: true, helper1Id: true, helper2Id: true },
  });
  const seen = await scannedSet(rows.map((r) => ymdOf(r.date)), rows.flatMap((r) => [r.driverId, r.helper1Id, r.helper2Id]));
  return rows.filter((r) => [r.driverId, r.helper1Id, r.helper2Id].some((id) => id && !seen.has(`${id}|${ymdOf(r.date)}`))).length;
}
