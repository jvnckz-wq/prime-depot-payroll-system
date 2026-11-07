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

// The time-in, only when it is a real one (not assumed because the in punch is missing).
export const inClock = (row) => (row && !row.isAbsent && row.timeIn && !row.isAssumedIn ? clockOf(row.timeIn) : null);

export const crewIdsOf = (d) => [d.driverId, d.helper1Id, d.helper2Id].filter(Boolean);

// rowOf(id) returns that person's attendance row for the delivery's day (or undefined).
// noScanIds: crew with no scan that day. lateIds: crew whose time-out is before the log time.
// earlyIds: crew whose time-in is after the log time (logged before they arrived; Nov 2026).
// A trip is logged while the crew is at work: after their time-in and before their time-out.
// heldIds: crew whose pay for this trip waits for the Operations Head. A voided trip, or one the
// Operations Head confirmed, has no flags at all.
// checkerFlag: the trip was logged by a checker account whose employee had no time-in at or before
// the log time (only possible while the device was offline). It sends the trip to Needs review but
// holds nobody's pay: the crew's own scans show they were at work.
export function reviewFlags(d, rowOf) {
  const ids = crewIdsOf(d);
  if (d.voided || d.voidedAt || d.reviewedAt) return { noScanIds: [], lateIds: [], earlyIds: [], heldIds: [], checkerFlag: false };
  const logged = manilaClock(d.loggedAt || d.createdAt);
  const noScanIds = ids.filter((id) => !hasScan(rowOf(id)));
  const lateIds = ids.filter((id) => {
    const out = outClock(rowOf(id));
    return !!out && !!logged && logged > out;
  });
  const earlyIds = ids.filter((id) => {
    const inT = inClock(rowOf(id));
    return !!inT && !!logged && logged < inT;
  });
  const heldIds = [...new Set([...noScanIds, ...lateIds, ...earlyIds])];
  const checkerIn = d.checkerId ? inClock(rowOf(d.checkerId)) : null;
  const checkerFlag = !!d.checkerId && !(checkerIn && logged && checkerIn <= logged);
  return { noScanIds, lateIds, earlyIds, heldIds, checkerFlag };
}

export const needsReview = (flags) => flags.heldIds.length > 0 || !!flags.checkerFlag;

// Can this checker log a trip now? Only while on duty: after a real time-in and before a time-out.
// With the device offline the time-in cannot be known yet, so logging is allowed and the trip is
// flagged for review (checkerFlag) until the scan arrives.
export function checkerGate(row, deviceIsOnline) {
  const out = outClock(row);
  if (out) return { status: 'out', out, error: `You timed out at ${out}. Trips can only be logged while you are on duty.` };
  if (inClock(row)) return { status: 'ok', error: null };
  if (deviceIsOnline) return { status: 'not-in', error: 'Time in first. Scan your finger on the device to start logging trips.' };
  return { status: 'offline', error: null };
}

// For a new delivery: the first crew member who already timed out today, as an error message.
export function crewOutError(crew, rowOf) {
  for (const c of crew) {
    const out = outClock(rowOf(c.id));
    if (out) return `${c.name || c.id} is already out (${out}).`;
  }
  return null;
}
