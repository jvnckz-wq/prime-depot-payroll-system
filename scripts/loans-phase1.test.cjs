// Numeric checks for the Loans & Cash Advances split (Phase 1).
//
// Pure logic, no database: applyLoanDeductions runs against a tiny in-memory
// stand-in for Prisma that records what would be written. Synthetic ids only.
// The staff figures reuse the 2026 statutory tables and rates from the seed, so
// the expected numbers match what the real payslip shows.
//
// Run:  npm run test:loans
// (CommonJS + require so tsx can load the app's extensionless ESM imports.)

const assert = require('node:assert/strict');
const { computeStaffPayroll } = require('../src/lib/payroll.js');
const R = require('../src/lib/loan-rules.js');
const { applyLoanDeductions, runEndOf } = require('../src/lib/loans-apply.js');

// Collected first, then run one by one so async checks finish in order.
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

// --- statutory tables (2026, as seeded) -----------------------------------
const C = [[4250,135],[4750,157.5],[5250,180],[5750,202.5],[6250,225],[6750,247.5],[7250,270],[7750,292.5],[8250,315],[8750,337.5],[9250,360],[9750,382.5],[10250,405],[10750,427.5],[11250,450],[11750,472.5],[12250,495],[12750,517.5],[13250,540],[13750,562.5],[14250,585],[14750,607.5],[15250,630],[15750,652.5],[16250,675],[16750,697.5],[17250,720],[17750,742.5],[18250,765],[18750,787.5],[19250,810],[19750,832.5],[20250,855],[null,900]];
const statutory = {
  sss: C.map(([ceiling, share]) => ({ ceiling, share })),
  philhealth: { rate: 5, floor: 10000, ceiling: 100000 },
  pagibig: { cap: 200, brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }] },
};
const att = (present, lateMins = 0) => ({ present, leave: 0, lateMins, otWeekdayMins: 0, otWeekendMins: 0 });

// A shaped loan (the form the browser and payroll math read).
const shaped = (o) => ({
  id: o.id, employeeId: o.employeeId, kind: o.kind || 'LOAN', purpose: o.kind === 'CASH_ADVANCE' ? null : (o.purpose || 'Emergency'),
  dateGranted: o.dateGranted || '2026-09-01', isCrew: !!o.isCrew, person: o.person || 'X', principal: o.principal,
  perCutoff: o.perCutoff, paused: !!o.paused, settled: !!o.settled, entries: o.entries,
});
const grant = (amount, ymd = '2026-09-01') => ({ type: 'grant', amount, ymd, payslipId: null });
const ded = (amount, key) => ({ type: 'deduction', amount, payslipId: key });

console.log('Loans & Advances, Phase 1');

// --- payslip split: same net as before, lines apart ------------------------
const KEY = 'staff-September 16–30, 2026';
const staffA = { id: 'emp-a', name: 'Staff A', rate: 700, declaredSalary: 18200, sssOn: true, phOn: true, piOn: true, mp2: 500, allowance: 0 };

ok('loan and cash advance land on separate lines; net unchanged (2,646.25)', () => {
  const loans = [
    shaped({ id: 'L1', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, entries: [grant(5000), ded(1000, 'staff-x'), ded(1000, KEY)] }),
    shaped({ id: 'A1', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 3500, perCutoff: 3500, dateGranted: '2026-09-22', entries: [grant(3500, '2026-09-22'), ded(3500, KEY)] }),
  ];
  const c = computeStaffPayroll(staffA, loans, statutory, att(12, 15), KEY);
  assert.equal(c.loanDeduction, 1000);
  assert.equal(c.advanceDeduction, 3500);
  assert.equal(c.advance, 4500);          // stored snapshot total, as before
  assert.equal(c.totalDeductions, 5753.75);
  assert.equal(c.net, 2646.25);
  const loanLine = c.deductionLines.find((d) => d.kind === 'LOAN');
  assert.equal(loanLine.balanceAfter, 3000); // 5,000 - 1,000 - 1,000
});

