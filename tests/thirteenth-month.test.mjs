import assert from 'node:assert/strict';
import { thirteenthMonthRows } from '../src/lib/thirteenth-month.js';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const finalPay13th = (basics) => round2(round2(basics.reduce((s, b) => s + Number(b), 0)) / 12);

ok('no released payslips gives an empty report', () => {
  assert.deepEqual(thirteenthMonthRows([]), []);
});

ok('new hire with one cutoff: P7,200 basic gives P600, not the old P13,200 projection', () => {
  const rows = thirteenthMonthRows([{ employeeId: '8', name: 'A', basicPay: 7200, periodStart: '2026-10-01' }]);
  assert.deepEqual(rows, [{ employeeId: '8', name: 'A', months: 1, basic: 7200, pay: 600 }]);
  assert.equal(600 * 22, 13200);
});

ok('two cutoffs in one month count as one month worked', () => {
  const rows = thirteenthMonthRows([
    { employeeId: '3', name: 'B', basicPay: 7800, periodStart: '2026-09-01' },
    { employeeId: '3', name: 'B', basicPay: 8400, periodStart: '2026-09-16' },
    { employeeId: '3', name: 'B', basicPay: 7200, periodStart: '2026-10-01' },
  ]);
  assert.equal(rows[0].months, 2);
  assert.equal(rows[0].basic, 23400);
  assert.equal(rows[0].pay, 1950);
});

ok('centavos match the Final Pay formula exactly', () => {
  const basics = [7333.33, 8166.67, 7916.66, 650.05, 0.01];
  const rows = thirteenthMonthRows(basics.map((b, i) => ({ employeeId: '9', name: 'C', basicPay: b, periodStart: `2026-0${i + 1}-01` })));
  assert.equal(rows[0].pay, finalPay13th(basics));
  assert.equal(rows[0].basic, 24066.72);
  assert.equal(rows[0].pay, 2005.56);
});

ok('one row per employee, sorted by name, Decimal strings accepted', () => {
  const rows = thirteenthMonthRows([
    { employeeId: '2', name: 'Zed', basicPay: '1200.00', periodStart: '2026-01-01' },
    { employeeId: '1', name: 'Ana', basicPay: '600.50', periodStart: '2026-01-16' },
    { employeeId: '2', name: 'Zed', basicPay: '1200.00', periodStart: '2026-02-01' },
  ]);
  assert.deepEqual(rows.map((r) => [r.name, r.months, r.basic, r.pay]), [['Ana', 1, 600.5, 50.04], ['Zed', 2, 2400, 200]]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ok  ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
