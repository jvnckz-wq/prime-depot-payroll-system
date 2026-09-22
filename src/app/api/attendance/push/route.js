import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma, prismaBase } from '../../../../lib/prisma';
import { withRetry } from '../../../../lib/db-retry';
import { pairPunches, buildAttendanceRow } from '../../../../lib/attendance';

// Prisma + node crypto need the Node.js runtime, not the Edge runtime.
export const runtime = 'nodejs';

const MAX_SCANS = 500;

/// Constant-time check of the device's bearer token against DEVICE_SYNC_TOKEN.
/// Fail-closed: if the env var is unset, every push is rejected rather than
/// silently accepted. The device is not a logged-in admin, so this endpoint is
/// authenticated by the shared token only, never by a session.
function tokenOk(request) {
  const expected = process.env.DEVICE_SYNC_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  const got = header.startsWith('Bearer ')
    ? header.slice(7)
    : (request.headers.get('x-device-token') || '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/// POST /api/attendance/push
/// Auth: `Authorization: Bearer <DEVICE_SYNC_TOKEN>` (or `x-device-token`).
/// Body: { date: 'YYYY-MM-DD', scans: [ { biometricId, times: ['HH:MM', ...] } ] }
///
/// The sync agent sends the FULL set of the day's punches for each user every
/// cycle (stateless re-pair): the server pairs them with the SAME shared
/// function the .xls import uses, then rewrites that day's rows for the users in
/// the payload. Because it runs mid-day, it only writes PRESENT rows — it never
/// marks anyone absent (the day is not over; the period .xls import remains
/// authoritative for absences at cutoff). Hand-corrected rows are never touched.
/// Scans whose id matches no employee are returned in `unmapped`, not dropped.
export async function POST(request) {
  if (!tokenOk(request)) {
    return NextResponse.json({ error: 'Unauthorized device.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const date = String(body?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid or missing date (expected YYYY-MM-DD).' }, { status: 400 });
    }
    const scans = Array.isArray(body?.scans) ? body.scans : null;
    if (!scans) {
      return NextResponse.json({ error: 'Missing scans[].' }, { status: 400 });
    }
    if (scans.length > MAX_SCANS) {
      return NextResponse.json({ error: `Too many scans in one push (max ${MAX_SCANS}).` }, { status: 413 });
    }

    const employees = await prisma.employee.findMany();
    const empById = new Map(employees.map((e) => [String(e.id), e]));

    const matchedIds = [];
    const presentRows = [];
    const unmapped = [];

    for (const s of scans) {
      const bid = String(s?.biometricId ?? '').trim();
      if (!bid) continue;
      const times = Array.isArray(s?.times)
        ? s.times.map((t) => String(t).slice(0, 5)).filter((t) => /^\d{2}:\d{2}$/.test(t))
        : [];
      const emp = empById.get(bid);
      if (!emp) { unmapped.push(bid); continue; }
      if (!times.length) continue; // nothing to record for this user yet
      matchedIds.push(emp.id);
      const paired = pairPunches(times);
      presentRows.push(buildAttendanceRow(emp, date, paired)); // no importBatchId — this is a live row
    }

    const day = new Date(`${date}T00:00:00.000Z`);

    // Never overwrite a hand-corrected row: drop those employees from the write.
    const manual = matchedIds.length
      ? await prisma.attendance.findMany({
          where: { date: day, employeeId: { in: matchedIds }, isManualEdit: true },
          select: { employeeId: true },
        })
      : [];
    const manualSet = new Set(manual.map((m) => m.employeeId));
    const rows = presentRows.filter((r) => !manualSet.has(r.employeeId));
    const writeIds = rows.map((r) => r.employeeId);

    // Stateless re-pair: this push is authoritative for these users on this
    // date, so clear their non-manual rows for the day and insert the fresh
    // ones. Array-form transaction on prismaBase — the Neon pooler runs these
    // reliably; interactive transactions do not.
    if (writeIds.length) {
      await withRetry(() => prismaBase.$transaction([
        prismaBase.attendance.deleteMany({
          where: { date: day, employeeId: { in: writeIds }, isManualEdit: false },
        }),
        prismaBase.attendance.createMany({ data: rows }),
      ]));
    }

    // Heartbeat: record that we just heard from the device, even on a cycle with
    // no scans, so the Live tab can tell "connected" from "agent is dead." Kept
    // in its own try/catch: a heartbeat problem (or a not-yet-migrated table)
    // must never fail the actual attendance sync.
    try {
      const now = new Date();
      await withRetry(() => prismaBase.deviceSync.upsert({
        where: { id: 'primary' },
        create: { id: 'primary', lastSyncAt: now, lastScanAt: scans.length ? now : null, matched: writeIds.length },
        update: { lastSyncAt: now, matched: writeIds.length, ...(scans.length ? { lastScanAt: now } : {}) },
      }));
    } catch (hbErr) {
      console.error('Heartbeat write skipped:', hbErr?.message || hbErr);
    }

    // Hand any queued "Pull from device" to the agent. Flip PENDING (or a stale
    // RUNNING, i.e. a previous agent that died mid-pull) to RUNNING so the next
    // heartbeat won't hand out the same one twice. Best-effort: a not-yet-migrated
    // table just means no pull is offered.
    let pull = null;
    try {
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const req = await prismaBase.pullRequest.findFirst({
        where: { OR: [{ status: 'PENDING' }, { status: 'RUNNING', startedAt: { lt: staleBefore } }] },
        orderBy: { requestedAt: 'asc' },
      });
      if (req) {
        await prismaBase.pullRequest.update({ where: { id: req.id }, data: { status: 'RUNNING', startedAt: new Date() } });
        pull = { id: req.id, from: req.periodStart.toISOString().slice(0, 10), to: req.periodEnd.toISOString().slice(0, 10) };
      }
    } catch (pullErr) {
      console.error('Pull-request check skipped:', pullErr?.message || pullErr);
    }

    return NextResponse.json({
      ok: true,
      date,
      matched: writeIds.length,
      skippedManual: manualSet.size,
      unmapped,
      pull,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('POST /api/attendance/push failed:', err);
    return NextResponse.json({ error: 'Push failed: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
