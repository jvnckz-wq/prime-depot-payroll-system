// Numeric checks for Loans & Advances, Phase 2: deduct only from pay that is
// there (net never below P0), cash advance before the loan installment, the
// staff carry-over (rule e) read from the ledger, crew not stacked, one ledger
// key per calendar cutoff, and the server-side payroll inputs.
//
// Pure logic plus tiny in-memory stand-ins for Prisma. Synthetic ids only; the
// staff figures use the 2026 statutory tables from the seed, so the numbers are
// the ones the real payslip shows.
//
// Run:  npm run test:loans2
// (CommonJS + require so tsx can load the app's extensionless ESM imports.)

const assert = require('node:assert/strict');
const { computeStaffPayroll } = require('../src/lib/payroll.js');
const R = require('../src/lib/loan-rules.js');
const { applyLoanDeductions } = require('../src/lib/loans-apply.js');
const { crewAvailableOn, loadStaffPayrollInputs, staffAvailable } = require('../src/lib/payroll-inputs.js');

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

// Staff A: P700/day, declared 18,200, SSS + PhilHealth + Pag-IBIG + MP2 500
// (the Girlie example). Staff C: P650/day, declared 16,900, no Pag-IBIG (the
// cash-advance mockup, estimated take-home 7,878.75).
const staffA = { id: 'emp-a', name: 'Staff A', rate: 700, declaredSalary: 18200, sssOn: true, phOn: true, piOn: true, mp2: 500, allowance: 0 };
const staffC = { id: 'emp-c', name: 'Staff C', rate: 650, declaredSalary: 16900, sssOn: true, phOn: true, piOn: false, mp2: 0, allowance: 0 };
const avail = (e, a) => Math.max(0, computeStaffPayroll(e, [], statutory, a).net);

const KEY_SEP1 = 'staff-September 1–15, 2026';
const KEY_SEP2 = 'staff-September 16–30, 2026';
const KEY_OCT1 = 'staff-October 1–15, 2026';

const shaped = (o) => ({
  id: o.id, employeeId: o.employeeId, kind: o.kind || 'LOAN', purpose: o.kind === 'CASH_ADVANCE' ? null : 'Emergency',
  dateGranted: o.dateGranted || '2026-09-01', isCrew: !!o.isCrew, active: o.active !== false, person: o.person || o.employeeId,
  createdAt: o.createdAt || null, principal: o.principal, perCutoff: o.perCutoff, paused: !!o.paused, settled: !!o.settled, entries: o.entries,
});
const grant = (amount, ymd = '2026-09-01') => ({ type: 'grant', amount, ymd, shortfall: 0, payslipId: null });
// Run the plan and return the loans as they would be afterwards.
const run = (loans, opts) => {
  const plan = R.planDeductions(loans, opts);
  return { plan, after: R.withPlan(loans, plan, { runKey: opts.runKey, endYmd: opts.endYmd }) };
};
const w = (plan, loanId) => plan.writes.find((x) => x.loanId === loanId);

console.log('Loans & Advances, Phase 2');

// --- one key per calendar cutoff --------------------------------------------
ok('run key names the calendar cutoff: an import to the 29th and one to the 30th share it', () => {
  assert.equal(R.staffRunKey('2026-09-16'), KEY_SEP2);
  assert.equal(R.staffRunKey('2026-09-29'), KEY_SEP2);   // same cutoff, any day in it
  assert.equal(R.staffRunKey('2026-09-01'), KEY_SEP1);
  assert.equal(R.staffRunKey('2026-02-20'), 'staff-February 16–28, 2026');
  assert.deepEqual(R.prevCutoff('2026-10-01'), { start: '2026-09-16', end: '2026-09-30' });
  assert.deepEqual(R.prevCutoff('2026-01-10'), { start: '2025-12-16', end: '2025-12-31' });
  assert.equal(R.shortPeriod(R.nextCutoff('2026-09-30')), 'Oct 1-15');
});

