import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

/// GET /api/payroll/history           → released cut-offs with snapshot totals.
/// GET /api/payroll/history?periodId=X → one cut-off's per-employee payslips
///                                       (locked read-only view). Figures come
///                                       straight from the stored Payslip rows.
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get('periodId');

    if (periodId) {
      const period = await prisma.payrollPeriod.findUnique({
        where: { id: periodId },
        include: { payslips: { include: { employee: { select: { name: true } } } } },
      });
      if (!period) return NextResponse.json({ error: 'That cut-off was not found.' }, { status: 404 });
      const payslips = period.payslips
        .map((p) => ({
          name: p.employee?.name || p.employeeId,
          daysPresent: p.daysPresent,
          basicPay: Number(p.basicPay),
          grossPay: Number(p.grossPay),
          totalDeductions: Number(p.totalDeductions),
          netPay: Number(p.netPay),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({
        period: { id: period.id, label: period.label, start: ymd(period.startDate), end: ymd(period.endDate) },
        payslips,
      });
    }

    const periods = await prisma.payrollPeriod.findMany({
      where: { isReleased: true },
      orderBy: { startDate: 'desc' },
      include: { payslips: { select: { grossPay: true, netPay: true } } },
    });

    const out = periods.map((p) => ({
      id: p.id,
      label: p.label,
      start: ymd(p.startDate),
      end: ymd(p.endDate),
      releasedAt: p.releasedAt ? p.releasedAt.toISOString() : null,
      employees: p.payslips.length,
      totalGross: p.payslips.reduce((s, x) => s + Number(x.grossPay), 0),
      totalNet: p.payslips.reduce((s, x) => s + Number(x.netPay), 0),
    }));

    return NextResponse.json({ periods: out });
  } catch (err) {
    console.error('GET /api/payroll/history failed:', err);
    return NextResponse.json({ error: 'Could not load payroll history.' }, { status: 500 });
  }
}
