import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { enrolledNotRegistered } from '@/lib/server/services/device-roster';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const logs = await prisma.unmappedLog.findMany({
      where: { isResolved: false },
      orderBy: { date: 'asc' },
    });

    const byId = new Map();
    for (const l of logs) {
      if (!byId.has(l.biometricId)) {
        byId.set(l.biometricId, {
          biometricId: l.biometricId,
          biometricName: l.biometricName || null,
          punchCount: 0,
          firstDate: ymd(l.date),
          lastDate: ymd(l.date),
        });
      }
      const g = byId.get(l.biometricId);
      g.punchCount++;
      const d = ymd(l.date);
      if (d < g.firstDate) g.firstDate = d;
      if (d > g.lastDate) g.lastDate = d;
      if (!g.biometricName && l.biometricName) g.biometricName = l.biometricName;
    }

    const ids = [...byId.keys()];
    const employees = ids.length
      ? await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const empById = new Map(employees.map((e) => [e.id, e.name]));

    const groups = [...byId.values()]
      .map((g) => ({ ...g, hasEmployee: empById.has(g.biometricId), employeeName: empById.get(g.biometricId) || null }))
      .sort((a, b) => Number(a.biometricId) - Number(b.biometricId) || a.biometricId.localeCompare(b.biometricId));

    const enrolled = await enrolledNotRegistered().catch(() => ({ users: [], rosterAt: null }));
    return NextResponse.json({ groups, enrolled: enrolled.users, rosterAt: enrolled.rosterAt });
  } catch (err) {
    console.error('GET /api/attendance/unmapped failed:', err);
    return NextResponse.json({ error: 'Could not load unmapped IDs.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => ({}));
    const biometricId = String(body?.biometricId ?? '').trim();
    if (body?.action !== 'ignore' || !/^\d{1,20}$/.test(biometricId)) {
      return NextResponse.json({ error: 'Choose a device ID to ignore.' }, { status: 400 });
    }
    const sync = await prisma.deviceSync.findUnique({ where: { id: 'primary' }, select: { ignoredIds: true } });
    if (!sync) return NextResponse.json({ error: 'The device has not synced yet.' }, { status: 404 });
    if (!sync.ignoredIds.includes(biometricId)) {
      await prisma.deviceSync.update({ where: { id: 'primary' }, data: { ignoredIds: { push: biometricId } } });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/attendance/unmapped failed:', err);
    return NextResponse.json({ error: 'Could not ignore that device ID.' }, { status: 500 });
  }
}