// --- the Manila day (deliveries, crew runs, live views) ---------------------
ok('today is the Manila day: 6:30 AM Manila is already the new day (it used to be yesterday until 8 AM)', () => {
  assert.equal(R.todayYmdManila(new Date('2026-09-29T22:30:00Z')), '2026-09-30'); // 6:30 AM Sep 30 Manila
  assert.equal(R.todayYmdManila(new Date('2026-09-29T15:59:59Z')), '2026-09-29'); // 11:59:59 PM Sep 29
  assert.equal(R.todayYmdManila(new Date('2026-09-29T16:00:00Z')), '2026-09-30'); // midnight Manila
  assert.equal(R.todayYmdManila(new Date('2026-12-31T16:30:00Z')), '2027-01-01'); // new year
});

// --- the P0 floor, advance first --------------------------------------------
ok('advance bigger than the pay: takes what is there, 121.25 stays open, net P0.00 (mockup 3)', () => {
  const available = avail(staffC, att(13));
  assert.equal(available, 7878.75);
  const loans = [shaped({ id: 'A', employeeId: 'emp-c', kind: 'CASH_ADVANCE', principal: 8000, perCutoff: 8000, dateGranted: '2026-09-29', entries: [grant(8000, '2026-09-29')] })];
  const { plan, after } = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-c': available } });
  assert.equal(w(plan, 'A').amount, 7878.75);
  assert.equal(w(plan, 'A').shortfall, 121.25);
  assert.equal(w(plan, 'A').settles, false);              // stays open
  assert.equal(R.balanceOf(after[0]), 121.25);
  assert.equal(R.dueFor(after[0], { endYmd: '2026-10-15' }), 121.25); // due in full next cutoff
  const c = computeStaffPayroll(staffC, after, statutory, att(13), KEY_SEP2);
  assert.equal(c.net, 0);
  assert.equal(c.deductionLines[0].shortfall, 121.25);
});

ok('cash advance is taken before the loan installment (5 days present: 2,290.00 available)', () => {
  const available = avail(staffA, att(5));
  assert.equal(available, 2290);
  const loans = [
    shaped({ id: 'L', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, entries: [grant(5000)] }),
    shaped({ id: 'A', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 3500, perCutoff: 3500, dateGranted: '2026-09-22', entries: [grant(3500, '2026-09-22')] }),
  ];
  const { plan, after } = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': available } });
  assert.deepEqual([w(plan, 'A').amount, w(plan, 'A').shortfall], [2290, 1210]);
  assert.deepEqual([w(plan, 'L').amount, w(plan, 'L').shortfall], [0, 1000]); // a P0 entry, still written
  assert.equal(plan.writes.length, 2);
  assert.match(w(plan, 'L').remark, /nothing taken, ₱1,000\.00 carried over/);
  const c = computeStaffPayroll(staffA, after, statutory, att(5), KEY_SEP2);
  assert.equal(c.net, 0);
  assert.equal(c.loanDeduction, 0);
  assert.equal(c.advanceDeduction, 2290);
  // The loan line still shows, so the employee sees why nothing was taken.
  assert.equal(c.deductionLines.find((d) => d.kind === 'LOAN').shortfall, 1000);
});

ok('pay is enough: nothing changes (net 2,646.25, same as Phase 1)', () => {
  const loans = [
    shaped({ id: 'L', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, entries: [grant(5000)] }),
    shaped({ id: 'A', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 3500, perCutoff: 3500, dateGranted: '2026-09-22', entries: [grant(3500, '2026-09-22')] }),
  ];
  const { plan, after } = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': avail(staffA, att(12, 15)) } });
  assert.equal(plan.short.length, 0);
  assert.equal(plan.total, 4500);
  assert.equal(computeStaffPayroll(staffA, after, statutory, att(12, 15), KEY_SEP2).net, 2646.25);
});

