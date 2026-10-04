const assert = require('node:assert/strict');
const { collectDailyContributions, contributionPerDay, dailyContributionFor, monthlyEmployeeShare } = require('../src/lib/payroll.js');
const { contributionContext, crewAvailableOn, loadCrewReport, loadDailyContributionsForMonth } = require('../src/lib/server/services/payroll-inputs.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const C = [[4250,135],[4750,157.5],[5250,180],[5750,202.5],[6250,225],[6750,247.5],[7250,270],[7750,292.5],[8250,315],[8750,337.5],[9250,360],[9750,382.5],[10250,405],[10750,427.5],[11250,450],[11750,472.5],[12250,495],[12750,517.5],[13250,540],[13750,562.5],[14250,585],[14750,607.5],[15250,630],[15750,652.5],[16250,675],[16750,697.5],[17250,720],[17750,742.5],[18250,765],[18750,787.5],[19250,810],[19750,832.5],[20250,855],[null,900]];
const statutory = {
  sss: C.map(([ceiling, share]) => ({ ceiling, share })),
  philhealth: { rate: 5, floor: 10000, ceiling: 100000 },
  pagibig: { cap: 200, brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }] },
};

const driver = { id: 'DRV-001', sssOn: true, phOn: true, piOn: true, declaredSalary: 280 * 26 };

ok('monthly employee share for a driver declared at ₱7,280 (280 × 26)', () => {
  assert.deepEqual(monthlyEmployeeShare(driver, statutory), { sss: 292.5, phic: 250, hdmf: 145.6, total: 688.1 });
});

ok('the 2025-2026 SSS schedule (client\u2019s Taxes.pdf): 5% of MSC from ₱5,000 to ₱35,000', () => {
  const { SSS_TABLE_INIT } = require('../src/data/seed.js');
  const real = { ...statutory, sss: SSS_TABLE_INIT };
  assert.equal(SSS_TABLE_INIT.length, 61);
  assert.deepEqual(monthlyEmployeeShare(driver, real), { sss: 375, phic: 250, hdmf: 145.6, total: 770.6 });
  const ee = (salary) => monthlyEmployeeShare({ ...driver, phOn: false, piOn: false, declaredSalary: salary }, real).sss;
  assert.deepEqual([ee(4000), ee(5249.99), ee(5250), ee(14999), ee(20300), ee(34749.99), ee(34750), ee(90000)], [250, 250, 275, 750, 1025, 1725, 1750, 1750]);
});

ok('no enrolment or no declared salary means no share', () => {
  assert.equal(monthlyEmployeeShare({ ...driver, sssOn: false, phOn: false, piOn: false }, statutory).total, 0);
  assert.equal(monthlyEmployeeShare({ ...driver, declaredSalary: 0 }, statutory).total, 0);
});

ok('even split: ₱688.10 over October 2026 (27 working days, Mon to Sat) is ₱25.49 a day', () => {
  assert.equal(contributionPerDay(null, 688.1, '2026-10-03'), 25.49);
  assert.equal(contributionPerDay(null, 0, '2026-10-03'), 0);
  assert.equal(contributionPerDay(50, 688.1, '2026-10-03'), 50);
  assert.equal(contributionPerDay(0, 688.1, '2026-10-03'), 0);
  assert.equal(contributionPerDay(null, 688.1, '2026-02-10'), 28.68);
});

ok('even split, full month worked: exactly the share, never more', () => {
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const ymd = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(ymd + 'T00:00:00Z').getUTCDay() !== 0) days.push({ ymd, payable: 330 });
  }
  assert.equal(days.length, 27);
  const r = collectDailyContributions(days, 688.1, 25.49);
  assert.deepEqual([r.collected, r.remaining], [688.1, 0]);
  assert.equal(r.byDay['2026-10-31'], 25.36);
});

ok('even split with absences: the rest shows as company covers', () => {
  const days = Array.from({ length: 20 }, (_, i) => ({ ymd: `2026-10-${String(i + 1).padStart(2, '0')}`, payable: 330 }));
  const r = collectDailyContributions(days, 688.1, 25.49);
  assert.deepEqual([r.collected, r.remaining], [509.8, 178.3]);
});

ok('fixed ₱50 per day (the client\u2019s practice) until the share is complete, then nothing', () => {
  const days = Array.from({ length: 16 }, (_, i) => ({ ymd: `2026-10-${String(i + 1).padStart(2, '0')}`, payable: 330 }));
  const r = collectDailyContributions(days, 688.1, 50);
  assert.equal(r.collected, 688.1);
  assert.equal(r.remaining, 0);
  assert.equal(r.byDay['2026-10-13'], 50);
  assert.equal(r.byDay['2026-10-14'], 38.1);
  assert.equal(r.byDay['2026-10-15'], undefined);
});

ok('a short day pays only what it earned, and the rest moves to later days', () => {
  const r = collectDailyContributions([{ ymd: '2026-10-01', payable: 30 }, { ymd: '2026-10-02', payable: 0 }, { ymd: '2026-10-03', payable: 300 }], 688.1, 50);
  assert.deepEqual(r.byDay, { '2026-10-01': 30, '2026-10-03': 50 });
  assert.equal(r.remaining, 608.1);
});

