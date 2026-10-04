import { summarizeAttendance } from '../../attendance';
import { POSITION_LABEL, shapeEmployee } from './employees';
import { isDailyAttendancePosition } from '../../positions';
import { shapeLoan } from './loans';
import {
  collectDailyContributions, computeStaffPayroll, contributionPerDay, crewDayPay, crewEarnings, dailyContributionFor, dailyPresent,
  deliveriesToLog, monthlyEmployeeShare,
} from '../../payroll';
import { shapeBir, shapePagibig, shapePhilhealth, shapeSss } from './statutory';
import { CREW_RATE_FALLBACK } from '../../../data/seed';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const toDate = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

export async function loadStatutory(prisma) {
  const latest = await prisma.philhealthConfig.findFirst({ orderBy: { effectiveYear: 'desc' } });
  const year = latest?.effectiveYear ?? new Date().getFullYear();

  const [sss, ph, pagibig, bir] = await Promise.all([
    prisma.sssBracket.findMany({ where: { effectiveYear: year } }),
    prisma.philhealthConfig.findUnique({ where: { effectiveYear: year } }),
    prisma.pagibigConfig.findUnique({ where: { effectiveYear: year }, include: { brackets: true } }),
    prisma.birBracket.findMany({ where: { effectiveYear: year } }),
  ]);

  return {
    year,
    statutory: {
      sss: shapeSss(sss),
      philhealth: shapePhilhealth(ph),
      pagibig: shapePagibig(pagibig),
      bir: shapeBir(bir),
    },
  };
}

export async function loadStaffPayrollInputs(prisma, { start, end, withLoans = true }) {
  const [employees, attendanceRows, loanRows, { statutory }] = await Promise.all([
    prisma.employee.findMany({ orderBy: { id: 'asc' } }),
    prisma.attendance.findMany({
      where: { date: { gte: toDate(start), lte: toDate(end) } },
      include: { employee: { select: { name: true, position: true } } },
    }),
    withLoans
      ? prisma.loan.findMany({ include: { employee: true, entries: true }, orderBy: { createdAt: 'asc' } })
      : Promise.resolve([]),
    loadStatutory(prisma),
  ]);

  const attendanceById = new Map(summarizeAttendance(attendanceRows).map((s) => [s.id, s]));
  const staff = employees
    .map(shapeEmployee)
    .filter((e) => !e.daily && Number(e.rate) > 0 && attendanceById.has(e.id));

  return { staff, attendanceById, statutory, loans: loanRows.map(shapeLoan) };
}

export function staffAvailable({ staff, attendanceById, statutory }) {
  const out = new Map();
  for (const e of staff) {
    const net = computeStaffPayroll(e, [], statutory, attendanceById.get(e.id)).net;
    out.set(e.id, round2(Math.max(0, net)));
  }
  return out;
}

const isContributing = (e) => {
  const s = shapeEmployee(e);
  return s.sssOn || s.phOn || s.piOn;
};

const DAILY_POSITIONS = ['DRIVER', 'PAHINANTE', 'CHECKER', 'WAREHOUSE_OFFICER'];
const ymdOf = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const dayBefore = (ymd) => ymdOf(new Date(toDate(ymd).getTime() - 86400000));

const shapeRates = (rate) => (rate
  ? { driverDaily: Number(rate.driverDaily), helperDaily: Number(rate.helperDaily), bonusHead: Number(rate.bonusHead), bonusTrips: rate.bonusTrips, dailyContribution: rate.dailyContribution == null ? null : Number(rate.dailyContribution) }
  : { ...CREW_RATE_FALLBACK });

const dailyEntry = (e, row) => {
  const present = dailyPresent(row);
  return {
    id: e.id,
    name: e.name,
    position: POSITION_LABEL[e.position] ?? e.position,
    attendanceDaily: isDailyAttendancePosition(e.position),
    dailyRate: Number(e.dailyRate) || 0,
    present,
    lateMins: present ? (row.tardinessMins || 0) : 0,
  };
};

const toLog = (rows, ymd) => deliveriesToLog(rows.map((d) => ({
  id: d.id,
  date: ymd,
  truckId: d.truckId,
  seq: d.sequenceNo,
  driver: d.driverId,
  helpers: [d.helper1Id, d.helper2Id].filter(Boolean),
  dbl: d.isDouble,
  voided: false,
  items: (d.items || []).map((i) => ({ item: i.itemName, unit: i.unit, qty: Number(i.quantity), d: Number(i.driverAmount), h: Number(i.helperAmount) })),
})));