// --- carry-over chain (rule e), read from the ledger -------------------------
ok('the P360 chain: 640 of 1,000 taken, next installment 1,360 "incl. 360 short from Sep 15", then back to 1,000', () => {
  let loans = [shaped({ id: 'L', employeeId: 'emp-a', principal: 10000, perCutoff: 1000, entries: [grant(10000, '2026-08-20')] })];
  let r = run(loans, { runKey: KEY_SEP1, endYmd: '2026-09-15', available: { 'emp-a': 640 } });
  assert.deepEqual([w(r.plan, 'L').amount, w(r.plan, 'L').shortfall], [640, 360]);
  loans = r.after;
  assert.deepEqual(R.carryOf(loans[0], '2026-09-30'), { amount: 360, fromYmd: '2026-09-15' });
  assert.equal(R.dueFor(loans[0], { endYmd: '2026-09-30' }), 1360);

  r = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': 5000 } });
  assert.deepEqual([w(r.plan, 'L').amount, w(r.plan, 'L').shortfall], [1360, 0]);
  assert.match(w(r.plan, 'L').remark, /incl\. ₱360\.00 carried over/);
  loans = r.after;
  assert.equal(R.dueFor(loans[0], { endYmd: '2026-10-15' }), 1000);
  assert.equal(R.balanceOf(loans[0]), 8000);
});

ok('a P0 cutoff chains: 1,360 short becomes a 2,360 installment', () => {
  const loans = [shaped({ id: 'L', employeeId: 'emp-a', principal: 10000, perCutoff: 1000, entries: [
    grant(10000, '2026-08-20'),
    { type: 'deduction', amount: 640, shortfall: 360, ymd: '2026-09-15', payslipId: KEY_SEP1 },
  ] })];
  const r = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': 0 } });
  assert.deepEqual([w(r.plan, 'L').amount, w(r.plan, 'L').shortfall], [0, 1360]);
  assert.equal(R.dueFor(r.after[0], { endYmd: '2026-10-15' }), 2360);
});

ok('the carry never asks for more than the balance', () => {
  const loans = [shaped({ id: 'L', employeeId: 'emp-a', principal: 1500, perCutoff: 1000, entries: [
    grant(1500), { type: 'deduction', amount: 640, shortfall: 360, ymd: '2026-09-15', payslipId: KEY_SEP1 },
  ] })];
  assert.equal(R.dueFor(loans[0], { endYmd: '2026-09-30' }), 860); // 1,360 due, only 860 left
});

ok('un-finalize restores the carry-over by itself (its entries are deleted, nothing stored on the loan)', () => {
  const base = shaped({ id: 'L', employeeId: 'emp-a', principal: 10000, perCutoff: 1000, entries: [
    grant(10000, '2026-08-20'),
    { type: 'deduction', amount: 640, shortfall: 360, ymd: '2026-09-15', payslipId: KEY_SEP1 },
  ] });
  const { after } = run([base], { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': 0 } });
  assert.equal(R.dueFor(after[0], { endYmd: '2026-10-15' }), 2360);
  // DELETE /api/payroll/finalize removes every DEDUCTION stamped with the key.
  const undone = { ...after[0], entries: after[0].entries.filter((e) => e.payslipId !== KEY_SEP2) };
  assert.equal(R.dueFor(undone, { endYmd: '2026-09-30' }), 1360);
  assert.equal(R.balanceOf(undone), 9360);
});

// --- crew: not stacked ------------------------------------------------------
ok('crew day with no trips: P0 entry, nothing carried; the next day is P100 again, not P200', () => {
  const loan = shaped({ id: 'K', employeeId: 'drv-1', isCrew: true, person: 'Andro', principal: 3000, perCutoff: 100, entries: [grant(3000)] });
  const r = run([loan], { crew: true, runKey: 'crew-2026-09-29', endYmd: '2026-09-29', available: new Map() }); // no trips
  assert.deepEqual([w(r.plan, 'K').amount, w(r.plan, 'K').shortfall, w(r.plan, 'K').unpaid], [0, 0, 100]);
  assert.match(w(r.plan, 'K').remark, /Crew pay Sep 29, 2026 · no pay that day, nothing taken/);
  assert.equal(R.dueFor(r.after[0], { endYmd: '2026-09-30' }), 100);
  // A short day: only what was earned is taken, the rest is not stacked either.
  const r2 = run(r.after, { crew: true, runKey: 'crew-2026-09-30', endYmd: '2026-09-30', available: { 'drv-1': 60 } });
  assert.deepEqual([w(r2.plan, 'K').amount, w(r2.plan, 'K').shortfall], [60, 0]);
  assert.equal(R.dueFor(r2.after[0]), 100);
  assert.equal(R.balanceOf(r2.after[0]), 2940);
});

// --- who is in the run ------------------------------------------------------
ok('an active employee with no pay this cutoff gets P0 + carry; an inactive one waits for final pay', () => {
  const loans = [
    shaped({ id: 'L1', employeeId: 'emp-x', principal: 5000, perCutoff: 1000, entries: [grant(5000)] }),
    shaped({ id: 'L2', employeeId: 'emp-gone', active: false, principal: 5000, perCutoff: 1000, entries: [grant(5000)] }),
  ];
  const { plan } = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: {} });
  assert.deepEqual(plan.writes.map((x) => [x.loanId, x.amount, x.shortfall]), [['L1', 0, 1000]]);
});

