// GET /api/audit: search the audit log by date, action, user and text (admin).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';

const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const MAX_ROWS = 500;

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const sp = new URL(request.url).searchParams;
    const to = isYmd(sp.get('to')) ? sp.get('to') : new Date().toISOString().slice(0, 10);
    const from = isYmd(sp.get('from')) ? sp.get('from') : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    if (to < from) return NextResponse.json({ error: 'The end date cannot be earlier than the start date.' }, { status: 400 });
    const where = { createdAt: { gte: new Date(`${from}T00:00:00+08:00`), lte: new Date(`${to}T23:59:59.999+08:00`) } };
    const action = sp.get('action');
    if (action) where.action = action;
    const user = sp.get('user');
    if (user) where.actorLabel = user;
    const q = (sp.get('q') || '').trim().slice(0, 80);
    if (q) where.detail = { contains: q, mode: 'insensitive' };

    const [rows, users] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: MAX_ROWS, select: { id: true, createdAt: true, actorLabel: true, action: true, detail: true } }),
      prisma.user.findMany({ select: { username: true } }),
    ]);
    return NextResponse.json({
      from, to, capped: rows.length === MAX_ROWS,
      rows: rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), user: r.actorLabel || '', action: r.action, detail: r.detail || '' })),
      users: users.map((u) => u.username).filter(Boolean).sort(),
    });
  } catch (err) {
    console.error('GET /api/audit failed:', err);
    return NextResponse.json({ error: 'Could not load the audit log.' }, { status: 500 });
  }
}