const dailyEmployees = (prisma) => prisma.employee.findMany({
  where: { status: 'ACTIVE', position: { in: DAILY_POSITIONS } },
  orderBy: { name: 'asc' },
});

async function dailyPayByDate(prisma, employees, rates, start, end) {
  if (start > end) return new Map();
  const [rows, attendance] = await Promise.all([
    prisma.delivery.findMany({
      where: { date: { gte: toDate(start), lte: toDate(end) }, voidedAt: null },
      include: { items: true },
      orderBy: [{ truckId: 'asc' }, { sequenceNo: 'asc' }],
    }),
    prisma.attendance.findMany({ where: { date: { gte: toDate(start), lte: toDate(end) } } }),
  ]);
  const dates = new Set();
  const deliveriesOn = new Map();
  for (const d of rows) {
    const ymd = ymdOf(d.date);
    if (!ymd) continue;
    dates.add(ymd);
    if (!deliveriesOn.has(ymd)) deliveriesOn.set(ymd, []);
    deliveriesOn.get(ymd).push(d);
  }
  const attendanceOn = new Map();
  for (const a of attendance) {
    const ymd = ymdOf(a.date);
    if (!ymd) continue;
    dates.add(ymd);
    if (!attendanceOn.has(ymd)) attendanceOn.set(ymd, new Map());
    attendanceOn.get(ymd).set(a.employeeId, a);
  }
  const out = new Map();
  for (const ymd of dates) {
    const rowsById = attendanceOn.get(ymd) || new Map();
    const staff = employees.map((e) => ({ ...dailyEntry(e, rowsById.get(e.id)), key: e.id }));
    out.set(ymd, crewDayPay(crewEarnings(toLog(deliveriesOn.get(ymd) || [], ymd), rates), staff));
  }
  return out;
}

export async function contributionContext(prisma, ymd, { employees, rates } = {}) {
  const [emps, rateRow] = await Promise.all([
    employees ? Promise.resolve(employees) : dailyEmployees(prisma),
    rates ? Promise.resolve(null) : prisma.crewRate.findUnique({ where: { id: 'current' } }),
  ]);
  const r = rates || shapeRates(rateRow);
  const setting = r.dailyContribution;
  const enrolled = emps.filter(isContributing);
  const byId = {};
  if (!enrolled.length || setting === 0) return { setting, byId };

  const { statutory } = await loadStatutory(prisma);
  const monthStart = `${ymd.slice(0, 8)}01`;
  const pays = await dailyPayByDate(prisma, emps, r, monthStart, dayBefore(ymd));
  for (const e of enrolled) {
    const share = monthlyEmployeeShare(shapeEmployee(e), statutory);
    const perDay = contributionPerDay(setting, share.total, ymd);
    const days = [];
    for (const [day, people] of pays) {
      const p = people.find((x) => x.name === e.id);
      if (p) days.push({ ymd: day, payable: p.payable });
    }
    const { collected } = collectDailyContributions(days, share.total, perDay);
    byId[e.id] = { share, perDay, shareTotal: share.total, collectedBefore: collected };
  }
  return { setting, byId };
}

export async function loadDailyStaff(prisma, ymd) {
  const [employees, rows, rateRow] = await Promise.all([
    dailyEmployees(prisma),
    prisma.attendance.findMany({ where: { date: toDate(ymd) } }),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
  ]);
  const ctx = await contributionContext(prisma, ymd, { employees, rates: shapeRates(rateRow) });
  const byId = new Map(rows.map((r) => [r.employeeId, r]));
  return employees.map((e) => {
    const c = ctx.byId[e.id];
    return {
      ...dailyEntry(e, byId.get(e.id)),
      contribution: c ? { perDay: c.perDay, shareTotal: c.shareTotal, collectedBefore: c.collectedBefore } : null,
    };
  });
}

export async function loadDailyContributionsForMonth(prisma, ymd) {
  const [employees, rateRow] = await Promise.all([
    dailyEmployees(prisma),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
  ]);
  const rates = shapeRates(rateRow);
  const setting = rates.dailyContribution;
  const enrolled = employees.filter(isContributing);
  if (!enrolled.length) return { setting, month: ymd.slice(0, 7), rows: [] };

  const { statutory } = await loadStatutory(prisma);
  const pays = await dailyPayByDate(prisma, employees, rates, `${ymd.slice(0, 8)}01`, ymd);
  const rows = enrolled.map((e) => {
    const share = monthlyEmployeeShare(shapeEmployee(e), statutory);
    const perDay = contributionPerDay(setting, share.total, ymd);
    const days = [];
    for (const [day, people] of pays) {
      const p = people.find((x) => x.name === e.id);
      if (p) days.push({ ymd: day, payable: p.payable });
    }
    const { collected, remaining } = collectDailyContributions(days, share.total, perDay);
    return { id: e.id, name: e.name, position: POSITION_LABEL[e.position] ?? e.position, ...share, perDay, collected, remaining };
  });
  return { setting, month: ymd.slice(0, 7), rows };
}

