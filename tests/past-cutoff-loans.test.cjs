const assert = require('node:assert/strict');
const { computeStaffPayroll } = require('../src/lib/payroll.js');
const R = require('../src/lib/loan-rules.js');
const tests = []; const ok = (name, fn) => tests.push([name, fn]);
const shaped = (o) => ({
  id: o.id, employeeId: o.employeeId, kind: o.kind || 'LOAN', purpose: o.kind === 'CASH_ADVANCE' ? null : 'Emergency',
  dateGranted: o.dateGranted || '2026-09-01', isCrew: !!o.isCrew, active: o.active !== false, person: o.person || o.employeeId,
  createdAt: o.createdAt || null, principal: o.principal, perCutoff: o.perCutoff, paused: !!o.paused, settled: !!o.settled, entries: o.entries,
});
const grant = (amount, ymd = '2026-09-01') => ({ type: 'grant', amount, ymd, shortfall: 0, payslipId: null });
const plan = (loans, start, end) => R.planDeductions(loans, { crew: false, runKey: R.staffRunKey(start), endYmd: end, available: new Map([['emp-a', 10000]]) });
const takes = (p, id) => p.writes.filter((w) => w.loanId === id || w.loan === id || w.id === id).reduce((s, w) => s + Number(w.amount || 0), 0);

ok('a loan granted in October is not deducted from July 1-15', () => {
  const L = shaped({ id: 'L', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, dateGranted: '2026-10-05', entries: [grant(5000, '2026-10-05')] });
  assert.equal(plan([L], '2026-07-01', '2026-07-15').writes.length, 0);
});
ok('the same loan is deducted from October 16-31', () => {
  const L = shaped({ id: 'L', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, dateGranted: '2026-10-05', entries: [grant(5000, '2026-10-05')] });
  const p = plan([L], '2026-10-16', '2026-10-31');
  assert.equal(p.writes.length, 1); assert.equal(Number(p.total), 1000);
});
ok('a loan granted in June is deducted from July 1-15', () => {
  const L = shaped({ id: 'L', employeeId: 'emp-a', principal: 5000, perCutoff: 1000, dateGranted: '2026-06-20', entries: [grant(5000, '2026-06-20')] });
  const p = plan([L], '2026-07-01', '2026-07-15');
  assert.equal(p.writes.length, 1); assert.equal(Number(p.total), 1000);
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('  ok  ' + n); } catch (e) { failed++; console.error('  FAIL ' + n + '\n       ' + e.message); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`); if (failed) process.exit(1);
