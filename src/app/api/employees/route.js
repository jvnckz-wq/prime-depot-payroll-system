import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/auth';
import { buildEmployeeData, shapeEmployee } from '../../../lib/employees';

export async function GET() {
  // Employee records — including addresses, contact numbers, and birthdates —
  // are Operations Head only, per the access control matrix. A Checker calling
  // this endpoint directly gets nothing.
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await prisma.employee.findMany({ orderBy: { id: 'asc' } });
    return NextResponse.json({ employees: rows.map(shapeEmployee) });
  } catch (err) {
    console.error('GET /api/employees failed:', err);
    return NextResponse.json({ error: 'Could not load employees.' }, { status: 500 });
  }
}

// Registering an employee is an Operations Head action.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    // The ID is the link to the biometric scanner: required, and set once here.
    // It is never changed afterward (see the PATCH route).
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
