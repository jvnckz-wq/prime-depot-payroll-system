// Golden numbers: runs the real payroll, loan, tax, 13th month and attendance rules
// on fixed inputs and compares every result to tests/fixtures/golden-payroll.json.
// The fixture was made from the code before the readability refactor; never regenerate it
// to make this test pass. A failure means a payroll number changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  collectDailyContributions, computeStaffPayroll, contributionPerDay, crewDayPay, crewEarnings, dailyContributionFor,
  dailyLateDeduction, dailyPresent, deliveriesToLog, loanBalance, loanLedger, monthlyEmployeeShare,
} = require('../src/lib/payroll.js');
const { balanceOf, carryOf, dueFor, payoffPlan, planDeductions, withPlan } = require('../src/lib/loan-rules.js');
const { annualIncomeTax, cutoffThreshold, cutoffWithholding, taxableForCutoff } = require('../src/lib/withholding.js');
const { thirteenthMonthRows } = require('../src/lib/thirteenth-month.js');
const { buildAttendanceRow, callTimeFor, minutesLate, summarizeAttendance } = require('../src/lib/attendance.js');
const { FINAL_POSITIONS, isPieceRatePosition } = require('../src/lib/positions.js');
const { BIR_TABLE_INIT, CREW_RATE_FALLBACK, PAGIBIG_INIT, PHILHEALTH_INIT, SSS_TABLE_INIT } = require('../src/lib/constants.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'golden-payroll.json');
const statutory = { sss: SSS_TABLE_INIT, philhealth: PHILHEALTH_INIT, pagibig: PAGIBIG_INIT, bir: BIR_TABLE_INIT };
const plain = (v) => JSON.parse(JSON.stringify(v));

// The helper's role label is looked up instead of written here, so the numbers
// stay comparable if the label text is renamed.
const HELPER_LABEL = FINAL_POSITIONS.find((p) => isPieceRatePosition(p) && p !== 'Driver');
const roleToken = (role) => (role === HELPER_LABEL ? 'HELPER_ROLE' : role);
const crewRow = (p) => ({ ...plain(p), role: roleToken(p.role) });

// ---------- office staff: attendance -> payroll ----------
const alfa = {
  id: '201', name: 'Alfa Santos', position: 'COLLECTION_OFFICER',
  shiftSchedules: [{ effectiveFrom: '2026-09-01', days: ['TUE'], time: '06:00' }],
};
const bravo = { id: '202', name: 'Bravo Cruz', position: 'JUNIOR_SECRETARY', shiftSchedules: [] };

function staffRows(emp, plan) {
  return plan.map(([date, timeIn, timeOut, extra]) => {
    const paired = timeIn === undefined ? null : { timeIn, timeOut };
    return { ...buildAttendanceRow(emp, date, paired, extra || {}), employee: { name: emp.name } };
  });
}

const alfaPlan = [
  ['2026-10-01', '06:35', '17:00'],
  ['2026-10-02', '07:00', '18:30'],
  ['2026-10-03', '06:38', '19:00'],
  ['2026-10-04', '06:30', '14:15'],
  ['2026-10-05', null, '17:00'],
  ['2026-10-06', '06:12', '17:00'],
  ['2026-10-07', '06:40', null],
  ['2026-10-08', undefined, undefined, { isLeave: true }],
  ['2026-10-09', '06:55', '17:45'],
  ['2026-10-10', '06:30', '17:20'],
  ['2026-10-12', undefined, undefined],
  ['2026-10-13', '06:05', '17:00'],
  ['2026-10-14', '06:41', '17:00'],
  ['2026-10-15', '06:20', '20:00'],
];
const bravoPlan = [
  ['2026-10-01', '06:50', '17:00'],
  ['2026-10-02', '06:30', '17:00'],
  ['2026-10-03', '06:40', '18:00'],
  ['2026-10-05', '06:45', '17:00'],
  ['2026-10-06', '06:30', '17:00'],
  ['2026-10-07', '06:30', '17:00'],
  ['2026-10-08', '06:30', '17:00'],
  ['2026-10-09', undefined, undefined, { isLeave: true }],
  ['2026-10-10', '07:10', '17:00'],
  ['2026-10-12', '06:30', '17:00'],
  ['2026-10-13', '06:30', '17:00'],
  ['2026-10-14', '06:30', '17:00'],
  ['2026-10-15', '06:30', '17:00'],
];

const alfaPay = { id: '201', rate: 1200, allowance: 500, sssOn: true, phOn: true, piOn: true, declaredSalary: 31200, mp2: 300 };
const bravoPay = { id: '202', rate: 500, allowance: 0, sssOn: true, phOn: true, piOn: true, declaredSalary: 13000, mp2: 0 };

const PREV_RUN = 'staff-September 16–30, 2026';
const THIS_RUN = 'staff-October 1–15, 2026';
const staffLoans = () => [
  {
    id: 'L1', employeeId: '201', person: 'Alfa Santos', kind: 'LOAN', purpose: 'EMERGENCY', perCutoff: 500, principal: 5000,
    isCrew: false, paused: false, settled: false, active: true, dateGranted: '2026-08-20', createdAt: '2026-08-20T01:00:00.000Z',
    entries: [
      { type: 'grant', amount: 5000, ymd: '2026-08-20' },
      { type: 'deduction', amount: 500, shortfall: 0, payslipId: 'staff-September 1–15, 2026', ymd: '2026-09-15' },
      { type: 'deduction', amount: 300, shortfall: 200, payslipId: PREV_RUN, ymd: '2026-09-30' },
    ],
  },
  {
    id: 'CA1', employeeId: '201', person: 'Alfa Santos', kind: 'CASH_ADVANCE', purpose: null, perCutoff: 1500, principal: 1500,
    isCrew: false, paused: false, settled: false, active: true, dateGranted: '2026-10-05', createdAt: '2026-10-05T02:00:00.000Z',
    entries: [{ type: 'grant', amount: 1500, ymd: '2026-10-05' }],
  },
  {
    id: 'L2', employeeId: '202', person: 'Bravo Cruz', kind: 'LOAN', purpose: 'HOSPITALIZATION', perCutoff: 400, principal: 2000,
    isCrew: false, paused: false, settled: false, active: true, dateGranted: '2026-09-02', createdAt: '2026-09-02T03:00:00.000Z',
    entries: [{ type: 'grant', amount: 2000, ymd: '2026-09-02' }],
  },
];

// ---------- crew day: deliveries -> crew pay ----------
const DAY = '2026-10-14';
const delta = { id: '301', name: 'Delta Garcia' };
const echo = { id: '302', name: 'Echo Mendoza' };
const foxtrot = { id: '303', name: 'Foxtrot Lim' };
const golf = { id: '304', name: 'Golf Navarro' };
const crewList = (driver, helpers) => [
  { role: 'Driver', ...driver },
  ...helpers.map((h, i) => ({ role: `Helper ${i + 1}`, ...h })),
];
const trip = (id, truckId, seq, driver, helpers, items, extra = {}) => ({
  id, date: DAY, truckId, seq, customer: `Customer ${id}`, address: 'Poblacion, Mabini, Batangas',
  driver: driver.name, helpers: helpers.map((h) => h.name), crew: crewList(driver, helpers),
  items, isDouble: false, voided: false, voidedAt: null, ...extra,
});
const line = (item, unit, qty, driverRate, helperRate) => ({ item, unit, qty, driverAmount: +(driverRate * qty).toFixed(2), helperAmount: +(helperRate * qty).toFixed(2) });

const crewDeliveries = [
  trip('t1', 'TRK-01', 1, delta, [echo, foxtrot], [line('Cement', 'bag', 40, 3, 2.5), line('Sand', 'cu.m', 2, 60, 45)]),
  trip('t2', 'TRK-01', 2, delta, [echo, foxtrot], [line('Hollow Blocks', 'pc', 300, 0.25, 0.2)]),
  trip('t3', 'TRK-01', 3, delta, [echo, foxtrot], [line('Cement', 'bag', 25, 3, 2.5)], { voided: true, voidedAt: '2026-10-14T05:00:00.000Z' }),
  trip('t4', 'TRK-01', 4, delta, [echo], [line('Steel Bar 10mm', 'pc', 50, 1.5, 1.2)]),
  trip('t5', 'TRK-01', 5, delta, [echo], [line('Gravel', 'cu.m', 3, 55, 40)]),
  trip('t6', 'TRK-01', 6, delta, [], [line('Plywood', 'sheet', 20, 2, 1.5)]),
  trip('t7', 'TRK-02', 1, golf, [foxtrot], [line('Cement', 'bag', 30, 3, 2.5), line('Tiles', 'box', 10, 4, 3)]),
  trip('t8', 'TRK-02', 2, golf, [foxtrot], [line('Sand', 'cu.m', 2, 120, 90)], { isDouble: true }),
  trip('t9', 'TRK-02', 3, golf, [foxtrot], [line('Hollow Blocks', 'pc', 200, 0.25, 0.2)]),
];

const dailyStaff = [
  { key: '301', id: '301', name: 'Delta Garcia', position: 'Driver', attendanceDaily: false, dailyRate: 280, present: true, lateMins: 12 },
  { key: '302', id: '302', name: 'Echo Mendoza', attendanceDaily: false, dailyRate: 240, present: true, lateMins: 0 },
  { key: '303', id: '303', name: 'Foxtrot Lim', attendanceDaily: false, dailyRate: 240, present: true, lateMins: 200 },
  { key: '401', id: '401', name: 'India Torres', position: 'Checker', attendanceDaily: true, dailyRate: 450, present: true, lateMins: 7 },
  { key: '402', id: '402', name: 'Juliet Bautista', position: 'Warehouse Officer', attendanceDaily: true, dailyRate: 500, present: false, lateMins: 0 },
];

const crewLoan = {
  id: 'CL1', employeeId: '301', person: 'Delta Garcia', kind: 'LOAN', purpose: 'OTHER', perCutoff: 150, principal: 3000,
  isCrew: true, paused: false, settled: false, active: true, dateGranted: '2026-10-01', createdAt: '2026-10-01T01:00:00.000Z',
  entries: [
    { type: 'grant', amount: 3000, ymd: '2026-10-01' },
    { type: 'deduction', amount: 100, shortfall: 50, payslipId: 'crew-2026-10-13', ymd: '2026-10-13' },
  ],
};

function buildGolden() {
  const out = {};

  const alfaRows = staffRows(alfa, alfaPlan);
  const bravoRows = staffRows(bravo, bravoPlan);
  const summary = summarizeAttendance([...alfaRows, ...bravoRows]);
  const att = Object.fromEntries(summary.map((s) => [s.id, s]));
  out.attendance = {
    rows: plain(alfaRows.map(({ employee, ...r }) => r)),
    summary: plain(summary),
    callTimes: [
      callTimeFor(alfa, '2026-10-06'), callTimeFor(alfa, '2026-10-07'), callTimeFor(bravo, '2026-10-06'),
      callTimeFor({ position: 'DRIVER' }, '2026-10-06'), callTimeFor({ position: 'CHECKER' }, '2026-10-06'), callTimeFor(null, '2026-10-06'),
    ],
    minutesLate: [
      minutesLate(alfa, '2026-10-06', '06:12'), minutesLate(bravo, '2026-10-06', '06:52'),
      minutesLate({ position: 'DRIVER' }, '2026-10-06', '06:45'), minutesLate(bravo, '2026-10-06', null),
    ],
  };

  out.staffPayroll = {
    alfa: plain(computeStaffPayroll(alfaPay, staffLoans(), statutory, att['201'])),
    bravo: plain(computeStaffPayroll(bravoPay, staffLoans(), statutory, att['202'])),
    noAttendance: plain(computeStaffPayroll(bravoPay, [], statutory, null)),
  };

  const staffPlan = planDeductions(staffLoans(), { crew: false, runKey: THIS_RUN, endYmd: '2026-10-15', available: { 201: 1800, 202: 150 } });
  const afterRun = withPlan(staffLoans(), staffPlan, { runKey: THIS_RUN, endYmd: '2026-10-15' });
  out.staffPayroll.alfaFinalized = plain(computeStaffPayroll(alfaPay, afterRun, statutory, att['201'], THIS_RUN));

  out.withholding = {
    threshold: cutoffThreshold(BIR_TABLE_INIT),
    annual: [0, 250000, 250001, 400000, 650000, 1200000, 9000000].map((t) => annualIncomeTax(t, BIR_TABLE_INIT)),
    perCutoff: [8000, 10416.67, 10500, 15600, 24500, 60000].map((t) => cutoffWithholding(t, BIR_TABLE_INIT)),
    taxableFromPayslips: [out.staffPayroll.alfa, out.staffPayroll.bravo].map(taxableForCutoff),
  };

  out.thirteenthMonth = plain(thirteenthMonthRows([
    { employeeId: '201', name: 'Alfa Santos', basicPay: 15600, periodStart: '2026-08-01' },
    { employeeId: '201', name: 'Alfa Santos', basicPay: 16800, periodStart: '2026-08-16' },
    { employeeId: '201', name: 'Alfa Santos', basicPay: 14400.5, periodStart: '2026-09-01' },
    { employeeId: '202', name: 'Bravo Cruz', basicPay: 6500, periodStart: '2026-09-16' },
    { employeeId: '202', name: 'Bravo Cruz', basicPay: 6000.25, periodStart: '2026-10-01' },
  ]));

  const people = crewEarnings(deliveriesToLog(crewDeliveries), CREW_RATE_FALLBACK);
  const dayPay = crewDayPay(people, dailyStaff);
  const crewPlan = planDeductions([crewLoan], {
    crew: true, runKey: `crew-${DAY}`, endYmd: DAY,
    available: new Map(dayPay.map((p) => [p.key, p.payable])),
  });
  out.crew = {
    helperLabelFound: !!HELPER_LABEL,
    earnings: people.map(crewRow),
    dayPay: dayPay.map(crewRow),
    lateDeductions: [dailyLateDeduction(12, 500), dailyLateDeduction(200, 450), dailyLateDeduction(-5, 300), dailyLateDeduction(10, 0)],
    present: [
      dailyPresent({ timeIn: '2026-10-14T06:30:00.000Z', isAbsent: false }), dailyPresent({ isAssumedIn: true }),
      dailyPresent({ timeIn: '2026-10-14T06:30:00.000Z', isLeave: true }), dailyPresent(null),
    ],
    loanPlan: plain(crewPlan),
  };

  const loans = staffLoans();
  out.loans = {
    balances: loans.map(balanceOf),
    due: loans.map((l) => dueFor(l)),
    dueAsCrew: dueFor(loans[0], { crew: true }),
    carry: plain(loans.map((l) => carryOf(l))),
    carryBefore: plain(carryOf(loans[0], '2026-09-30')),
    payoff: plain([payoffPlan(4200, 500, '2026-10-10'), payoffPlan(1000, 300, '2026-12-20'), payoffPlan(0, 100, '2026-10-01')]),
    staffPlan: plain(staffPlan),
    afterRun: plain(afterRun),
    ledger: plain(loanLedger(loans[0])),
    loanBalance: loans.map(loanBalance),
    crewDue: dueFor(crewLoan),
  };

  const share = monthlyEmployeeShare(alfaPay, statutory);
  const perDay = contributionPerDay(null, share.total, '2026-10-14');
  out.contributions = {
    share: plain(share),
    perDay,
    perDayFixed: contributionPerDay('35', share.total, '2026-10-14'),
    oneDay: dailyContributionFor({ perDay, shareTotal: share.total, collectedBefore: 100 }, 300),
    month: plain(collectDailyContributions(
      [{ ymd: '2026-10-02', payable: 500 }, { ymd: '2026-10-01', payable: 20 }, { ymd: '2026-10-03', payable: 0 }, { ymd: '2026-10-05', payable: 1000 }],
      share.total, perDay,
    )),
  };

  return plain(out);
}

module.exports = { buildGolden };

if (require.main === module) {
  const expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const actual = buildGolden();
  let failed = 0;
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), 'golden sections differ');
  for (const section of Object.keys(expected)) {
    try {
      assert.deepStrictEqual(actual[section], expected[section]);
      console.log(`  ok - ${section}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL - ${section}\n${e.message}`);
    }
  }
  if (failed) { console.error(`\n${failed} GOLDEN SECTION(S) CHANGED`); process.exit(1); }
  console.log('\nALL GOLDEN PAYROLL NUMBERS MATCH');
}
