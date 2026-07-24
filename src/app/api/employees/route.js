import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/auth';

// Database enum -> the label the UI already displays. Keeping the mapping here
// means the views don't need to know the database uses enums at all.
const POSITION_LABEL = {
  OPERATIONS_HEAD: 'Operations Head',
  ADMINISTRATIVE_STAFF: 'Administrative Staff',
  // Deprecated: shown as ordinary administrative staff. The early call time is
  // now recorded per person on earlyShiftDays rather than in the job title.
  SECRETARY_SPECIAL_SHIFT: 'Administrative Staff',
  CHECKER: 'Checker',
  DRIVER: 'Driver',
  PAHINANTE: 'Pahinante',
};

// Prisma returns Decimal objects, which don't survive JSON.stringify as
// numbers. Everything crossing this boundary is converted once, here.
const num = (d) => (d == null ? 0 : Number(d));

export async function GET() {
  // Employee records — including addresses, contact numbers, and birthdates —
  // are Operations Head only, per the access control matrix. A Checker calling
  // this endpoint directly gets nothing.
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await prisma.employee.findMany({
      orderBy: { id: 'asc' },
    });

    const employees = rows.map((e) => ({
      id: e.id,
      name: e.name,
      position: POSITION_LABEL[e.position] ?? e.position,
      rate: num(e.dailyRate),
      declaredSalary: num(e.declaredSalary),
      status: e.status === 'ACTIVE' ? 'Active' : 'Inactive',
      sssOn: e.sssEnrolled,
      phOn: e.philhealthEnrolled,
      piOn: e.pagibigEnrolled,
      mp2: num(e.mp2Amount),
      address: e.address ?? '',
      contact: e.contactNumber ?? '',
      birthdate: e.birthdate ? e.birthdate.toISOString().slice(0, 10) : '',
      dateHired: e.dateHired ? e.dateHired.toISOString().slice(0, 10) : '',
      // Which days this person reports early, and at what time. Empty means no
      // early requirement — see callTimeFor() for how this drives tardiness.
      earlyShiftDays: e.earlyShiftDays ?? [],
      earlyShiftTime: e.earlyShiftTime ?? '06:00',
      // Crew are paid through Truck Payroll, so the Employees table shows them
      // as reference rows rather than editable staff-payroll records.
      crew: e.position === 'DRIVER' || e.position === 'PAHINANTE',
    }));

    return NextResponse.json({ employees });
  } catch (err) {
    console.error('GET /api/employees failed:', err);
    return NextResponse.json(
      { error: 'Could not load employees.' },
      { status: 500 }
    );
  }
}
