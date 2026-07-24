import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireUser } from '../../../lib/auth';

/// GET /api/crew — drivers and pahinante, names only.
///
/// A Checker cannot open employee records, and should not: those carry
/// salaries, addresses, contact numbers, and birthdates. But logging a
/// delivery is impossible without knowing who is on the truck, so this
/// endpoint exists to hand over exactly that and nothing else — an id and a
/// name per crew member.
///
/// Keeping it separate from /api/employees is the point. Widening that
/// endpoint's audience would have been one line and would have quietly handed
/// every checker the payroll of every employee.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const crew = await prisma.employee.findMany({
    where: {
      position: { in: ['DRIVER', 'PAHINANTE'] },
      status: 'ACTIVE',
    },
    select: { id: true, name: true, position: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    drivers: crew.filter((c) => c.position === 'DRIVER').map(({ id, name }) => ({ id, name })),
    helpers: crew.filter((c) => c.position === 'PAHINANTE').map(({ id, name }) => ({ id, name })),
  });
}
