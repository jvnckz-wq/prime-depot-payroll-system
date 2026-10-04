const assert = require('node:assert/strict');
const P = require('../src/lib/positions.js');
const { computeStaffPayroll, crewDayPay, dailyLateDeduction, dailyPresent } = require('../src/lib/payroll.js');
const { callTimeFor } = require('../src/lib/attendance.js');
const { buildEmployeeData, shapeEmployee } = require('../src/lib/server/services/employees.js');
const { crewAvailableOn, loadDailyStaff } = require('../src/lib/server/services/payroll-inputs.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const raw = (position, o = {}) => ({
  id: o.id || 'E1', name: o.name || 'Test', position, dailyRate: o.rate ?? 600, declaredSalary: o.declared ?? 15600,
  status: 'ACTIVE', sssEnrolled: true, philhealthEnrolled: true, pagibigEnrolled: true, mp2Amount: o.mp2 ?? 200,
  otherAllowance: 0, leaveCredits: 5, earlyShiftDays: o.early ?? ['SAT'], earlyShiftTime: '06:00',
});

ok('the dropdown is exactly the final list, in order', () => {
  assert.deepEqual(P.FINAL_POSITIONS, [
    'Operations Head', 'Assistant', 'Communications Officer II', 'Communications Officer I', 'Junior Secretary',
    'Collection Officer', 'Job Order', 'Warehouse Officer', 'Pahinante', 'Checker', 'Driver',
  ]);
});

ok('each final position maps to the right employee type and pay', () => {
  const semi = ['Operations Head', 'Assistant', 'Communications Officer II', 'Communications Officer I', 'Junior Secretary', 'Collection Officer', 'Job Order'];
  const daily = ['Warehouse Officer', 'Pahinante', 'Checker', 'Driver'];
  for (const p of semi) assert.equal(P.isDailyPosition(p), false, p);
  for (const p of daily) assert.equal(P.isDailyPosition(p), true, p);
  for (const p of P.FINAL_POSITIONS) assert.equal(P.isNonRegularPosition(p), p === 'Job Order', p);
  assert.deepEqual(daily.filter(P.isPieceRatePosition), ['Pahinante', 'Driver']);
  assert.deepEqual(daily.filter(P.isDailyAttendancePosition), ['Warehouse Officer', 'Checker']);
});

ok('enum values and labels agree', () => {
  for (const [e, l] of [['DRIVER', 'Driver'], ['PAHINANTE', 'Pahinante'], ['CHECKER', 'Checker'], ['WAREHOUSE_OFFICER', 'Warehouse Officer'], ['JOB_ORDER', 'Job Order']]) {
    assert.equal(P.isDailyPosition(e), P.isDailyPosition(l), e);
    assert.equal(P.isNonRegularPosition(e), P.isNonRegularPosition(l), e);
  }
});

ok('removed positions are no longer accepted', () => {
  for (const p of ['Administrative Staff', 'Trainee', 'Secretary (Special Shift)']) {
    assert.match(buildEmployeeData({ id: 'E1', name: 'X', position: p, rate: 600, declaredSalary: 0, mp2: 0, status: 'Active' }).error || '', /valid position/, p);
  }
});

ok('moving someone off a removed office position keeps their pay exactly the same', () => {
  const statutory = { sss: [{ ceiling: null, share: 900 }], philhealth: { rate: 5, floor: 10000, ceiling: 100000 }, pagibig: { cap: 200, brackets: [{ ceiling: null, eePct: 2 }] }, bir: [] };
  const att = { present: 12, leave: 1, lateMins: 35, otWeekdayMins: 60, otWeekendMins: 0 };
  const before = computeStaffPayroll(shapeEmployee(raw('ADMINISTRATIVE_STAFF')), [], statutory, att);
  for (const e of ['ADMINISTRATIVE_ASSISTANT', 'COLLECTION_OFFICER', 'JUNIOR_SECRETARY', 'COMMUNICATIONS_OFFICER_I']) {
    assert.deepEqual(computeStaffPayroll(shapeEmployee(raw(e)), [], statutory, att), before, e);
    assert.equal(callTimeFor({ position: e, earlyShiftDays: ['SAT'], earlyShiftTime: '06:00' }, '2026-10-03'), '06:00', e);
  }
});

