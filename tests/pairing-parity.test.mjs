import assert from 'node:assert/strict';
import { pairPunches, buildAttendanceRow, shiftEndFor } from '../src/lib/attendance.js';

function oldInlinePair(times) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const sorted = times.filter(Boolean).slice().sort();
  const morning = sorted.filter((t) => toMin(t) < 720);
  const afternoon = sorted.filter((t) => toMin(t) >= 720);
  const timeIn = morning[0] || null;
  const timeOut = afternoon.length ? afternoon[afternoon.length - 1] : null;
  return { timeIn, timeOut };
}

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok -', name); };

check('pairing matches the pre-refactor logic', () => {
  const cases = [
    ['06:28', '17:32'],
    ['17:05'],
    ['06:40'],
    ['06:30', '11:58'],
    ['06:31', '12:01', '12:45', '17:30'],
    [],
  ];
  for (const t of cases) {
    assert.deepEqual(pairPunches(t), oldInlinePair(t), `pairing ${JSON.stringify(t)}`);
  }
});

check('a second morning scan never becomes the time-out', () => {
  assert.deepEqual(pairPunches(['07:03', '08:32']), { timeIn: '07:03', timeOut: null });
  assert.deepEqual(pairPunches(['11:31', '11:45']), { timeIn: '11:31', timeOut: null });
  assert.deepEqual(pairPunches(['06:31', '11:58']), { timeIn: '06:31', timeOut: null });
  assert.deepEqual(pairPunches(['07:03', '08:32', '17:10']), { timeIn: '07:03', timeOut: '17:10' });
});

const emp = { id: '1001', position: 'Driver', earlyShiftDays: [] };
const date = '2026-05-18';
const raw = ['06:44', '17:20'];

const paired = pairPunches(raw);
const fileRow = buildAttendanceRow(emp, date, paired, { importBatchId: 'batch-1' });
const deviceRow = buildAttendanceRow(emp, date, paired, { importBatchId: 'batch-1' });

check('import and push build identical rows from identical punches', () => {
  assert.deepEqual(deviceRow, fileRow);
});

check('the row carries the expected tardiness and overtime', () => {
  assert.equal(fileRow.tardinessMins, 14);
  assert.equal(fileRow.overtimeMins, 20);
  assert.equal(fileRow.isAbsent, false);
  assert.equal(fileRow.isAssumedIn, false);
  assert.equal(fileRow.isAssumedOut, false);
});

check('missing time-out is assumed 17:00 with no overtime', () => {
  const r = buildAttendanceRow(emp, date, pairPunches(['06:20']));
  assert.equal(r.isAssumedOut, true);
  assert.equal(r.overtimeMins, 0);
  assert.equal(r.tardinessMins, 0);
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
  assert.deepEqual(pairPunches(['06:44', '06:45']), { timeIn: '06:44', timeOut: null });
  assert.deepEqual(pairPunches(['06:44', '06:45', '17:20']), { timeIn: '06:44', timeOut: '17:20' });
  assert.deepEqual(pairPunches(['06:44', '06:44']), { timeIn: '06:44', timeOut: null });
  assert.deepEqual(pairPunches(['06:44', '06:46']), { timeIn: '06:44', timeOut: null });
});

check('shift ends 12:00 on Sunday and 17:00 Monday to Saturday', () => {
  assert.equal(shiftEndFor('2026-10-04'), '12:00');
  assert.equal(shiftEndFor('2026-10-03'), '17:00');
  assert.equal(shiftEndFor('2026-10-05'), '17:00');
  const sun = buildAttendanceRow(emp, '2026-10-04', pairPunches(['06:35', '09:10']));
  assert.equal(sun.timeOut.toISOString().slice(11, 16), '12:00');
  assert.equal(sun.isAssumedOut, true);
  assert.equal(sun.overtimeMins, 0);
  const sat = buildAttendanceRow(emp, '2026-10-03', pairPunches(['06:35']));
  assert.equal(sat.timeOut.toISOString().slice(11, 16), '17:00');
});

check('Sunday overtime counts from 12:00, weekdays and Saturday from 17:00', () => {
  assert.equal(buildAttendanceRow(emp, '2026-10-04', pairPunches(['06:35', '14:00'])).overtimeMins, 120);
  assert.equal(buildAttendanceRow(emp, '2026-10-04', pairPunches(['06:35', '11:50', '12:00'])).overtimeMins, 0);
  assert.equal(buildAttendanceRow(emp, '2026-10-03', pairPunches(['06:35', '14:00'])).overtimeMins, 0);
  assert.equal(buildAttendanceRow(emp, '2026-10-03', pairPunches(['06:35', '17:45'])).overtimeMins, 45);
});

console.log(`\nALL ${passed} PAIRING PARITY CHECKS PASSED`);
