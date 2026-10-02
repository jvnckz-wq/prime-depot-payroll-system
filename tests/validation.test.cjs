const assert = require('node:assert/strict');
const { validateSss, validatePhilhealth, validatePagibig, validateBir } = require('../src/lib/server/services/statutory.js');
const { SSS_TABLE_INIT, PHILHEALTH_INIT, PAGIBIG_INIT, BIR_TABLE_INIT } = require('../src/data/seed.js');
const { isClockTime, isCalendarDate } = require('../src/lib/attendance.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const copy = (x) => JSON.parse(JSON.stringify(x));

ok('the real 2026 tables are accepted', () => {
  assert.equal(validateSss(SSS_TABLE_INIT), null);
  assert.equal(validatePhilhealth(PHILHEALTH_INIT), null);
  assert.equal(validatePagibig(PAGIBIG_INIT), null);
  assert.equal(validateBir(BIR_TABLE_INIT), null);
});

ok('PhilHealth typo 50% instead of 5% is refused, and so are a floor above the ceiling and text', () => {
  assert.match(validatePhilhealth({ ...PHILHEALTH_INIT, rate: 50 }), /at most 10%/);
  assert.match(validatePhilhealth({ ...PHILHEALTH_INIT, rate: 0 }), /above 0%/);
  assert.match(validatePhilhealth({ ...PHILHEALTH_INIT, floor: 200000 }), /higher than the floor/);
  assert.match(validatePhilhealth({ ...PHILHEALTH_INIT, rate: 'abc' }), /premium rate/);
});

ok('SSS: an extra zero, a negative share, ceilings out of order, or no open last row are refused', () => {
  const extraZero = copy(SSS_TABLE_INIT); extraZero[0].share = 2500;
  assert.match(validateSss(extraZero), /row 1: .*more than 20%/);
  const negative = copy(SSS_TABLE_INIT); negative[3].share = -1;
  assert.match(validateSss(negative), /row 4: .*zero or more/);
  const disorder = copy(SSS_TABLE_INIT); disorder[5].ceiling = 5000;
  assert.match(validateSss(disorder), /row 6: each ceiling must be higher/);
  const closed = copy(SSS_TABLE_INIT); closed[60].ceiling = 99999;
  assert.match(validateSss(closed), /last row must have no ceiling/);
  const lastExtraZero = copy(SSS_TABLE_INIT); lastExtraZero[60].share = 17500;
  assert.match(validateSss(lastExtraZero), /row 61: .*more than 20%/);
  assert.match(validateSss([]), /cannot be empty/);
});

ok('Pag-IBIG: rate above 10%, a cap above ₱5,000, or no brackets are refused', () => {
  assert.match(validatePagibig({ ...PAGIBIG_INIT, brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 20 }] }), /row 2: .*0% to 10%/);
  assert.match(validatePagibig({ ...PAGIBIG_INIT, cap: 20000 }), /₱0 to ₱5,000/);
  assert.match(validatePagibig({ ...PAGIBIG_INIT, brackets: [] }), /at least one bracket/);
});

ok('BIR: must start at ₱0, go up in order, and keep rates at 50% or less', () => {
  const start = copy(BIR_TABLE_INIT); start[0].over = 1000;
  assert.match(validateBir(start), /must start at ₱0/);
  const rate = copy(BIR_TABLE_INIT); rate[2].rate = 200;
  assert.match(validateBir(rate), /row 3: the rate/);
  const order = copy(BIR_TABLE_INIT); order[2].notOver = 300000;
  assert.match(validateBir(order), /row 3:/);
});

ok('clock times: 00:00 to 23:59 only', () => {
  for (const t of ['00:00', '06:30', '17:00', '23:59']) assert.equal(isClockTime(t), true, t);
  for (const t of ['99:99', '24:00', '12:60', '6:30', '', null, '06:30:00']) assert.equal(isClockTime(t), false, String(t));
});

ok('calendar dates: real days only', () => {
  for (const d of ['2026-10-02', '2028-02-29']) assert.equal(isCalendarDate(d), true, d);
  for (const d of ['2026-99-99', '2026-02-30', '2027-02-29', '2026-10-2', '', null]) assert.equal(isCalendarDate(d), false, String(d));
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
  console.log(`\nALL ${passed} VALIDATION CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
