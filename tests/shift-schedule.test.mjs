import assert from 'node:assert/strict';
import { minutesLate, callTimeFor, scheduleOn } from '../src/lib/attendance.js';
const tests = []; const ok = (n, f) => tests.push([n, f]);
// Week of Oct 12 2026: Mon 12, Tue 13, Wed 14
const girlie = {
  position: 'ASSISTANT', earlyShiftDays: ['TUE'], earlyShiftTime: '06:00',
  shiftSchedules: [
    { effectiveFrom: '2000-01-01', days: ['MON'], time: '06:00' },
    { effectiveFrom: '2026-10-14', days: ['TUE'], time: '06:00' },
  ],
};
ok('Monday before the change is judged by the old early shift (06:00)', () => {
  assert.equal(callTimeFor(girlie, '2026-10-12'), '06:00');
  assert.equal(minutesLate(girlie, '2026-10-12', '06:40'), 40);
});
ok('Tuesday before the change is judged by the normal call time (06:40)', () => {
  assert.equal(callTimeFor(girlie, '2026-10-13'), '06:40');
  assert.equal(minutesLate(girlie, '2026-10-13', '06:40'), 0);
});
ok('After the change: Tuesday early, Monday normal', () => {
  assert.equal(callTimeFor(girlie, '2026-10-20'), '06:00');
  assert.equal(minutesLate(girlie, '2026-10-20', '06:15'), 15);
  assert.equal(callTimeFor(girlie, '2026-10-19'), '06:40');
});
ok('Dates before the first schedule use the first schedule', () => {
  const e = { ...girlie, shiftSchedules: [{ effectiveFrom: '2026-10-01', days: ['WED'], time: '05:30' }] };
  assert.deepEqual(scheduleOn(e, '2026-07-01'), { days: ['WED'], time: '05:30' });
});
ok('No schedules: falls back to the employee fields', () => {
  assert.equal(callTimeFor({ position: 'ASSISTANT', earlyShiftDays: ['MON'], earlyShiftTime: '06:00' }, '2026-10-12'), '06:00');
});
ok('Operations Head and crew never have an early shift', () => {
  for (const position of ['OPERATIONS_HEAD', 'DRIVER', 'HELPER', 'CHECKER', 'WAREHOUSE_OFFICER']) {
    const e = { position, earlyShiftDays: ['MON'], earlyShiftTime: '06:00', shiftSchedules: [{ effectiveFrom: '2000-01-01', days: ['MON'], time: '06:00' }] };
    assert.notEqual(callTimeFor(e, '2026-10-12'), '06:00', position);
  }
  assert.equal(callTimeFor({ position: 'DRIVER', earlyShiftDays: ['MON'] }, '2026-10-12'), '06:30');
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('  ok  ' + n); } catch (e) { failed++; console.error('  FAIL ' + n + '\n       ' + e.message); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`); if (failed) process.exit(1);