ok('semi-monthly regulars are shaped exactly as before (no payroll change)', () => {
  for (const e of ['OPERATIONS_HEAD', 'ADMINISTRATIVE_ASSISTANT', 'COMMUNICATIONS_OFFICER_I', 'COLLECTION_OFFICER', 'JUNIOR_SECRETARY']) {
    const s = shapeEmployee(raw(e));
    assert.deepEqual([s.sssOn, s.phOn, s.piOn, s.mp2, s.declaredSalary, s.earlyShiftDays, s.daily, s.nonRegular], [true, true, true, 200, 15600, ['SAT'], false, false], e);
  }
  assert.equal(shapeEmployee(raw('ADMINISTRATIVE_ASSISTANT')).position, 'Assistant');
});

ok('Job Order has no contributions, MP2, declared salary or early shift, in shape and on save', () => {
  const s = shapeEmployee(raw('JOB_ORDER'));
  assert.deepEqual([s.sssOn, s.phOn, s.piOn, s.mp2, s.declaredSalary, s.earlyShiftDays, s.nonRegular], [false, false, false, 0, 0, [], true]);
  const { data } = buildEmployeeData({ id: 'E1', name: 'X', position: 'Job Order', rate: 600, declaredSalary: 15600, mp2: 200, sssOn: true, phOn: true, piOn: true, earlyShiftDays: ['SAT'], status: 'Active' });
  assert.deepEqual([data.sssEnrolled, data.philhealthEnrolled, data.pagibigEnrolled, Number(data.declaredSalary), Number(data.mp2Amount), data.earlyShiftDays], [false, false, false, 0, 0, []]);
  const { data: reg } = buildEmployeeData({ id: 'E2', name: 'Y', position: 'Junior Secretary', rate: 600, declaredSalary: 15600, mp2: 0, sssOn: true, phOn: true, piOn: true, earlyShiftDays: ['SAT'], status: 'Active' });
  assert.deepEqual([reg.sssEnrolled, Number(reg.declaredSalary), reg.earlyShiftDays], [true, 15600, ['SAT']]);
});

ok('a Job Order payslip carries no government contributions', () => {
  const statutory = { sss: [{ ceiling: null, share: 900 }], philhealth: { rate: 0.05, floor: 10000, ceiling: 100000 }, pagibig: { rate: 0.02, cap: 200 }, bir: [] };
  const jo = computeStaffPayroll(shapeEmployee(raw('JOB_ORDER')), [], statutory, { present: 13, leave: 0, lateMins: 0 });
  assert.deepEqual([jo.sss, jo.phic, jo.hdmf], [0, 0, 0]);
});

ok('call times: daily positions 6:30, office 6:40, Job Order ignores early shift', () => {
  const sat = '2026-10-03';
  assert.equal(callTimeFor({ position: 'Warehouse Officer' }, sat), '06:30');
  assert.equal(callTimeFor({ position: 'CHECKER' }, sat), '06:30');
  assert.equal(callTimeFor({ position: 'Assistant' }, sat), '06:40');
  assert.equal(callTimeFor({ position: 'Junior Secretary', earlyShiftDays: ['SAT'], earlyShiftTime: '06:00' }, sat), '06:00');
  assert.equal(callTimeFor({ position: 'Job Order', earlyShiftDays: ['SAT'], earlyShiftTime: '06:00' }, sat), '06:40');
});

ok('late is ₱3 per minute and never more than the day\u2019s pay', () => {
  assert.equal(dailyLateDeduction(11, 500), 33);
  assert.equal(dailyLateDeduction(0, 500), 0);
  assert.equal(dailyLateDeduction(30, 50), 50);
  assert.equal(dailyLateDeduction(-5, 500), 0);
});

ok('who counts as present for daily pay', () => {
  assert.equal(dailyPresent(null), false);
  assert.equal(dailyPresent({ timeIn: new Date(), isAbsent: false, isLeave: false }), true);
  assert.equal(dailyPresent({ timeIn: null, isAssumedIn: true }), true);
  assert.equal(dailyPresent({ timeIn: new Date(), isAbsent: true }), false);
  assert.equal(dailyPresent({ timeIn: null, isLeave: true }), false);
});

