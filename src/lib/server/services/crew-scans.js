// Checks which crew members scanned in on a delivery day, and which trips need review.
import { prisma } from '../db/prisma';
import { crewIdsOf, hasScan, needsReview, reviewFlags } from '../../delivery-review';
import { syncStatusOf } from '../../device-sync';

const asDate = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

// Attendance rows of the given crew on the given dates, keyed "id|YYYY-MM-DD".
export async function crewDayRows(dates, ids) {
  const uniqDates = [...new Set(dates)].filter(Boolean);
  const uniqIds = [...new Set(ids)].filter(Boolean);
  if (!uniqDates.length || !uniqIds.length) return new Map();
  const rows = await prisma.attendance.findMany({
    where: { date: { in: uniqDates.map(asDate) }, employeeId: { in: uniqIds } },
    select: { employeeId: true, date: true, timeIn: true, timeOut: true, isAbsent: true, isAssumedIn: true, isAssumedOut: true },
  });
  return new Map(rows.map((r) => [`${r.employeeId}|${ymdOf(r.date)}`, r]));
}

// Crew who actually scanned on the given dates (a real time in or out, not absent).
export async function scannedSet(dates, ids) {
  const rows = await crewDayRows(dates, ids);
  return new Set([...rows].filter(([, r]) => hasScan(r)).map(([k]) => k));
}

// For shaped deliveries: the review flags of each one (crew with no scan, crew logged after their
// time-out or before their time-in, and the crew whose pay for the trip is on hold). Confirmed and
// voided trips have none.
export async function withReview(shaped, namesById) {
  const live = shaped.filter((d) => !d.voided && !d.reviewedAt);
  const rows = await crewDayRows(live.map((d) => d.date), [...live.flatMap(crewIdsOf), ...live.map((d) => d.checkerId).filter(Boolean)]);
  return shaped.map((d) => {
    const f = reviewFlags(d, (id) => rows.get(`${id}|${d.date}`));
    const name = (id) => namesById.get(id) || id;
    return { ...d, noScan: f.noScanIds.map(name), noScanIds: f.noScanIds, lateIds: f.lateIds, earlyIds: f.earlyIds, heldIds: f.heldIds, checkerFlag: f.checkerFlag };
  });
}

export async function deviceOnline() {
  const sync = await prisma.deviceSync.findUnique({ where: { id: 'primary' }, select: { lastSyncAt: true } }).catch(() => null);
  return syncStatusOf(sync?.lastSyncAt) !== 'offline';
}

// Recent deliveries that still need the Operations Head's review.
export async function countReviewDeliveries(days = 31) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.delivery.findMany({
    where: { date: { gte: since }, voidedAt: null, reviewedAt: null },
    select: { date: true, driverId: true, helper1Id: true, helper2Id: true, createdAt: true, loggedBy: { select: { role: true, employeeId: true } } },
  });
  const trips = rows.map((r) => ({ ...r, checkerId: r.loggedBy?.role === 'CHECKER' ? r.loggedBy.employeeId : null }));
  const att = await crewDayRows(trips.map((r) => ymdOf(r.date)), [...trips.flatMap(crewIdsOf), ...trips.map((r) => r.checkerId).filter(Boolean)]);
  return trips.filter((r) => needsReview(reviewFlags(r, (id) => att.get(`${id}|${ymdOf(r.date)}`)))).length;
}
