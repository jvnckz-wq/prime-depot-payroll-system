import assert from 'node:assert/strict';
import { deliveryRange, MAX_RANGE_DAYS, UNBOUNDED_LIMIT } from '../src/lib/delivery-range.js';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('no range keeps the 500 safety limit', () => {
  assert.deepEqual(deliveryRange(null, null), { take: UNBOUNDED_LIMIT });
  assert.equal(UNBOUNDED_LIMIT, 500);
});

ok('a full month returns every day with no row limit', () => {
  const r = deliveryRange('2026-09-01', '2026-09-30');
  assert.equal(r.error, undefined);
  assert.equal(r.take, undefined);
  assert.equal(r.days, 30);
  assert.equal(r.gte.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(r.lte.toISOString(), '2026-09-30T00:00:00.000Z');
});

ok('a single day works (crew payroll, dashboard)', () => {
  assert.equal(deliveryRange('2026-09-29', '2026-09-29').days, 1);
});

ok('93 days is allowed, 94 is refused with a clear message', () => {
  assert.equal(deliveryRange('2026-07-01', '2026-10-01').days, MAX_RANGE_DAYS);
  assert.match(deliveryRange('2026-07-01', '2026-10-02').error, /at most 93 days.*94 days/);
});

ok('bad input is refused, never silently widened', () => {
  assert.match(deliveryRange('2026-09-30', '2026-09-01').error, /start date is after/);
  assert.match(deliveryRange('2026-09-01', '').error, /both a start date and an end date/);
  assert.match(deliveryRange('2026-02-31', '2026-03-01').error, /real dates/);
  assert.match(deliveryRange('09/01/2026', '2026-09-30').error, /real dates/);
});

ok("client's real volume: the old cap dropped the first days of the month", () => {
  const perDay = 26;
  const rows = [];
  for (let d = 1; d <= 30; d++) for (let i = 0; i < perDay; i++) rows.push({ date: `2026-09-${String(d).padStart(2, '0')}` });
  const newestFirst = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const oldResult = newestFirst.slice(0, 500);
  const oldFirstDay = oldResult[oldResult.length - 1].date;
  assert.equal(rows.length, 780);
  assert.equal(oldResult.length, 500);
  assert.equal(oldFirstDay > '2026-09-10', true);
  const r = deliveryRange('2026-09-01', '2026-09-30');
  const newResult = rows.filter((x) => new Date(x.date + 'T00:00:00Z') >= r.gte && new Date(x.date + 'T00:00:00Z') <= r.lte);
  assert.equal(newResult.length, 780);
});

let passed = 0;
for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
console.log(`\nALL ${passed} DELIVERY RANGE CHECKS PASSED`);
