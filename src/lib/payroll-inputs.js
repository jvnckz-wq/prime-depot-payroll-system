// Server-side inputs for a payroll run, loaded from the database alone.
//
// Finalize/Release and both "Apply Deductions" routes need the same things:
// the cutoff's attendance, the statutory tables, the employees, and from those,
// how much pay each person actually has left for a loan. Loading them in one
// place means the payslip that is stored, the deduction that is taken, and the
// Staff Payroll screen all start from the same numbers.

import { summarizeAttendance } from './attendance';
import { shapeEmployee } from './employees';
import { shapeLoan } from './loans';
import { computeStaffPayroll, crewEarnings, deliveriesToLog } from './payroll';
import { shapeBir, shapePagibig, shapePhilhealth, shapeSss } from './statutory';
import { CREW_RATE_FALLBACK } from '../data/seed';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const toDate = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

/// The active statutory year is the most recent one loaded, matching
/// GET /api/statutory. Payroll must read the same tables the admin was shown.
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

/// Everything a staff run needs for the attendance range [start, end].
///
/// `staff` is exactly the set Staff Payroll shows: office staff (crew are paid
/// through Truck Payroll) with a daily rate above zero AND attendance in the
/// range. Someone with no attendance gets no payslip on screen, so the server
/// must not invent one from the 11-day estimate either: that mismatch used to
/// make Finalize refuse, and it would have let a loan be taken from pay that
/// was never earned.
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

/// Pay each staff member has left for loans and advances: net after
/// contributions and tardiness, with no loan in it (the same computeStaffPayroll
/// the payslip uses). Never below zero: that is the P0 floor.
export function staffAvailable({ staff, attendanceById, statutory }) {
  const out = new Map();
  for (const e of staff) {
    const net = computeStaffPayroll(e, [], statutory, attendanceById.get(e.id)).net;
    out.set(e.id, round2(Math.max(0, net)));
  }
  return out;
}

/// That day's earnings per crew member, keyed by EMPLOYEE ID.
///
/// A delivery stores the driver and helpers by id (driverId, helper1Id,
/// helper2Id). The screens pass names to crewEarnings; here the ids go in
/// instead, so two crew with the same name can never share a deduction. Voided
/// trips are left out, as everywhere else.
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
