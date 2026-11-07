// GET /api/crew: active drivers and helpers, for choosing a truck crew, with who scanned and who already timed out today.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireUser } from '@/lib/server/security/auth';
import { crewDayRows, deviceOnline } from '@/lib/server/services/crew-scans';
import { checkerGate, hasScan, outClock } from '@/lib/delivery-review';
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
  const me = auth.user.role === 'CHECKER' ? auth.user.employeeId : null;
  const [rows, online] = await Promise.all([crewDayRows([today], [...crew.map((c) => c.id), ...(me ? [me] : [])]), deviceOnline()]);
  const rowOf = (id) => rows.get(`${id}|${today}`);
  const outAt = {};
  for (const c of crew) { const out = outClock(rowOf(c.id)); if (out) outAt[c.id] = out; }
  return NextResponse.json({
    date: today,
    scannedIds: crew.map((c) => c.id).filter((id) => hasScan(rowOf(id))),
    outAt,
    // For a checker account: whether they may log trips now (on duty, or the device is offline).
    checker: auth.user.role === 'CHECKER'
      ? (me ? checkerGate(rowOf(me), online) : { status: 'unlinked', error: 'This checker account is not linked to an employee. Ask the Operations Head to link it.' })
      : null,
    deviceOnline: online,
    drivers: crew.filter((c) => c.position === 'DRIVER').map(({ id, name }) => ({ id, name })),
    helpers: crew.filter((c) => c.position === 'HELPER').map(({ id, name }) => ({ id, name })),
  });
}