ok('matched by employeeId: a renamed employee keeps the deduction, a namesake gets none', () => {
  const loans = [shaped({ id: 'L1', employeeId: 'emp-a', person: 'Old Spelling', principal: 5000, perCutoff: 1000, entries: [grant(5000), ded(1000, KEY)] })];
  assert.equal(computeStaffPayroll(staffA, loans, statutory, att(12), KEY).loanDeduction, 1000);
  const namesake = { ...staffA, id: 'emp-b' };
  assert.equal(computeStaffPayroll(namesake, loans, statutory, att(12), KEY).advance, 0);
});

ok('an applied deduction still shows after the loan is paused', () => {
  const loans = [shaped({ id: 'L1', employeeId: 'emp-a', paused: true, principal: 5000, perCutoff: 1000, entries: [grant(5000), ded(1000, KEY)] })];
  assert.equal(computeStaffPayroll(staffA, loans, statutory, att(12), KEY).loanDeduction, 1000);
});

// --- cutoff and working-day rules ------------------------------------------
ok('cutoffOf / nextCutoff handle both halves and year end', () => {
  assert.deepEqual(R.cutoffOf('2026-09-29'), { start: '2026-09-16', end: '2026-09-30' });
  assert.deepEqual(R.cutoffOf('2026-02-20'), { start: '2026-02-16', end: '2026-02-28' });
  assert.deepEqual(R.nextCutoff('2026-12-31'), { start: '2027-01-01', end: '2027-01-15' });
});

ok('working days are Monday to Saturday (Sep 16-30, 2026 = 13)', () => {
  assert.equal(R.workingDaysIn({ start: '2026-09-16', end: '2026-09-30' }), 13);
  assert.equal(R.workingDaysIn({ start: '2026-09-01', end: '2026-09-15' }), 13);
});

ok('cash-advance limit = projected gross (650 x 13 = 8,450)', () => {
  assert.equal(R.projectedGross(650, R.cutoffOf('2026-09-29')), 8450);
  assert.equal(R.projectedGross(700, R.cutoffOf('2026-09-29')), 9100);
});

ok('estimated take-home for the advance warning (7,878.75)', () => {
  const e = { id: 'emp-c', name: 'Staff C', rate: 650, declaredSalary: 16900, sssOn: true, phOn: true, piOn: false, mp2: 0, allowance: 0 };
  assert.equal(computeStaffPayroll(e, [], statutory, att(13)).net, 7878.75);
});

ok('advances already taken in a cutoff are summed per employee', () => {
  const loans = [
    shaped({ id: 'A1', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 2000, dateGranted: '2026-09-18', entries: [grant(2000)] }),
    shaped({ id: 'A2', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 1500, dateGranted: '2026-09-25', entries: [grant(1500)] }),
    shaped({ id: 'A3', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 9999, dateGranted: '2026-10-02', entries: [grant(9999)] }),
    shaped({ id: 'A4', employeeId: 'emp-b', kind: 'CASH_ADVANCE', principal: 500, dateGranted: '2026-09-20', entries: [grant(500)] }),
  ];
  assert.equal(R.advancedInCutoff(loans, 'emp-a', R.cutoffOf('2026-09-29')), 3500);
});

ok('payoff plan: 6,000 at 1,000 from Sep 29 ends Dec 15; top-up to 5,000 ends Nov 30', () => {
  assert.deepEqual(R.payoffPlan(6000, 1000, '2026-09-29'), { count: 6, first: '2026-09-30', last: '2026-12-15' });
  assert.deepEqual(R.payoffPlan(5000, 1000, '2026-09-29'), { count: 5, first: '2026-09-30', last: '2026-11-30' });
});

ok('due amount: advance in full, loan one installment capped at the balance', () => {
  const adv = shaped({ kind: 'CASH_ADVANCE', principal: 3500, perCutoff: 500, entries: [grant(3500)] });
  assert.equal(R.dueAmount(adv), 3500); // even an old record set to 500 per cutoff
  const loan = shaped({ principal: 5000, perCutoff: 1000, entries: [grant(5000), ded(4500, 'k')] });
  assert.equal(R.dueAmount(loan), 500);
});

