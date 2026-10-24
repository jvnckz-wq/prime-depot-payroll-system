import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attlogForCutoff, decodeAttlog, readAttlog, AttlogError } from '../src/lib/attlog.js';
import { buildAttendanceRow } from '../src/lib/attendance.js';

let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log('ok', name); };
const text = decodeAttlog(readFileSync(new URL('./fixtures/sample_attlog.dat', import.meta.url)));
const today = '2026-10-24';

t('reads all 69 scans, none skipped', () => {
  const r = readAttlog(text);
  assert.equal(r.scans.length, 69);
  assert.equal(r.badLines, 0);
  assert.equal(r.lastYmd, '2026-10-24');
});

t('cutoff Oct 16-31 ends at the last scan day', () => {
  const r = attlogForCutoff(text, '2026-10-16', today);
  assert.equal(r.period.start.toISOString().slice(0, 10), '2026-10-16');
  assert.equal(r.period.end.toISOString().slice(0, 10), '2026-10-24');
  assert.equal(r.cutoffEnd, '2026-10-31');
  assert.equal(r.scansUsed, 69);
  assert.equal(r.roster.length, 10);
});

t('status column is ignored: pairing by time', () => {
  const r = attlogForCutoff(text, '2026-10-16', today);
  const d = r.punches.get('60').days;
  assert.deepEqual(d['2026-10-16'], { timeIn: '06:23', timeOut: '17:26' });
  assert.deepEqual(d['2026-10-17'], { timeIn: '06:48', timeOut: null });
  assert.deepEqual(d['2026-10-22'], { timeIn: null, timeOut: '17:21' });
  assert.equal(d['2026-10-19'], undefined);
  assert.equal(r.punches.get('65').days['2026-10-22'], undefined);
});

t('rows: Saturday morning-only gets assumed 17:00 out; 07:16 is late for daily', () => {
  const r = attlogForCutoff(text, '2026-10-16', today);
  const emp = { id: '60', position: 'DRIVER', shiftSchedules: [] };
  const sat = buildAttendanceRow(emp, '2026-10-17', r.punches.get('60').days['2026-10-17']);
  assert.equal(sat.isAbsent, false);
  assert.equal(sat.timeOut.toISOString().slice(11, 16), '17:00');
  const wed = buildAttendanceRow(emp, '2026-10-21', r.punches.get('60').days['2026-10-21']);
  assert.equal(wed.tardinessMins, 46);
  const none = buildAttendanceRow(emp, '2026-10-19', null);
  assert.equal(none.isAbsent, true);
});

t('wrong cutoff and bad input give clear 400 errors', () => {
  assert.throws(() => attlogForCutoff(text, '2026-10-01', today), (e) => e instanceof AttlogError && e.status === 400 && /no scans/.test(e.message));
  assert.throws(() => attlogForCutoff(text, '2026-10-05', today), /not a valid cutoff/);
  assert.throws(() => attlogForCutoff(text, '2026-11-01', today), /not started/);
  assert.throws(() => attlogForCutoff('hello\nworld', '2026-10-16', today), /Could not read any scans/);
});

t('bad lines are skipped and counted; duplicates collapse', () => {
  const s = '  7\t2026-10-20 06:10:00\t1\t255\t1\t0\r\n  7\t2026-10-20 06:10:30\t1\t255\t1\t0\r\ngarbage\n  7\t2026-13-40 06:10:00\t1\n  7\t2026-10-20 17:05:00\t1\t255\t1\t0\n';
  const r = attlogForCutoff(s, '2026-10-16', today);
  assert.equal(r.badLines, 2);
  assert.deepEqual(r.punches.get('7').days['2026-10-20'], { timeIn: '06:10', timeOut: '17:05' });
});

t('UTF-16 export decodes the same', () => {
  const r = readAttlog(decodeAttlog(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])));
  assert.equal(r.scans.length, 69);
});

console.log(`attlog: ${passed}/7 passed`);
