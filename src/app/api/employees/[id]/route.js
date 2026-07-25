import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { buildEmployeeData, shapeEmployee } from '../../../../lib/employees';

/// PATCH /api/employees/:id — edit a record, or flip its Active/Inactive status.
///
/// The ID itself is never changed here. It is the key that attendance logs,
/// loans, and payslips all point at, so renaming it would orphan that history.
/// An edit that only carries { status } is how the list's Deactivate/Activate
/// button works — the same endpoint, a partial update of one field.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();

    const built = buildEmployeeData(body, { partial: true });
    if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
    if (!Object.keys(built.data).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: `No employee found with ID ${id}.` }, { status: 404 });

    const employee = await prisma.employee.update({ where: { id }, data: built.data });
    return NextResponse.json({ employee: shapeEmployee(employee) });
  } catch (err) {
    console.error('PATCH /api/employees/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the employee.' }, { status: 500 });
  }
}
