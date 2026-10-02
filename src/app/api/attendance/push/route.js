import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { pairPunches, buildAttendanceRow } from '@/lib/attendance';

export const runtime = 'nodejs';

const MAX_SCANS = 500;

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
      if (!times.length) continue;
      matchedIds.push(emp.id);
      const paired = pairPunches(times);
      presentRows.push(buildAttendanceRow(emp, date, paired));
    }

    const day = new Date(`${date}T00:00:00.000Z`);

    const manual = matchedIds.length
      ? await prisma.attendance.findMany({
          where: { date: day, employeeId: { in: matchedIds }, isManualEdit: true },
          select: { employeeId: true },
        })
      : [];
    const manualSet = new Set(manual.map((m) => m.employeeId));
    const rows = presentRows.filter((r) => !manualSet.has(r.employeeId));
    const writeIds = rows.map((r) => r.employeeId);

    if (writeIds.length) {
      await withRetry(() => prismaBase.$transaction([
        prismaBase.attendance.deleteMany({
          where: { date: day, employeeId: { in: writeIds }, isManualEdit: false },
        }),
        prismaBase.attendance.createMany({ data: rows }),
      ]));
    }

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