ok('paused, not yet given, and crew loans are left out of a staff run', () => {
  const loans = [
    shaped({ id: 'P', employeeId: 'emp-a', paused: true, principal: 5000, perCutoff: 1000, entries: [grant(5000)] }),
    shaped({ id: 'N', employeeId: 'emp-b', kind: 'CASH_ADVANCE', principal: 900, perCutoff: 900, dateGranted: '2026-10-02', entries: [grant(900, '2026-10-02')] }),
    shaped({ id: 'K', employeeId: 'drv-1', isCrew: true, principal: 3000, perCutoff: 100, entries: [grant(3000)] }),
  ];
  const { plan } = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': 9999, 'emp-b': 9999, 'drv-1': 9999 } });
  assert.equal(plan.writes.length, 0);
});

ok('Apply, then a new advance before Finalize: only the pay still left is used, nothing twice', () => {
  // Apply already took the 1,000 installment from 1,500 of available pay.
  const loans = [
    shaped({ id: 'L', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, entries: [grant(5000), { type: 'deduction', amount: 1000, shortfall: 0, ymd: '2026-09-30', payslipId: KEY_SEP2 }] }),
    shaped({ id: 'A', employeeId: 'emp-a', kind: 'CASH_ADVANCE', principal: 800, perCutoff: 800, dateGranted: '2026-09-28', entries: [grant(800, '2026-09-28')] }),
  ];
  const { plan } = run(loans, { runKey: KEY_SEP2, endYmd: '2026-09-30', available: { 'emp-a': 1500 } });
  assert.equal(plan.skipped, 1);
  assert.deepEqual([w(plan, 'A').amount, w(plan, 'A').shortfall], [500, 300]);
});

// --- the database writes ----------------------------------------------------
function fakePrisma(tables) {
  const writes = [];
  const list = (name) => ({ findMany: async () => tables[name] || [], findFirst: async () => null, findUnique: async () => tables[name + '1'] ?? null });
  return {
    writes,
    loan: { findMany: async () => tables.loans || [], update: (args) => ({ op: 'loan.update', ...args }) },
    loanEntry: { create: (args) => ({ op: 'loanEntry.create', ...args }) },
    employee: list('employees'), attendance: list('attendance'), delivery: list('deliveries'),
    crewRate: list('crewRate'), philhealthConfig: list('ph'), sssBracket: list('sss'), pagibigConfig: list('pagibig'), birBracket: list('bir'),
    $transaction: async (ops) => { writes.push(ops); return ops; },
  };
}
const dbLoan = (o) => ({
  id: o.id, employeeId: o.employeeId, type: o.type || 'LOAN', purpose: 'EMERGENCY', note: null,
  principal: o.principal, deductionPerRun: o.perRun, dateGranted: new Date('2026-09-01T00:00:00Z'),
  isPaused: false, isSettled: false, settledAt: null, createdAt: new Date('2026-09-01T01:00:00Z'),
  employee: { name: o.employeeId, position: o.position || 'ADMINISTRATIVE_STAFF', status: 'ACTIVE' },
  entries: [{ type: 'GRANT', amount: o.principal, shortfall: 0, date: new Date('2026-09-01T00:00:00Z'), createdAt: new Date('2026-09-01T01:00:00Z'), payslipId: null }],
});