ok('today\u2019s amount respects what was already collected', () => {
  assert.equal(dailyContributionFor({ perDay: 50, shareTotal: 688.1, collectedBefore: 650 }, 280), 38.1);
  assert.equal(dailyContributionFor({ perDay: 50, shareTotal: 688.1, collectedBefore: 688.1 }, 280), 0);
  assert.equal(dailyContributionFor({ perDay: 50, shareTotal: 688.1, collectedBefore: 0 }, 20), 20);
});

function fakePrisma(dailyContribution = 50) {
  const D = (ymd) => new Date(`${ymd}T00:00:00Z`);
  const inRange = (date, w) => {
    if (!w) return true;
    if (w instanceof Date) return date.getTime() === w.getTime();
    return (!w.gte || date >= w.gte) && (!w.lte || date <= w.lte);
  };
  const deliveries = ['2026-10-01', '2026-10-02', '2026-10-03'].map((ymd, i) => ({
    id: `d${i}`, date: D(ymd), truckId: 'TRK-01', sequenceNo: 1, driverId: 'DRV-001', helper1Id: null, helper2Id: null, isDouble: false, voidedAt: null, items: [{ itemName: 'Cement', unit: 'bag', quantity: 10, driverAmount: 0, helperAmount: 0 }],
  }));
  return {
    employee: { findMany: async () => [{ id: 'DRV-001', name: 'Andro', position: 'DRIVER', status: 'ACTIVE', dailyRate: 280, declaredSalary: 7280, sssEnrolled: true, philhealthEnrolled: true, pagibigEnrolled: true, mp2Amount: 0, earlyShiftDays: [] }] },
    attendance: { findMany: async () => [] },
    delivery: { findMany: async ({ where }) => deliveries.filter((d) => inRange(d.date, where?.date)) },
    crewRate: { findUnique: async () => ({ driverDaily: 280, helperDaily: 240, bonusHead: 100, bonusTrips: 5, dailyContribution }) },
    philhealthConfig: { findFirst: async () => ({ effectiveYear: 2026 }), findUnique: async () => ({ ratePercent: 5, salaryFloor: 10000, salaryCeiling: 100000 }) },
    sssBracket: { findMany: async () => C.map(([ceiling, share], i) => ({ salaryFrom: i ? C[i - 1][0] : 0, salaryTo: ceiling ?? 999999999, employeeShare: share })) },
    pagibigConfig: { findUnique: async () => ({ monthlyCap: 200, brackets: [{ salaryUpTo: 1500, employeePercent: 1 }, { salaryUpTo: null, employeePercent: 2 }] }) },
    birBracket: { findMany: async () => [] },
  };
}

ok('server: daily-paid crew contribute nothing, even if an old record still says enrolled', async () => {
  for (const setting of [50, null]) {
    const ctx = await contributionContext(fakePrisma(setting), '2026-10-03');
    assert.deepEqual(ctx.byId, {});
    const available = await crewAvailableOn(fakePrisma(setting), '2026-10-03');
    assert.equal(available.get('DRV-001'), 280);
    const r = await loadDailyContributionsForMonth(fakePrisma(setting), '2026-10-03');
    assert.deepEqual(r.rows, []);
  }
});

function reportPrisma(dailyContribution) {
  const base = fakePrisma(dailyContribution);
  const D = (ymd) => new Date(`${ymd}T00:00:00Z`);
  const inRange = (date, w) => (!w ? true : w instanceof Date ? date.getTime() === w.getTime() : (!w.gte || date >= w.gte) && (!w.lte || date <= w.lte));
  const attendance = [{ employeeId: 'DRV-001', date: D('2026-10-03'), timeIn: new Date('2026-10-03T06:40:00+08:00'), isAbsent: false, isLeave: false, tardinessMins: 10 }];
  const entries = [{ type: 'DEDUCTION', payslipId: 'crew-2026-10-02', date: D('2026-10-02'), amount: 100, loan: { employeeId: 'DRV-001' } },
    { type: 'DEDUCTION', payslipId: 'crew-2026-09-30', date: D('2026-09-30'), amount: 999, loan: { employeeId: 'DRV-001' } }];
  return {
    ...base,
    employee: { findMany: async (args) => (args?.select ? [{ id: 'DRV-001', name: 'Andro' }] : base.employee.findMany(args)) },
    attendance: { findMany: async ({ where }) => attendance.filter((a) => inRange(a.date, where?.date)) },
    loanEntry: { findMany: async ({ where }) => entries.filter((e) => inRange(e.date, where?.date)) },
  };
}

ok('crew report Oct 2 to 3: gross, late and loans add up, with no contributions', async () => {
  for (const setting of [null, 50]) {
    const [r] = await loadCrewReport(reportPrisma(setting), '2026-10-02', '2026-10-03');
    assert.deepEqual([r.name, r.role, r.days, r.trips, r.total], ['Andro', 'Driver', 2, 2, 560]);
    assert.deepEqual([r.late, r.contributions, r.loans, r.net], [30, 0, 100, 430]);
  }
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  }
  console.log(`\nALL ${passed} DAILY CONTRIBUTION CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
