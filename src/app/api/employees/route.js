import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { buildEmployeeData, shapeEmployee } from '@/lib/server/services/employees';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await prisma.employee.findMany({
      orderBy: { id: 'asc' },
      include: { account: { select: { username: true, isActive: true } } },
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
    if (!id) {
      return NextResponse.json(
        { error: 'ID number is required — it links this employee to the biometric logs.' },
        { status: 400 }
      );
    }

    const built = buildEmployeeData(body, { partial: false });
    if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

    if (await prisma.employee.findUnique({ where: { id } })) {
      return NextResponse.json({ error: `ID ${id} is already used by another employee.` }, { status: 409 });
    }

    const employee = await prisma.employee.create({ data: { id, ...built.data } });
    return NextResponse.json({ employee: shapeEmployee(employee) });
  } catch (err) {
    console.error('POST /api/employees failed:', err);
    return NextResponse.json({ error: 'Could not register the employee.' }, { status: 500 });
  }
}
