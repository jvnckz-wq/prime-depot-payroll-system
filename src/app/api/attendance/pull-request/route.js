import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

export const runtime = 'nodejs';

const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
// A RUNNING request older than this is assumed dead (agent crashed / laptop
// slept), so a new pull is allowed and the stale one is marked FAILED.
const STALE_MS = 5 * 60 * 1000;

const serialize = (r) => (r ? {
  id: r.id,
  from: ymd(r.periodStart),
  to: ymd(r.periodEnd),
  status: r.status,
  requestedAt: r.requestedAt,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  matched: r.matched,
  mappedRows: r.mappedRows,
  unmappedUsers: r.unmappedUsers,
  error: r.error,
} : null);

/// GET /api/attendance/pull-request
/// Returns the most recent pull request plus the device connection status, so
/// the button can show its progress and whether the agent is reachable.
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let device = { status: 'offline', lastSyncAt: null };
  try {
    const s = await prisma.deviceSync.findUnique({ where: { id: 'primary' } });
    if (s && s.lastSyncAt) {
      const ageMs = Date.now() - new Date(s.lastSyncAt).getTime();
      device = { status: ageMs < 30000 ? 'live' : ageMs < 60000 ? 'stale' : 'offline', lastSyncAt: s.lastSyncAt };
    }
  } catch { /* device_sync not migrated yet */ }
  try {
    const latest = await prisma.pullRequest.findFirst({ orderBy: { requestedAt: 'desc' } });
    return NextResponse.json({ request: serialize(latest), device });
  } catch {
    // Table not migrated yet — behave as "no request".
    return NextResponse.json({ request: null, device });
  }
}

/// POST /api/attendance/pull-request  { from, to }
/// Queues a "pull this cutoff from the device" request. The sync agent executes
/// it on its next heartbeat. Only one pull runs at a time.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const from = String(body?.from || '').slice(0, 10);
    const to = String(body?.to || '').slice(0, 10);
    if (!validYmd(from) || !validYmd(to)) {
      return NextResponse.json({ error: 'Invalid or missing from/to (expected YYYY-MM-DD).' }, { status: 400 });
    }
    if (to < from) return NextResponse.json({ error: 'The "to" date is before "from".' }, { status: 400 });

    const active = await prisma.pullRequest.findFirst({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      orderBy: { requestedAt: 'desc' },
    });
    if (active) {
      const runningFresh = active.status === 'RUNNING' && active.startedAt && (Date.now() - new Date(active.startedAt).getTime()) <= STALE_MS;
      if (runningFresh) {
        return NextResponse.json({ error: 'A pull is already running. Wait for it to finish.', request: serialize(active) }, { status: 409 });
      }
      // PENDING (agent hasn't picked it up — e.g. device/agent offline) or a stale
      // RUNNING (agent died): supersede it so the user can retry, never stuck.
      await prisma.pullRequest.update({
        where: { id: active.id },
        data: { status: 'FAILED', finishedAt: new Date(), error: active.status === 'PENDING' ? 'Superseded by a newer request.' : 'Timed out — the agent did not finish. Is it running on the warehouse PC?' },
      }).catch(() => {});
    }

    const created = await prisma.pullRequest.create({
      data: { periodStart: new Date(`${from}T00:00:00.000Z`), periodEnd: new Date(`${to}T00:00:00.000Z`), status: 'PENDING' },
    });
    return NextResponse.json({ ok: true, request: serialize(created) });
  } catch (err) {
    console.error('POST /api/attendance/pull-request failed:', err);
    return NextResponse.json({ error: 'Could not queue the pull: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
