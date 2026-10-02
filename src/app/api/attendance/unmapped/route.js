import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';

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

    return NextResponse.json({ groups });
  } catch (err) {
    console.error('GET /api/attendance/unmapped failed:', err);
    return NextResponse.json({ error: 'Could not load unmapped IDs.' }, { status: 500 });
  }
}
