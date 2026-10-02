import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { requireAdmin } from '@/lib/server/security/auth';
import { shapeEmployee } from '@/lib/server/services/employees';
import { shapeLoan } from '@/lib/server/services/loans';
import { deductionOps } from '@/lib/server/services/loans-apply';
import { isDailyPosition } from '@/lib/positions';
import { planDeductions, todayYmdManila } from '@/lib/loan-rules';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const finalKey = (employeeId) => `final-${employeeId}`;

const loadFinalLoans = (employeeId) => prisma.loan.findMany({
  where: { employeeId, OR: [{ isSettled: false }, { entries: { some: { payslipId: finalKey(employeeId) } } }] },
  include: { employee: true, entries: true },
  orderBy: { createdAt: 'asc' },
});

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    const total = round2(body.finalPayTotal);
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
    if (!Number.isFinite(total) || total < 0) return NextResponse.json({ error: 'Enter a final pay total of zero or more.' }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    const key = finalKey(employeeId);
    const today = todayYmdManila();
    const loans = (await loadFinalLoans(employeeId)).map(shapeLoan);
    const plan = planDeductions(loans, { crew: isDailyPosition(emp.position), runKey: key, endYmd: today, available: { [employeeId]: total }, full: true });
    if (loans.some((l) => l.entries.some((e) => e.payslipId === key))) {
      return NextResponse.json({ error: 'The deduction from this final pay is already recorded. Undo it first to record it again.' }, { status: 409 });
    }
    if (plan.writes.length === 0) return NextResponse.json({ error: 'There is nothing owed to deduct.' }, { status: 400 });

    await withRetry(() => prismaBase.$transaction(deductionOps(prismaBase, plan, { runKey: key, endYmd: today })));
    return NextResponse.json({ recorded: true, total: plan.total, unpaidTotal: plan.unpaidTotal, settled: plan.settled });
  } catch (err) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'This deduction was just recorded. Refresh the page.' }, { status: 409 });
    console.error('POST /api/payroll/final-pay failed:', err);
    return NextResponse.json({ error: 'Could not record the deduction.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
    const key = finalKey(employeeId);
    const touched = await prisma.loanEntry.findMany({ where: { payslipId: key, type: 'DEDUCTION' }, select: { loanId: true } });
    if (!touched.length) return NextResponse.json({ error: 'Nothing was recorded from this final pay.' }, { status: 404 });
    const loanIds = [...new Set(touched.map((t) => t.loanId))];
    const [removed] = await withRetry(() => prismaBase.$transaction([
      prismaBase.loanEntry.deleteMany({ where: { payslipId: key, type: 'DEDUCTION' } }),
      prismaBase.loan.updateMany({ where: { id: { in: loanIds }, isSettled: true }, data: { isSettled: false, settledAt: null } }),
    ]));
    return NextResponse.json({ undone: true, entries: removed.count });
  } catch (err) {
    console.error('DELETE /api/payroll/final-pay failed:', err);
    return NextResponse.json({ error: 'Could not undo the deduction.' }, { status: 500 });
  }
}

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

    const latest = await prisma.importBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { importedAt: 'desc' },
    });
    const period = latest && latest.periodStart && latest.periodEnd
      ? { start: latest.periodStart, end: latest.periodEnd } : null;

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

    const yearStart = new Date(`${new Date().getFullYear()}-01-01T00:00:00.000Z`);
    const yslips = await prisma.payslip.findMany({
      where: { employeeId, payrollType: 'STAFF', payrollPeriod: { startDate: { gte: yearStart } } },
      select: { basicPay: true },
    });
    const yearBasic = round2(yslips.reduce((s, p) => s + Number(p.basicPay), 0));

    const leaveUsed = await prisma.attendance.count({
      where: { employeeId, isLeave: true, date: { gte: yearStart } },
    });
    const leaveCredits = shaped.leaveCredits ?? 5;
    const leaveRemaining = Math.max(0, leaveCredits - leaveUsed);

    const loans = (await loadFinalLoans(employeeId)).map(shapeLoan);

    return NextResponse.json({
      finalKey: finalKey(employeeId),
      loans,
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