export async function crewAvailableOn(prisma, ymd) {
  const [rows, rate, dailyStaff] = await Promise.all([
    prisma.delivery.findMany({
      where: { date: toDate(ymd), voidedAt: null },
      include: { items: true },
      orderBy: [{ truckId: 'asc' }, { sequenceNo: 'asc' }],
    }),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
    loadDailyStaff(prisma, ymd),
  ]);

  const rates = shapeRates(rate);
  const people = crewDayPay(crewEarnings(toLog(rows, ymd), rates), dailyStaff.map((d) => ({ ...d, key: d.id })));
  const contributionOf = new Map(dailyStaff.filter((d) => d.contribution).map((d) => [d.id, d.contribution]));

  const out = new Map();
  for (const p of people) {
    const c = contributionOf.get(p.name);
    const contribution = c ? dailyContributionFor(c, p.payable) : 0;
    out.set(p.name, round2(Math.max(0, p.payable - contribution)));
  }
  return out;
}

const ROLE_ORDER = ['Driver', 'Pahinante', 'Checker', 'Warehouse Officer'];

export async function loadCrewReport(prisma, from, to) {
  const [employees, everyone, rateRow, entries] = await Promise.all([
    dailyEmployees(prisma),
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
    prisma.loanEntry.findMany({
      where: { type: 'DEDUCTION', payslipId: { startsWith: 'crew-' }, date: { gte: toDate(from), lte: toDate(to) } },
      include: { loan: { select: { employeeId: true } } },
    }),
  ]);
  const rates = shapeRates(rateRow);
  const pays = await dailyPayByDate(prisma, employees, rates, `${from.slice(0, 8)}01`, to);

  const contributionOn = new Map();
  const enrolled = employees.filter(isContributing);
  if (enrolled.length && rates.dailyContribution !== 0) {
    const { statutory } = await loadStatutory(prisma);
    for (const e of enrolled) {
      const share = monthlyEmployeeShare(shapeEmployee(e), statutory);
      const byMonth = new Map();
      for (const [day, people] of pays) {
        const p = people.find((x) => x.name === e.id);
        if (!p) continue;
        const month = day.slice(0, 7);
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push({ ymd: day, payable: p.payable });
      }
      for (const [month, days] of byMonth) {
        const perDay = contributionPerDay(rates.dailyContribution, share.total, `${month}-01`);
        const { byDay } = collectDailyContributions(days, share.total, perDay);
        for (const [day, amount] of Object.entries(byDay)) contributionOn.set(`${e.id}|${day}`, amount);
      }
    }
  }

  const loansBy = new Map();
  for (const en of entries) {
    const id = en.loan?.employeeId;
    if (id) loansBy.set(id, round2((loansBy.get(id) || 0) + Number(en.amount)));
  }

  const nameOf = new Map(everyone.map((e) => [e.id, e.name]));
  const merged = new Map();
  for (const [day, people] of pays) {
    if (day < from || day > to) continue;
    for (const p of people) {
      if (!merged.has(p.name)) {
        merged.set(p.name, {
          id: p.name, name: nameOf.get(p.name) || p.name, role: p.role, trucks: new Set(),
          days: 0, trips: 0, dailyRate: 0, pieceRate: 0, bonus: 0, total: 0, late: 0, contributions: 0,
        });
      }
      const m = merged.get(p.name);
      m.days += p.days;
      m.trips += p.trips;
      m.dailyRate = round2(m.dailyRate + p.dailyRate);
      m.pieceRate = round2(m.pieceRate + p.pieceRate);
      m.bonus = round2(m.bonus + p.bonus);
      m.total = round2(m.total + p.total);
      m.late = round2(m.late + (p.late || 0));
      m.contributions = round2(m.contributions + (contributionOn.get(`${p.name}|${day}`) || 0));
      (p.trucks || []).forEach((t) => m.trucks.add(t));
    }
  }

  const rank = (role) => (ROLE_ORDER.indexOf(role) + 1) || ROLE_ORDER.length + 1;
  return [...merged.values()]
    .map((m) => {
      const loans = loansBy.get(m.id) || 0;
      return { ...m, trucks: [...m.trucks].sort(), loans, net: round2(m.total - m.late - m.contributions - loans) };
    })
    .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name));
}
