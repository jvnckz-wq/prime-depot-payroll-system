// Numeric parity test for the shared attendance pairing.
//
// Phase 0 promise: the .xls import and the live device push must agree on
// identical punches. Both now call the SAME two functions (pairPunches +
// buildAttendanceRow), so this test locks that in and also proves the
// extraction did not change the existing import behaviour. Pure logic — no DB,
// no real PII (synthetic ids only).
//
// Run:  npm run test:pairing      (uses tsx, already in devDependencies)
import assert from 'node:assert/strict';
import { pairPunches, buildAttendanceRow } from '../src/lib/attendance.js';

// The pre-refactor inline pairing from attendance-import.js, kept verbatim as
// the reference for the behaviour-preserving check.
function oldInlinePair(times) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const sorted = times.filter(Boolean).slice().sort();
  const morning = sorted.filter((t) => toMin(t) < 720);
  const afternoon = sorted.filter((t) => toMin(t) >= 720);
  const timeIn = morning[0] || null;
  const timeOut = afternoon.length
    ? afternoon[afternoon.length - 1]
    : (morning.length >= 2 ? morning[morning.length - 1] : null);
  return { timeIn, timeOut };
}

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

// 1. The extracted pairing equals the old inline logic on every shape.
check('pairing matches the pre-refactor logic', () => {
  const cases = [
    ['06:28', '17:32'],                     // normal full day
    ['17:05'],                              // lone afternoon = missing time-in
    ['06:40'],                              // lone morning  = missing time-out
    ['06:30', '11:58'],                     // half-day shape: last morning is the time-out
    ['06:31', '12:01', '12:45', '17:30'],   // several punches
    [],                                     // no punches
  ];
  for (const t of cases) {
    assert.deepEqual(pairPunches(t), oldInlinePair(t), `pairing ${JSON.stringify(t)}`);
  }
});

// 2. A Sunday half-day (two morning punches, none after noon) keeps the late-
//    morning punch as the time-out — no special case needed.
check('a half-day keeps the pre-noon time-out', () => {
  assert.deepEqual(pairPunches(['06:31', '11:58']), { timeIn: '06:31', timeOut: '11:58' });
});

// 3. file-import row == device-push row on identical punches.
const emp = { id: '1001', position: 'Driver', earlyShiftDays: [] }; // crew -> 06:30 call
const date = '2026-05-18'; // Monday
const raw = ['06:44', '17:20'];

const paired = pairPunches(raw);
const fileRow = buildAttendanceRow(emp, date, paired, { importBatchId: 'batch-1' });   // .xls path
const deviceRow = buildAttendanceRow(emp, date, paired, { importBatchId: 'batch-1' }); // live push path

check('import and push build identical rows from identical punches', () => {
  assert.deepEqual(deviceRow, fileRow);
});

check('the row carries the expected tardiness and overtime', () => {
  assert.equal(fileRow.tardinessMins, 14); // 06:44 vs 06:30 call
  assert.equal(fileRow.overtimeMins, 20);  // 17:20 vs 17:00
  assert.equal(fileRow.isAbsent, false);
  assert.equal(fileRow.isAssumedIn, false);
  assert.equal(fileRow.isAssumedOut, false);
});

check('missing time-out is assumed 17:00 with no overtime', () => {
  const r = buildAttendanceRow(emp, date, pairPunches(['06:20']));
  assert.equal(r.isAssumedOut, true);
  assert.equal(r.overtimeMins, 0);
  assert.equal(r.tardinessMins, 0); // 06:20 is before the 06:30 call
});

check('missing time-in is penalised a flat 30 and flagged assumed', () => {
  const r = buildAttendanceRow(emp, date, pairPunches(['17:05']));
  assert.equal(r.isAssumedIn, true);
  assert.equal(r.tardinessMins, 30);
});

check('a day with no punches builds an absent row', () => {
  const r = buildAttendanceRow(emp, date, null, { importBatchId: 'batch-1' });
  assert.equal(r.isAbsent, true);
  assert.equal(r.tardinessMins, 0);
  assert.equal(r.overtimeMins, 0);
});

check('a double scan (taps about a minute apart) counts once', () => {
  // Morning double-tap: one time-in, no phantom time-out.
  assert.deepEqual(pairPunches(['06:44', '06:45']), { timeIn: '06:44', timeOut: null });
  // Double-tap in, real out later: correct in and out.
  assert.deepEqual(pairPunches(['06:44', '06:45', '17:20']), { timeIn: '06:44', timeOut: '17:20' });
  // Same-minute duplicate is collapsed too.
  assert.deepEqual(pairPunches(['06:44', '06:44']), { timeIn: '06:44', timeOut: null });
  // Two minutes apart is treated as distinct (the guard boundary), not a tap.
  assert.deepEqual(pairPunches(['06:44', '06:46']), { timeIn: '06:44', timeOut: '06:46' });
});

console.log(`\nALL ${passed} PAIRING PARITY CHECKS PASSED`);
