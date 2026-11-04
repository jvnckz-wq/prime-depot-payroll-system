// Delivery review rules (no database access, so tests and the browser can load it).
// Attendance times are stored as the Manila wall clock in UTC fields ("20:39" is saved as 20:39Z),
// while createdAt is a real timestamp, so the log time is converted to Manila before comparing.

const MANILA_MS = 8 * 60 * 60 * 1000;

// The wall-clock HH:MM of an attendance time field.
export const clockOf = (d) => (d ? new Date(d).toISOString().slice(11, 16) : null);

// The Manila HH:MM of a real timestamp (when a delivery was logged).
export const manilaClock = (d) => (d ? new Date(new Date(d).getTime() + MANILA_MS).toISOString().slice(11, 16) : null);

// Scanned that day: a real time in or out, not marked absent (same rule as the no-scan check).
export const hasScan = (row) => !!row && !row.isAbsent && (!!row.timeIn || !!row.timeOut);

// The time-out, only when it is a real one (not assumed because the out punch is missing).
export const outClock = (row) => (row && !row.isAbsent && row.timeOut && !row.isAssumedOut ? clockOf(row.timeOut) : null);

export const crewIdsOf = (d) => [d.driverId, d.helper1Id, d.helper2Id].filter(Boolean);

// rowOf(id) returns that person's attendance row for the delivery's day (or undefined).
// noScanIds: crew with no scan that day. lateIds: crew whose time-out is before the log time.
// heldIds: crew whose pay for this trip waits for the Operations Head. A voided trip, or one the
// Operations Head confirmed, has no flags at all.
export function reviewFlags(d, rowOf) {
  const ids = crewIdsOf(d);
  if (d.voided || d.voidedAt || d.reviewedAt) return { noScanIds: [], lateIds: [], heldIds: [] };
  const logged = manilaClock(d.loggedAt || d.createdAt);
  const noScanIds = ids.filter((id) => !hasScan(rowOf(id)));
  const lateIds = ids.filter((id) => {
    const out = outClock(rowOf(id));
    return !!out && !!logged && logged > out;
  });
  const heldIds = [...new Set([...noScanIds, ...lateIds])];
  return { noScanIds, lateIds, heldIds };
}

export const needsReview = (flags) => flags.heldIds.length > 0;

// For a new delivery: the first crew member who already timed out today, as an error message.
export function crewOutError(crew, rowOf) {
  for (const c of crew) {
    const out = outClock(rowOf(c.id));
    if (out) return `${c.name || c.id} is already out (${out}).`;
  }
  return null;
}
