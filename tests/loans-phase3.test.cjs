const assert = require('node:assert/strict');
const { computeStaffPayroll } = require('../src/lib/payroll.js');
const R = require('../src/lib/loan-rules.js');
const { loanSlipHtml } = require('../src/features/loans/loanSlip.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const C = [[4250,135],[4750,157.5],[5250,180],[5750,202.5],[6250,225],[6750,247.5],[7250,270],[7750,292.5],[8250,315],[8750,337.5],[9250,360],[9750,382.5],[10250,405],[10750,427.5],[11250,450],[11750,472.5],[12250,495],[12750,517.5],[13250,540],[13750,562.5],[14250,585],[14750,607.5],[15250,630],[15750,652.5],[16250,675],[16750,697.5],[17250,720],[17750,742.5],[18250,765],[18750,787.5],[19250,810],[19750,832.5],[20250,855],[null,900]];
const statutory = {
  sss: C.map(([ceiling, share]) => ({ ceiling, share })),
  philhealth: { rate: 5, floor: 10000, ceiling: 100000 },
  pagibig: { cap: 200, brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }] },
};
const att = (present, lateMins = 0) => ({ present, leave: 0, lateMins, otWeekdayMins: 0, otWeekendMins: 0 });
const staffA = { id: 'emp-a', name: 'Staff A', rate: 700, declaredSalary: 18200, sssOn: true, phOn: true, piOn: true, mp2: 500, allowance: 0 };

console.log('Loans & Advances, Phase 3');

ok('enough pay: every figure is what it was (net 2,646.25 path, no cover)', () => {
  const c = computeStaffPayroll(staffA, [], statutory, att(12, 15));
  assert.deepEqual([c.mp1, c.mp2, c.hdmf, c.tardiness, c.companyCover], [100, 500, 600, 43.75, 0]);
  assert.equal(c.net, 7146.25);
});

ok('1 day present: contributions above pay (it used to be net -510.00); company covers 10.00, MP2 skipped, net 0.00', () => {
  const c = computeStaffPayroll(staffA, [], statutory, att(1));
  // Mandatory in full, still remitted: SSS 382.50 + PhilHealth 227.50 + MP1 100 = 710 against 700 pay.
  assert.deepEqual([c.sss, c.phic, c.mp1], [382.5, 227.5, 100]);
  assert.equal(c.companyCover, 10);
  assert.equal(c.mp2, 0);           // voluntary savings: never paid by the company
  assert.equal(c.net, 0);
  // The snapshot adds up: gross + OT + allowances + cover - deductions = net.
  assert.equal(Math.round((c.totalEarnings + c.companyCover - c.totalDeductions) * 100) / 100, c.net);
});

ok('short but not negative: tardiness first, then only the MP2 that fits', () => {
  // 2 days = 1,400; after mandatory 710 there is 690; 30 min late = 87.50; MP2 gets 500 of 500.
  let c = computeStaffPayroll(staffA, [], statutory, att(2, 30));
  assert.deepEqual([c.tardiness, c.mp2, c.companyCover, c.net], [87.5, 500, 0, 102.5]);
  // Declared MP2 of 800 on the same day: only 602.50 fits.
  c = computeStaffPayroll({ ...staffA, mp2: 800 }, [], statutory, att(2, 30));
  assert.deepEqual([c.mp2, c.net], [602.5, 0]);
});

// --- final pay --------------------------------------------------------------
const grant = (amount, ymd = '2026-09-01') => ({ type: 'grant', amount, ymd, shortfall: 0, payslipId: null });
const shaped = (o) => ({
  id: o.id, employeeId: 'emp-a', kind: o.kind || 'LOAN', purpose: o.kind === 'CASH_ADVANCE' ? null : 'Emergency',
  dateGranted: o.dateGranted || '2026-09-01', isCrew: false, active: false, person: 'Staff A', createdAt: null,
  principal: o.principal, perCutoff: o.per || 1000, paused: !!o.paused, settled: false, entries: o.entries,
});
const KEY = 'final-emp-a';

