import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const [
      users, employees, attendance, importBatches, unmappedLogs, trucks,
      deliveries, deliveryItems, rateItems, doubleRateAreas, loans, loanEntries,
      sssBrackets, philhealthConfigs, pagibigConfigs, pagibigBrackets, birBrackets,
      payrollPeriods, payslips,
    ] = await Promise.all([
      prisma.user.findMany({ select: { id: true, username: true, displayName: true, role: true, mustChangePassword: true, createdAt: true } }),
      prisma.employee.findMany(),
      prisma.attendance.findMany(),
      prisma.importBatch.findMany(),
      prisma.unmappedLog.findMany(),
      prisma.truck.findMany(),
      prisma.delivery.findMany(),
      prisma.deliveryItem.findMany(),
      prisma.rateItem.findMany(),
      prisma.doubleRateArea.findMany(),
      prisma.loan.findMany(),
      prisma.loanEntry.findMany(),
      prisma.sssBracket.findMany(),
      prisma.philhealthConfig.findMany(),
      prisma.pagibigConfig.findMany(),
      prisma.pagibigBracket.findMany(),
      prisma.birBracket.findMany(),
      prisma.payrollPeriod.findMany(),
      prisma.payslip.findMany(),
    ]);

    const data = {
      _meta: { app: 'Prime Depot Payroll System', exportedAt: new Date().toISOString(), version: 1 },
      users, employees, attendance, importBatches, unmappedLogs, trucks,
      deliveries, deliveryItems, rateItems, doubleRateAreas, loans, loanEntries,
      sssBrackets, philhealthConfigs, pagibigConfigs, pagibigBrackets, birBrackets,
      payrollPeriods, payslips,
    };

    const counts = Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== '_meta').map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    );

    return NextResponse.json({ ...data, _meta: { ...data._meta, counts } });
  } catch (err) {
    console.error('GET /api/export failed:', err);
    return NextResponse.json({ error: 'Could not build the export.' }, { status: 500 });
  }
}
