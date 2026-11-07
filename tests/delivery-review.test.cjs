// Delivery review: who is out, no scan, logged after time-out, and crew pay on hold.
const assert = require('node:assert/strict');
const { checkerGate, clockOf, crewOutError, inClock, manilaClock, needsReview, outClock, reviewFlags } = require('../src/lib/delivery-review.js');
const { crewEarnings, crewOnHold, deliveriesToLog } = require('../src/lib/payroll.js');
const { syncStatusOf } = require('../src/lib/device-sync.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

// Attendance times are the Manila wall clock saved in UTC fields.
const att = (inT, outT, o = {}) => ({
  timeIn: inT ? new Date(`2026-11-02T${inT}:00.000Z`) : null,
  timeOut: outT ? new Date(`2026-11-02T${outT}:00.000Z`) : null,
  isAbsent: false, isAssumedOut: false, ...o,
});
// A real timestamp: 8:41 PM in Manila is 12:41 UTC.
const loggedAt = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(2026, 10, 2, h - 8, m)).toISOString(); };

const trip = (o = {}) => ({ id: 'd1', date: '2026-11-02', driverId: 'D02', helper1Id: 'H03', helper2Id: 'H04', loggedAt: loggedAt('14:06'), reviewedAt: null, voided: false, ...o });

ok('clocks: attendance fields read as wall clock, log time converted to Manila', () => {
  assert.equal(clockOf(new Date('2026-11-02T20:39:00.000Z')), '20:39');
  assert.equal(manilaClock(loggedAt('20:41')), '20:41');
  assert.equal(manilaClock('2026-11-02T16:30:00.000Z'), '00:30');
});

ok('out only counts a real time-out, not an assumed one or an absent day', () => {
  assert.equal(outClock(att('06:26', '20:39')), '20:39');
  assert.equal(outClock(att('06:26', '17:00', { isAssumedOut: true })), null);
  assert.equal(outClock(att(null, null, { isAbsent: true })), null);
  assert.equal(outClock(undefined), null);
  assert.equal(inClock(att('06:30', null)), '06:30');
  assert.equal(inClock(att('06:30', null, { isAssumedIn: true })), null);
});

ok('log block: the first crew member already out today stops the save', () => {
  const rows = { D02: att('06:26', '20:39'), H03: att('06:30', null, { isAssumedOut: true }) };
  assert.equal(crewOutError([{ id: 'H03', name: 'Elmer' }, { id: 'D02', name: 'Eric' }], (id) => rows[id]), 'Eric is already out (20:39).');
  assert.equal(crewOutError([{ id: 'H03', name: 'Elmer' }], (id) => rows[id]), null);
});

ok('no scan: only the helper without a scan is held; driver and other helper are paid', () => {
  const rows = { D02: att('06:20', '17:30'), H03: att('06:25', '17:30') };
  const f = reviewFlags(trip(), (id) => rows[id]);
  assert.deepEqual([f.noScanIds, f.lateIds, f.heldIds], [['H04'], [], ['H04']]);
  assert.equal(needsReview(f), true);
});

ok('logged after time-out: DTR edited to 7:00 PM after an 8:41 PM log puts the driver on hold', () => {
  const rows = { D02: att('06:26', '19:00'), H03: att('06:25', '21:00'), H04: att('06:25', '21:00') };
  const f = reviewFlags(trip({ loggedAt: loggedAt('20:41') }), (id) => rows[id]);
  assert.deepEqual([f.noScanIds, f.lateIds, f.heldIds], [[], ['D02'], ['D02']]);
  // Same minute is not late.
  const same = reviewFlags(trip({ loggedAt: loggedAt('19:00') }), (id) => rows[id]);
  assert.deepEqual(same.lateIds, []);
});

ok('logged before time-in: an 06:00 log for a helper who timed in at 06:30 holds that helper only', () => {
  const rows = { D02: att('05:50', null, { isAssumedOut: true }), H03: att('05:55', null, { isAssumedOut: true }), H04: att('06:30', null, { isAssumedOut: true }) };
  const f = reviewFlags(trip({ loggedAt: loggedAt('06:00') }), (id) => rows[id]);
  assert.deepEqual([f.noScanIds, f.lateIds, f.earlyIds, f.heldIds], [[], [], ['H04'], ['H04']]);
  assert.equal(needsReview(f), true);
});

ok('logged before time-in: same minute is fine, and an assumed time-in is not compared', () => {
  const same = { D02: att('06:00', null, { isAssumedOut: true }), H03: att('06:00', null, { isAssumedOut: true }), H04: att('06:00', null, { isAssumedOut: true }) };
  assert.deepEqual(reviewFlags(trip({ loggedAt: loggedAt('06:00') }), (id) => same[id]).earlyIds, []);
  const assumed = { D02: att('06:30', '17:40', { isAssumedIn: true }), H03: att('05:55', '17:40'), H04: att('05:55', '17:40') };
  assert.deepEqual(reviewFlags(trip({ loggedAt: loggedAt('06:00') }), (id) => assumed[id]).heldIds, []);
});

ok('no scan yet at log time, then the scan arrives later than the log: still held, now as before time-in', () => {
  const before = reviewFlags(trip({ loggedAt: loggedAt('06:00') }), () => undefined);
  assert.deepEqual(before.noScanIds, ['D02', 'H03', 'H04']);
  const rows = { D02: att('05:50', null, { isAssumedOut: true }), H03: att('05:55', null, { isAssumedOut: true }), H04: att('06:40', null, { isAssumedOut: true }) };
  const after = reviewFlags(trip({ loggedAt: loggedAt('06:00') }), (id) => rows[id]);
  assert.deepEqual([after.noScanIds, after.earlyIds, after.heldIds], [[], ['H04'], ['H04']]);
});

