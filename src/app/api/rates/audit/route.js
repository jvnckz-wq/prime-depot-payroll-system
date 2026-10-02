import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = await prisma.auditLog.findMany({
    where: { action: 'CREW_RATES_UPDATED' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { displayName: true, username: true } } },
  });

  const entries = rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    by: r.actor?.displayName || r.actor?.username || r.actorLabel || 'Unknown',
    targetType: r.targetType,
    detail: r.detail || '',
  }));

  return NextResponse.json({ entries });
}
