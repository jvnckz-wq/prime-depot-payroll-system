// Delivery review: who is out, no scan, logged after time-out, and crew pay on hold.
const assert = require('node:assert/strict');
const { clockOf, crewOutError, manilaClock, needsReview, outClock, reviewFlags } = require('../src/lib/delivery-review.js');
const { crewEarnings, crewOnHold, deliveriesToLog } = require('../src/lib/payroll.js');

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
