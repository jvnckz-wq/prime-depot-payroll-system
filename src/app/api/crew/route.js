import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireUser } from '@/lib/server/security/auth';
import { deviceOnline, scannedSet } from '@/lib/server/services/crew-scans';
import { todayYmdManila } from '@/lib/loan-rules';

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const crew = await prisma.employee.findMany({
    where: {
      position: { in: ['DRIVER', 'HELPER'] },
      status: 'ACTIVE',
    },
    select: { id: true, name: true, position: true },
    orderBy: { name: 'asc' },
  });

  const today = todayYmdManila();
  const [seen, online] = await Promise.all([scannedSet([today], crew.map((c) => c.id)), deviceOnline()]);
  return NextResponse.json({
    date: today,
    scannedIds: crew.map((c) => c.id).filter((id) => seen.has(`${id}|${today}`)),
    deviceOnline: online,
    drivers: crew.filter((c) => c.position === 'DRIVER').map(({ id, name }) => ({ id, name })),
    helpers: crew.filter((c) => c.position === 'HELPER').map(({ id, name }) => ({ id, name })),
  });
}