ok('crew day pay: drivers keep piece rate minus late, checkers earn their daily rate minus late', () => {
  const crew = [{ name: 'Andro', role: 'Driver', trips: 2, days: 1, pieceRate: 50, dailyRate: 280, bonus: 0, total: 330 },
    { name: 'Echo', role: 'Pahinante', trips: 2, days: 1, pieceRate: 30, dailyRate: 240, bonus: 0, total: 270 }];
  const daily = [
    { key: 'Andro', position: 'Driver', attendanceDaily: false, dailyRate: 280, present: true, lateMins: 11 },
    { key: 'Ana', position: 'Checker', attendanceDaily: true, dailyRate: 450, present: true, lateMins: 4 },
    { key: 'Ben', position: 'Warehouse Officer', attendanceDaily: true, dailyRate: 500, present: false, lateMins: 0 },
  ];
  const out = crewDayPay(crew, daily);
  const by = Object.fromEntries(out.map((p) => [p.name, p]));
  assert.deepEqual([by.Andro.late, by.Andro.payable], [33, 297]);
  assert.deepEqual([by.Echo.late, by.Echo.payable], [0, 270]);
  assert.deepEqual([by.Ana.total, by.Ana.late, by.Ana.payable, by.Ana.attendanceDaily], [450, 12, 438, true]);
  assert.equal(by.Ben, undefined);
});

ok('server: loans see the same daily pay (checker present and late, by employee ID)', async () => {
  const tables = {
    employees: [{ id: 'C1', name: 'Ana', position: 'CHECKER', dailyRate: 450, status: 'ACTIVE' }],
    attendance: [{ employeeId: 'C1', timeIn: new Date('2026-10-02T06:34:00Z'), isAbsent: false, isLeave: false, tardinessMins: 4 }],
    deliveries: [],
  };
  const list = (n) => ({ findMany: async () => tables[n] || [], findUnique: async () => null });
  const p = { employee: list('employees'), attendance: list('attendance'), delivery: list('deliveries'), crewRate: list('crewRate') };
  const staff = await loadDailyStaff(p, '2026-10-02');
  assert.deepEqual(staff.map((s) => [s.id, s.position, s.attendanceDaily, s.present, s.lateMins]), [['C1', 'Checker', true, true, 4]]);
  const available = await crewAvailableOn(p, '2026-10-02');
  assert.equal(available.get('C1'), 438);
});

ok('daily-paid and Job Order never carry declared salary or contributions', () => {
  for (const pos of ['DRIVER', 'PAHINANTE', 'CHECKER', 'WAREHOUSE_OFFICER', 'JOB_ORDER']) {
    const e = shapeEmployee(raw(pos));
    assert.deepEqual([e.declaredSalary, e.sssOn, e.phOn, e.piOn, e.mp2], [0, false, false, false, 0], pos);
  }
  for (const pos of ['Driver', 'Pahinante', 'Checker', 'Warehouse Officer', 'Job Order']) {
    const { data } = buildEmployeeData({ name: 'X', position: pos, rate: 280, declaredSalary: 7280, mp2: 100, sssOn: true, phOn: true, piOn: true });
    assert.deepEqual([data.declaredSalary, data.mp2Amount, data.sssEnrolled, data.philhealthEnrolled, data.pagibigEnrolled], [0, 0, false, false, false], pos);
  }
  const { data: chk } = buildEmployeeData({ name: 'X', position: 'Checker', rate: 450, declaredSalary: 0, mp2: 0, earlyShiftDays: ['SAT'] });
  assert.deepEqual(chk.earlyShiftDays, ['SAT']);
  const staff = shapeEmployee(raw('OPERATIONS_HEAD'));
  assert.deepEqual([staff.declaredSalary, staff.sssOn, staff.phOn, staff.piOn], [15600, true, true, true]);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  }
  console.log(`\nALL ${passed} POSITION AND DAILY PAY CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
