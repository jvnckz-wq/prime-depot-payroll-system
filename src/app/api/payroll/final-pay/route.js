import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { shapeEmployee } from '../../../../lib/employees';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/// GET /api/payroll/final-pay?employeeId=ID
/// Auto-fill context for a resigning employee's final pay: the last imported
/// cutoff's days worked + OT/allowances, and the total basic salary they've
/// earned this year (for the pro-rated 13th month). Everything is editable on
/// the form — this is just the starting point.
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    const shaped = shapeEmployee(emp);

    // Latest imported cutoff.
    const latest = await prisma.importBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { importedAt: 'desc' },
    });
    const period = latest && latest.periodStart && latest.periodEnd
      ? { start: latest.periodStart, end: latest.periodEnd } : null;

    // This employee's attendance for that cutoff.
    let days = 0, otWeekdayMins = 0, otWeekendMins = 0, lateMins = 0;
    if (period) {
      const rows = await prisma.attendance.findMany({
        where: { employeeId, date: { gte: period.start, lte: period.end } },
      });
      for (const a of rows) {
        if (!a.isAbsent) days++;
        lateMins += a.tardinessMins;
        const dow = new Date(a.date).getUTCDay();
        if (dow === 0 || dow === 6) otWeekendMins += a.overtimeMins;
        else otWeekdayMins += a.overtimeMins;
      }
    }

    const hourly = shaped.rate / 8;
    const otWeekday = round2(hourly * (otWeekdayMins / 60) * 1.25);
    const otWeekend = round2(hourly * (otWeekendMins / 60) * 1.30);
    const allowance = round2(Number(shaped.allowance) || 0);
    const otAndAllowances = round2(otWeekday + otWeekend + allowance);

    // Total basic salary earned this year, from released payslips (for the
    // pro-rated 13th month). May be incomplete if older cutoffs predate the
    // system, so the form lets the admin adjust it.
    const yearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00.000Z`);
    const yslips = await prisma.payslip.findMany({
      where: { employeeId, payrollType: 'STAFF', payrollPeriod: { startDate: { gte: yearStart } } },
      select: { basicPay: true },
    });
    const yearBasic = round2(yslips.reduce((s, p) => s + Number(p.basicPay), 0));

    // Unused leave for the year, monetised in the final pay. Days taken are the
    // attendance rows flagged as leave; the balance is credits minus those.
    const leaveUsed = await prisma.attendance.count({
      where: { employeeId, isLeave: true, date: { gte: yearStart } },
    });
    const leaveCredits = shaped.leaveCredits ?? 5;
    const leaveRemaining = Math.max(0, leaveCredits - leaveUsed);

    return NextResponse.json({
      employee: { id: shaped.id, name: shaped.name, position: shaped.position, rate: shaped.rate },
      period: period ? { start: ymd(period.start), end: ymd(period.end) } : null,
      days,
      otAndAllowances,
      yearBasic,
      yearPayslips: yslips.length,
      leaveCredits,
      leaveUsed,
      leaveRemaining,
    });
  } catch (err) {
    console.error('GET /api/payroll/final-pay failed:', err);
    return NextResponse.json({ error: 'Could not load final-pay details.' }, { status: 500 });
  }
}
