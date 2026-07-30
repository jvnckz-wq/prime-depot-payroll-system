import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

/// GET /api/payroll/history
/// Released cut-offs, newest first, each with its snapshot totals. These figures
/// come straight from the stored Payslip rows, so history stays fixed even as
/// current rates or records change.
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
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