ok('apply writes the shortfall, dates entries at the cutoff end, and keeps one batch', async () => {
  const p = fakePrisma({ loans: [dbLoan({ id: 'L', employeeId: 'emp-a', principal: 10000, perRun: 1000 })] });
  const r = await applyLoanDeductions(p, { scope: 'staff', runKey: KEY_SEP1, cutoffEnd: '2026-09-15', available: { 'emp-a': 640 } });
  assert.deepEqual([r.applied, r.total, r.unpaidTotal], [1, 640, 360]);
  assert.equal(p.writes.length, 1);
  const e = p.writes[0][0].data;
  assert.deepEqual([e.amount, e.shortfall, e.payslipId, e.date.toISOString().slice(0, 10)], [640, 360, KEY_SEP1, '2026-09-15']);
});

ok('apply refuses to run without knowing the pay', async () => {
  const p = fakePrisma({ loans: [] });
  await assert.rejects(() => applyLoanDeductions(p, { scope: 'staff', runKey: KEY_SEP2, cutoffEnd: '2026-09-30' }), /Missing available pay/);
});

// --- server inputs ----------------------------------------------------------
const day = (ymd, o = {}) => ({ employeeId: o.id, date: new Date(ymd + 'T00:00:00Z'), isAbsent: !!o.absent, isLeave: false, tardinessMins: o.late || 0, overtimeMins: 0, employee: { name: o.id } });
const dbEmp = (id, o = {}) => ({ id, name: id, position: o.position || 'ADMINISTRATIVE_STAFF', dailyRate: o.rate ?? 700, declaredSalary: o.declared ?? 18200, status: o.status || 'ACTIVE', sssEnrolled: true, philhealthEnrolled: true, pagibigEnrolled: true, mp2Amount: 500, otherAllowance: 0 });
const sssRows = C.map(([ceiling, share], i) => ({ salaryFrom: i ? C[i - 1][0] : 0, salaryTo: ceiling ?? 999999999, employeeShare: share }));

ok('server payroll set = the screen: staff without attendance get no payslip and no loan pay', async () => {
  const p = fakePrisma({
    employees: [dbEmp('emp-a'), dbEmp('emp-noatt'), dbEmp('drv-1', { position: 'DRIVER', rate: 280, declared: 0 })],
    attendance: [
      ...['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-21'].map((d) => day(d, { id: 'emp-a' })),
      day('2026-09-16', { id: 'drv-1' }),
    ],
    sss: sssRows,
  });
  const inputs = await loadStaffPayrollInputs(p, { start: '2026-09-16', end: '2026-09-30', withLoans: false });
  assert.deepEqual(inputs.staff.map((e) => e.id), ['emp-a']); // no 11-day estimate for emp-noatt, no crew
  assert.equal(staffAvailable(inputs).get('emp-a'), 2290);     // same number as the pure check above
});

ok('crew pay is matched by employee ID: two crew with the same name stay apart', async () => {
  // Both helpers are called "Echo"; the screen would merge them by name.
  const del = (id, seq, driverId, helpers, amount = 0) => ({
    id, truckId: 'TRK-01', sequenceNo: seq, driverId, helper1Id: helpers[0] || null, helper2Id: helpers[1] || null, isDouble: false,
    items: [{ itemName: 'Cement', unit: 'bag', quantity: 10, driverAmount: amount, helperAmount: amount }],
  });
  const p = fakePrisma({ deliveries: [del('d1', 1, 'drv-1', ['pah-echo-1']), del('d2', 2, 'drv-1', ['pah-echo-2'], 50)], crewRate1: null });
  const earned = await crewAvailableOn(p, '2026-09-29');
  // Daily 280 + piece rate for the driver; 240 + each helper's own trip.
  assert.equal(earned.get('drv-1'), 280 + 0 + 50);
  assert.equal(earned.get('pah-echo-1'), 240);
  assert.equal(earned.get('pah-echo-2'), 240 + 50);
  assert.equal(earned.has('Echo'), false);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  }
  console.log(`\nALL ${passed} LOANS PHASE 2 CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