// --- applyLoanDeductions against an in-memory Prisma -----------------------
function fakePrisma(rows) {
  const writes = [];
  return {
    writes,
    loan: {
      findMany: async () => rows,
      update: (args) => ({ op: 'loan.update', ...args }),
    },
    loanEntry: { create: (args) => ({ op: 'loanEntry.create', ...args }) },
    $transaction: async (ops) => { writes.push(ops); return ops; },
  };
}
const dbLoan = (o) => ({
  id: o.id, employeeId: o.employeeId || 'emp-' + o.id, type: o.type || 'LOAN', note: o.note || 'Emergency',
  principal: o.principal, deductionPerRun: o.perRun, dateGranted: new Date((o.granted || '2026-09-01') + 'T00:00:00Z'),
  isPaused: false, isSettled: false, settledAt: null, employee: { name: o.id, position: o.position || 'ADMINISTRATIVE_STAFF' },
  entries: o.entries || [{ type: 'GRANT', amount: o.principal, date: new Date('2026-09-01T00:00:00Z'), createdAt: new Date(), payslipId: null }],
});

ok('apply: advance in full + settled, loan one installment, late grant and crew skipped, one batch', async () => {
  const p = fakePrisma([
    dbLoan({ id: 'adv', type: 'CASH_ADVANCE', note: 'Cash Advance', principal: 3500, perRun: 500, granted: '2026-09-22' }),
    dbLoan({ id: 'loan', principal: 5000, perRun: 1000 }),
    dbLoan({ id: 'late', type: 'CASH_ADVANCE', principal: 2000, perRun: 2000, granted: '2026-10-02' }),
    dbLoan({ id: 'crew', principal: 3000, perRun: 100, position: 'DRIVER' }),
  ]);
  // Phase 2 requires the pay available per person; ample here, so Phase 1's
  // expectations hold unchanged (loans-phase2 covers the short cases).
  const available = { 'emp-adv': 10000, 'emp-loan': 10000, 'emp-late': 10000, 'emp-crew': 10000 };
  const r = await applyLoanDeductions(p, { scope: 'staff', runKey: KEY, cutoffEnd: '2026-09-30', available });
  assert.equal(r.applied, 2);
  assert.equal(r.settled, 1);
  assert.equal(r.total, 4500);
  assert.equal(p.writes.length, 1); // one transaction
  const ops = p.writes[0];
  const created = ops.filter((o) => o.op === 'loanEntry.create').map((o) => [o.data.loanId, o.data.amount]);
  assert.deepEqual(created, [['adv', 3500], ['loan', 1000]]);
  const closed = ops.filter((o) => o.op === 'loan.update').map((o) => o.where.id);
  assert.deepEqual(closed, ['adv']);
});

ok('apply is idempotent per run key', async () => {
  const p = fakePrisma([dbLoan({ id: 'loan', principal: 5000, perRun: 1000, entries: [
    { type: 'GRANT', amount: 5000, date: new Date('2026-09-01T00:00:00Z'), createdAt: new Date(), payslipId: null },
    { type: 'DEDUCTION', amount: 1000, date: new Date('2026-09-30T00:00:00Z'), createdAt: new Date(), payslipId: KEY },
  ] })]);
  const r = await applyLoanDeductions(p, { scope: 'staff', runKey: KEY, cutoffEnd: '2026-09-30', available: { 'emp-loan': 10000 } });
  assert.equal(r.applied, 0);
  assert.equal(r.skipped, 1);
  assert.equal(p.writes.length, 0);
});

ok('crew run key carries its own day', () => {
  assert.equal(runEndOf('crew-2026-09-29', null), '2026-09-29');
  assert.equal(runEndOf(KEY, '2026-09-30'), '2026-09-30');
  assert.equal(runEndOf(KEY, null), null);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  }
  console.log(`\nALL ${passed} LOANS PHASE 1 CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