ok('scanner status: one rule for every screen and for the checker (live < 30 s, stale < 60 s, then offline)', () => {
  const now = Date.parse('2026-11-07T08:00:00Z');
  const ago = (s) => new Date(now - s * 1000).toISOString();
  assert.deepEqual([syncStatusOf(ago(10), now), syncStatusOf(ago(45), now), syncStatusOf(ago(61), now), syncStatusOf(ago(110), now), syncStatusOf(null, now)],
    ['live', 'stale', 'offline', 'offline', 'offline']);
});

ok('checker gate: logs only after a real time-in and before a time-out; offline device lets it through', () => {
  assert.equal(checkerGate(att('06:25', null, { isAssumedOut: true }), true).status, 'ok');
  assert.deepEqual([checkerGate(undefined, true).status, !!checkerGate(undefined, true).error], ['not-in', true]);
  assert.deepEqual([checkerGate(undefined, false).status, checkerGate(undefined, false).error], ['offline', null]);
  const out = checkerGate(att('06:25', '17:31'), true);
  assert.equal(out.status, 'out');
  assert.equal(out.error, 'You timed out at 17:31. Trips can only be logged while you are on duty.');
  assert.equal(checkerGate(att('06:25', '17:31'), false).status, 'out');
});

ok('checker flag: logged by a checker with no time-in by then goes to review, but holds no crew pay', () => {
  const crewRows = { D02: att('05:50', null, { isAssumedOut: true }), H03: att('05:55', null, { isAssumedOut: true }), H04: att('05:55', null, { isAssumedOut: true }) };
  const noScan = reviewFlags(trip({ checkerId: 'C01', loggedAt: loggedAt('06:00') }), (id) => crewRows[id]);
  assert.deepEqual([noScan.checkerFlag, noScan.heldIds, needsReview(noScan)], [true, [], true]);
  const lateScan = reviewFlags(trip({ checkerId: 'C01', loggedAt: loggedAt('06:00') }), (id) => ({ ...crewRows, C01: att('06:20', null, { isAssumedOut: true }) })[id]);
  assert.equal(lateScan.checkerFlag, true);
  const onDuty = reviewFlags(trip({ checkerId: 'C01', loggedAt: loggedAt('06:00') }), (id) => ({ ...crewRows, C01: att('05:40', null, { isAssumedOut: true }) })[id]);
  assert.deepEqual([onDuty.checkerFlag, needsReview(onDuty)], [false, false]);
  const byOpsHead = reviewFlags(trip({ checkerId: null, loggedAt: loggedAt('06:00') }), (id) => crewRows[id]);
  assert.equal(byOpsHead.checkerFlag, false);
});

ok('confirmed or voided trips carry no flags and hold nothing', () => {
  const rows = {};
  assert.deepEqual(reviewFlags(trip({ reviewedAt: '2026-11-04T01:12:00.000Z' }), (id) => rows[id]).heldIds, []);
  assert.deepEqual(reviewFlags(trip({ voided: true }), (id) => rows[id]).heldIds, []);
});

// Nov 2, TRK-02: Adhesive, 20 bags, double rate (driver ₱1.00 a bag, helpers ₱1.50 a bag shared).
const RATES = { driverDaily: 0, helperDaily: 0, bonusHead: 100, bonusTrips: 5 };
const api = (heldIds, reviewedAt = null) => [{
  id: 'd1', date: '2026-11-02', truckId: 'TRK-02', seq: 1, driver: 'Arnold', helpers: ['Elmer', 'Perlas'],
  crew: [{ role: 'Driver', id: 'D02', name: 'Arnold' }, { role: 'Helper 1', id: 'H03', name: 'Elmer' }, { role: 'Helper 2', id: 'H04', name: 'Perlas' }],
  heldIds, reviewedAt, isDouble: true, voided: false,
  items: [{ item: 'Adhesive', unit: 'bag', qty: 20, driverAmount: 20, helperAmount: 30 }],
}];
const totals = (rows) => Object.fromEntries(rows.map((p) => [p.name, p.total]));

ok('hold math: Perlas ₱15.00 on hold, Arnold ₱20.00 and Elmer ₱15.00 paid; the share is not passed on', () => {
  const log = deliveriesToLog(api(['H04']));
  assert.deepEqual(totals(crewEarnings(log, RATES)), { Arnold: 20, Elmer: 15 });
  assert.deepEqual(crewOnHold(log, RATES).map((h) => [h.name, h.onHold]), [['Perlas', 15]]);
});

ok('after Confirm: Perlas ₱15.00 counts on Nov 2 and nothing is on hold', () => {
  const log = deliveriesToLog(api([], '2026-11-04T01:12:00.000Z'));
  assert.deepEqual(totals(crewEarnings(log, RATES)), { Arnold: 20, Perlas: 15, Elmer: 15 });
  assert.deepEqual(crewOnHold(log, RATES), []);
});

ok('a held trip earns no daily rate and does not count toward the trip bonus', () => {
  const rates = { driverDaily: 280, helperDaily: 240, bonusHead: 100, bonusTrips: 1 };
  const log = deliveriesToLog(api(['D02']));
  const people = crewEarnings(log, rates);
  assert.equal(people.find((p) => p.name === 'Arnold'), undefined);
  const held = crewOnHold(log, rates).find((h) => h.name === 'Arnold');
  assert.equal(held.onHold, 280 + 20 + 100);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  }
  console.log(`\nALL ${passed} DELIVERY REVIEW CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
