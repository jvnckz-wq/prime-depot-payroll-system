import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireUser } from '@/lib/server/security/auth';

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