ok('final pay takes the WHOLE balance, advances first, paused loans too', () => {
  const loans = [
    shaped({ id: 'L', principal: 5000, paused: true, entries: [grant(5000), { type: 'deduction', amount: 1000, shortfall: 0, ymd: '2026-09-15', payslipId: 'staff-x' }] }),
    shaped({ id: 'A', kind: 'CASH_ADVANCE', principal: 1500, per: 1500, dateGranted: '2026-09-20', entries: [grant(1500, '2026-09-20')] }),
  ];
  const plan = R.planDeductions(loans, { runKey: KEY, endYmd: '2026-09-30', available: { 'emp-a': 10000 }, full: true });
  assert.deepEqual(plan.writes.map((w) => [w.loanId, w.amount, w.shortfall]), [['A', 1500, 0], ['L', 4000, 0]]);
  assert.equal(plan.settled, 2);
  assert.equal(plan.writes[1].remark, 'Final pay');
});

ok('final pay smaller than the debt: never below P0, the rest stays owed (nothing written off)', () => {
  const loans = [
    shaped({ id: 'L', principal: 5000, entries: [grant(5000)] }),
    shaped({ id: 'A', kind: 'CASH_ADVANCE', principal: 1500, per: 1500, dateGranted: '2026-09-20', entries: [grant(1500, '2026-09-20')] }),
  ];
  const plan = R.planDeductions(loans, { runKey: KEY, endYmd: '2026-09-30', available: { 'emp-a': 3200 }, full: true });
  assert.deepEqual(plan.writes.map((w) => [w.loanId, w.amount, w.unpaid, w.settles]), [['A', 1500, 0, true], ['L', 1700, 3300, false]]);
  assert.equal(plan.unpaidTotal, 3300);
  assert.match(plan.writes[1].remark, /Final pay · ₱3,300\.00 still unpaid/);
  const after = R.withPlan(loans, plan, { runKey: KEY, endYmd: '2026-09-30' });
  assert.equal(R.balanceOf(after[0]), 3300);
  // Recording again finds the stamp and skips.
  assert.equal(R.planDeductions(after, { runKey: KEY, endYmd: '2026-09-30', available: { 'emp-a': 3200 }, full: true }).writes.length, 0);
});

// --- acknowledgment slip ----------------------------------------------------
ok('slip states the consent in plain numbers (loan, crew loan, cash advance) and escapes names', () => {
  const loan = loanSlipHtml({ kind: 'LOAN', name: 'Jessa <Pintor>', position: 'Administrative Staff', employeeId: '21', date: '2026-09-29',
    amount: 6000, purpose: 'Hospitalization', perRun: 1000, plan: { count: 6, first: '2026-09-30', last: '2026-12-15' }, ref: 'abc' });
  assert.match(loan, /LOAN ACKNOWLEDGMENT/);
  assert.match(loan, /Jessa &lt;Pintor&gt;/);
  assert.match(loan, /deduct <b>₱1,000\.00<\/b> from my salary every payroll cutoff, starting with the <b>Sep 30, 2026<\/b> payroll/);
  assert.match(loan, /unpaid part will be deducted on the next payroll/);
  assert.match(loan, /remaining balance from my final pay/);
  const crew = loanSlipHtml({ kind: 'LOAN', name: 'Andro', employeeId: '31', crew: true, date: '2026-09-29', amount: 3000, purpose: 'Emergency', perRun: 100, plan: { count: 30, first: '2026-09-30', last: '2026-10-31' } });
  assert.match(crew, /every working day, starting Sep 29, 2026/);
  assert.match(crew, /nothing is deducted and the loan runs one day longer/);
  const adv = loanSlipHtml({ kind: 'CASH_ADVANCE', name: 'Jaclyn', employeeId: '13', date: '2026-09-29', amount: 8000, deductOn: '2026-09-30' });
  assert.match(adv, /CASH ADVANCE ACKNOWLEDGMENT/);
  assert.match(adv, /full amount from my salary on the <b>Sep 30, 2026<\/b> payroll/);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
  console.log(`\nALL ${passed} LOANS PHASE 3 CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
