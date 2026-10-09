import assert from 'node:assert/strict';
import { annualIncomeTax, cutoffThreshold, cutoffWithholding, taxableForCutoff, withholdingCheck } from '../src/lib/withholding.js';

const BIR = [
  { over: 0, notOver: 250000, base: 0, rate: 0 },
  { over: 250000, notOver: 400000, base: 0, rate: 15 },
  { over: 400000, notOver: 800000, base: 22500, rate: 20 },
  { over: 800000, notOver: 2000000, base: 102500, rate: 25 },
  { over: 2000000, notOver: 8000000, base: 402500, rate: 30 },
  { over: 8000000, notOver: null, base: 2202500, rate: 35 },
];
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('annual table: zero up to P250,000, continuous at every bracket edge', () => {
  assert.equal(annualIncomeTax(0, BIR), 0);
  assert.equal(annualIncomeTax(250000, BIR), 0);
  assert.equal(annualIncomeTax(400000, BIR), 22500);
  assert.equal(annualIncomeTax(800000, BIR), 102500);
  assert.equal(annualIncomeTax(2000000, BIR), 402500);
  assert.equal(annualIncomeTax(8000000, BIR), 2202500);
  assert.equal(annualIncomeTax(8000001, BIR), 2202500.35);
});

ok('per-cutoff threshold is P250,000 / 24 = P10,416.67', () => {
  assert.equal(cutoffThreshold(BIR), 10416.67);
  assert.equal(cutoffWithholding(10416.67, BIR), 0);
  assert.equal(cutoffWithholding(10500, BIR), 12.5);
});

ok('matches the 2023 BIR semi-monthly table (P937.50 + 20% over P16,667)', () => {
  assert.equal(cutoffWithholding(12000, BIR), 237.5);
  assert.equal(cutoffWithholding(20000, BIR), 1604.17);
  assert.equal(Math.round((937.5 + 0.2 * (20000 - 16666.67)) * 100) / 100, 1604.17);
});

ok('taxable pay = earnings - tardiness - SSS - PhilHealth - Pag-IBIG (MP2 is not deducted)', () => {
  const calc = { totalEarnings: 13000, tardiness: 50, sss: 750, phic: 325, mp1: 200, mp2: 500 };
  assert.equal(taxableForCutoff(calc), 11675);
  assert.equal(cutoffWithholding(11675, BIR), 188.75);
  assert.equal(taxableForCutoff(null), 0);
  assert.equal(taxableForCutoff({ totalEarnings: 100, sss: 750 }), 0);
});

ok('a typical P650/day staff for 13 days is below the threshold', () => {
  assert.equal(cutoffWithholding(taxableForCutoff({ totalEarnings: 650 * 13, sss: 450, phic: 211.25, mp1: 200 }), BIR), 0);
});

ok('check lists only people above the threshold, highest first, with a total', () => {
  const rows = [
    { emp: { id: '3', name: 'Staff' }, calc: { totalEarnings: 8450, sss: 450, phic: 211.25, mp1: 200 } },
    { emp: { id: '1', name: 'Ops' }, calc: { totalEarnings: 13000, tardiness: 50, sss: 750, phic: 325, mp1: 200 } },
    { emp: { id: '9', name: 'Big' }, calc: { totalEarnings: 21000, sss: 750, phic: 250, mp1: 0 } },
  ];
  const r = withholdingCheck(rows, BIR);
  assert.equal(r.count, 3);
  assert.deepEqual(r.above.map((a) => [a.name, a.taxable, a.tax]), [['Big', 20000, 1604.17], ['Ops', 11675, 188.75]]);
  assert.equal(r.total, 1792.92);
  assert.deepEqual(withholdingCheck([], BIR), { count: 0, above: [], total: 0 });
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ok  ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
