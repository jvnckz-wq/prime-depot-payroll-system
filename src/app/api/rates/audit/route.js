import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';

/// GET /api/rates/audit — the piece-rate / crew-rate change history.
///
/// Every edit to a rate is money that decides someone's pay, so the trail of
/// who changed what, and when, is kept and shown here. Reads the CREW_RATES_UPDATED
/// rows from the shared audit log; admin-only, newest first.
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
