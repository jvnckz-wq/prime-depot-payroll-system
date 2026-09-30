import { summarizeAttendance } from '../../attendance';
import { shapeEmployee } from './employees';
import { shapeLoan } from './loans';
import { computeStaffPayroll, crewEarnings, deliveriesToLog } from '../../payroll';
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
    .filter((e) => !e.crew && Number(e.rate) > 0 && attendanceById.has(e.id));

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

export async function crewAvailableOn(prisma, ymd) {
  const [rows, rate] = await Promise.all([
    prisma.delivery.findMany({
      where: { date: toDate(ymd), voidedAt: null },
      include: { items: true },
      orderBy: [{ truckId: 'asc' }, { sequenceNo: 'asc' }],
    }),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
  ]);

  const rates = rate
    ? { driverDaily: Number(rate.driverDaily), helperDaily: Number(rate.helperDaily), bonusHead: Number(rate.bonusHead), bonusTrips: rate.bonusTrips }
    : { ...CREW_RATE_FALLBACK };

  const log = deliveriesToLog(rows.map((d) => ({
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

  const out = new Map();
  for (const p of crewEarnings(log, rates)) out.set(p.name, round2(Math.max(0, p.total)));
  return out;
}