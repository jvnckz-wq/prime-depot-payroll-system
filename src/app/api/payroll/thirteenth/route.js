import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { todayYmdManila } from '@/lib/loan-rules';
import { thirteenthMonthRows } from '@/lib/thirteenth-month';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const year = Number(todayYmdManila().slice(0, 4));
    const slips = await prisma.payslip.findMany({
      where: {
        payrollType: 'STAFF',
        employee: { status: 'ACTIVE' },
        payrollPeriod: {
          isReleased: true,
          startDate: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${year + 1}-01-01T00:00:00.000Z`) },
        },
      },
      select: {
        employeeId: true,
        basicPay: true,
        employee: { select: { name: true } },
        payrollPeriod: { select: { startDate: true } },
      },
    });
    const rows = thirteenthMonthRows(slips.map((s) => ({
      employeeId: s.employeeId,
      name: s.employee?.name,
      basicPay: Number(s.basicPay),
      periodStart: new Date(s.payrollPeriod.startDate).toISOString().slice(0, 10),
    })));
    return NextResponse.json({ year, rows });
  } catch (err) {
    console.error('13th month report failed:', err);
    return NextResponse.json({ error: 'Could not load the 13th month report.' }, { status: 500 });
  }
}
