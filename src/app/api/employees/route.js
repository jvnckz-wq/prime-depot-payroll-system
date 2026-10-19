import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { buildEmployeeData, shapeEmployee, shiftScheduleOps } from '@/lib/server/services/employees';
import { employeeIdError } from '@/lib/field-rules';
import { todayYmdManila } from '@/lib/loan-rules';
import { withRetry } from '@/lib/server/db/db-retry';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await prisma.employee.findMany({
      orderBy: { id: 'asc' },
      include: { account: { select: { username: true, isActive: true } }, shiftSchedules: true, _count: { select: { attendance: true, loans: true, payslips: true, drivenDeliveries: true, helper1Deliveries: true, helper2Deliveries: true } } },
    });
    return NextResponse.json({ employees: rows.map(shapeEmployee) });
  } catch (err) {
    console.error('GET /api/employees failed:', err);
    return NextResponse.json({ error: 'Could not load employees.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const idErr = employeeIdError(id);
    if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });

    const built = buildEmployeeData(body, { partial: false });
    if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

    if (await prisma.employee.findUnique({ where: { id } })) {
      return NextResponse.json({ error: `ID ${id} is already used by another employee.`, field: 'id' }, { status: 409 });
    }

    const employee = await prisma.employee.create({ data: { id, ...built.data } });
    const ops = shiftScheduleOps(prismaBase, null, employee, body, todayYmdManila());
    if (ops.length) await withRetry(() => prismaBase.$transaction(ops));
    const fresh = await prisma.employee.findUnique({ where: { id: employee.id }, include: { shiftSchedules: true } });
    return NextResponse.json({ employee: shapeEmployee(fresh || employee) });
  } catch (err) {
    console.error('POST /api/employees failed:', err);
    return NextResponse.json({ error: 'Could not register the employee.' }, { status: 500 });
  }
}
