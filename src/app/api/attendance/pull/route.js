import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma, prismaBase } from '../../../../lib/prisma';
import { withRetry } from '../../../../lib/db-retry';
import { pairPunches, buildAttendanceRow } from '../../../../lib/attendance';

// Prisma + node crypto need the Node.js runtime, not the Edge runtime.
export const runtime = 'nodejs';

const atTime = (dateStr, hhmm) => (hhmm ? new Date(`${dateStr}T${hhmm}:00.000Z`) : null);
const dayStr = (d) => d.toISOString().slice(0, 10);
const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Same fail-closed device token as the live push.
function tokenOk(request) {
  const expected = process.env.DEVICE_SYNC_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  const got = header.startsWith('Bearer ') ? header.slice(7) : (request.headers.get('x-device-token') || '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/// POST /api/attendance/pull
/// Auth: `Authorization: Bearer <DEVICE_SYNC_TOKEN>` (or `x-device-token`).
/// Body: {
///   from: 'YYYY-MM-DD', to: 'YYYY-MM-DD',       // the cutoff, inclusive
///   roster: [{ userId, name }],                 // device-enrolled users
///   punches: { "<userId>": { "<YYYY-MM-DD>": ["HH:MM", ...] } }  // Manila times
/// }
///
/// This is the .xls import, sourced from the device instead of a file. The local
/// "pull-cutoff" command reads the whole cutoff from the ZK3969 (including scans
/// made while the laptop was off) and posts it here. The server writes one
/// Attendance row per matched employee per day — PRESENT from the paired punches,
/// ABSENT when there was no scan — using the SAME pairing and row-building as the
/// import, so payroll math is identical. It records an ImportBatch (so the cutoff
/// shows up in Employee DTR and Import History exactly like an import), preserves
/// manual edits, keeps unmatched ids in UnmappedLog, and is authoritative for the
/// period (it replaces that period's earlier non-manual rows and batch).
export async function POST(request) {
  if (!tokenOk(request)) {
    return NextResponse.json({ error: 'Unauthorized device.' }, { status: 401 });
  }

  let batch;
  let requestId;
  try {
    const body = await request.json();
    requestId = body?.requestId ? String(body.requestId) : null;
    // The agent reports a device-read failure here so the request doesn't hang in
    // "Pulling" — mark it FAILED with a clear reason.
    if (requestId && body?.failed) {
      await prisma.pullRequest.update({
        where: { id: requestId },
        data: { status: 'FAILED', finishedAt: new Date(), error: String(body.error || 'Could not read the device.').slice(0, 500) },
      }).catch(() => {});
      return NextResponse.json({ ok: true, marked: 'FAILED' });
    }
    const from = String(body?.from || '').slice(0, 10);
    const to = String(body?.to || '').slice(0, 10);
    if (!validYmd(from) || !validYmd(to)) {
      return NextResponse.json({ error: 'Invalid or missing from/to (expected YYYY-MM-DD).' }, { status: 400 });
    }
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (end < start) {
      return NextResponse.json({ error: 'The "to" date is before "from".' }, { status: 400 });
    }
    // A cutoff is ~15-16 days; refuse anything absurd rather than build a huge write.
    const spanDays = Math.round((end - start) / 86400000) + 1;
    if (spanDays > 40) {
      return NextResponse.json({ error: `Period too long (${spanDays} days).` }, { status: 413 });
    }
    const roster = Array.isArray(body?.roster) ? body.roster : null;
    if (!roster) return NextResponse.json({ error: 'Missing roster[].' }, { status: 400 });
    const punches = (body?.punches && typeof body.punches === 'object') ? body.punches : {};

    // Every day in the period, inclusive.
    const days = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(dayStr(d));

    // Match by id — the biometric User ID is the Employee id (per the design).
    const employees = await prisma.employee.findMany();
    const empById = new Map(employees.map((e) => [String(e.id), e]));

    batch = await prisma.importBatch.create({
      data: { filename: `Device pull: ${from} to ${to}`, periodStart: start, periodEnd: end, status: 'PROCESSING' },
    });

    // Keep manual corrections: never overwrite a row someone fixed by hand.
    const manual = await prisma.attendance.findMany({
      where: { date: { gte: start, lte: end }, isManualEdit: true },
      select: { employeeId: true, date: true },
    });
    const manualKeys = new Set(manual.map((m) => `${m.employeeId}|${dayStr(m.date)}`));

    const attendanceRows = [];
    const unmappedRows = [];
    const matchedIds = [];
    let totalRows = 0;

    const cleanTimes = (v) => (Array.isArray(v) ? v.map((t) => String(t).slice(0, 5)).filter((t) => /^\d{2}:\d{2}$/.test(t)) : []);

    for (const r of roster) {
      const userId = String(r?.userId ?? '').trim();
      if (!userId) continue;
      const name = r?.name || null;
      const emp = empById.get(userId);
      const userDays = punches[userId] || {};

      if (emp) {
        matchedIds.push(emp.id);
        for (const ds of days) {
          totalRows++;
          if (manualKeys.has(`${emp.id}|${ds}`)) continue;
          const times = cleanTimes(userDays[ds]);
          const paired = times.length ? pairPunches(times) : null; // null -> absent row
          attendanceRows.push(buildAttendanceRow(emp, ds, paired, { importBatchId: batch.id }));
        }
      } else {
        // Unmapped: log the actual punches only — an absence can't be pinned on
        // someone the system doesn't know yet.
        for (const [ds, raw] of Object.entries(userDays)) {
          const times = cleanTimes(raw);
          if (!times.length) continue;
          totalRows++;
          const paired = pairPunches(times);
          unmappedRows.push({
            importBatchId: batch.id, biometricId: userId, biometricName: name,
            date: new Date(`${ds}T00:00:00.000Z`),
            timeIn: atTime(ds, paired.timeIn), timeOut: paired.timeOut ? atTime(ds, paired.timeOut) : null,
          });
        }
      }
    }

    // Atomic batch (not interactive — the Neon pooler runs these reliably). This
    // pull is authoritative for its period, so clear that period's old non-manual
    // rows and prior unmapped logs first, then insert the fresh set. Mirrors the
    // .xls import exactly.
    const ops = [];
    if (matchedIds.length) {
      ops.push(prismaBase.attendance.deleteMany({
        where: { date: { gte: start, lte: end }, employeeId: { in: matchedIds }, isManualEdit: false },
      }));
    }
    ops.push(prismaBase.unmappedLog.deleteMany({ where: { date: { gte: start, lte: end } } }));
    if (attendanceRows.length) ops.push(prismaBase.attendance.createMany({ data: attendanceRows }));
    if (unmappedRows.length) ops.push(prismaBase.unmappedLog.createMany({ data: unmappedRows }));
    ops.push(prismaBase.importBatch.update({
      where: { id: batch.id },
      data: { status: 'COMPLETED', totalRows, mappedRows: attendanceRows.length, unmappedRows: unmappedRows.length },
    }));
    // Replace-on-repull: drop any earlier completed batch for the SAME period so
    // history keeps one entry per cutoff (attendance rows survive; FK is SET NULL).
    ops.push(prismaBase.importBatch.deleteMany({
      where: { periodStart: start, periodEnd: end, status: 'COMPLETED', id: { not: batch.id } },
    }));
    await withRetry(() => prismaBase.$transaction(ops));

    // If this pull came from a queued web request, mark it done so the button
    // can flip to "Pulled". Best-effort — the write above is what matters.
    if (requestId) {
      await prisma.pullRequest.update({
        where: { id: requestId },
        data: { status: 'DONE', finishedAt: new Date(), matched: matchedIds.length, mappedRows: attendanceRows.length, unmappedUsers: new Set(unmappedRows.map((u) => u.biometricId)).size },
      }).catch((e) => console.error('Pull-request DONE update skipped:', e?.message || e));
    }

    return NextResponse.json({
      ok: true,
      period: { start: from, end: to },
      matchedEmployees: matchedIds.length,
      mappedRows: attendanceRows.length,
      unmappedRows: unmappedRows.length,
      unmappedUsers: new Set(unmappedRows.map((u) => u.biometricId)).size,
    });
  } catch (err) {
    console.error('POST /api/attendance/pull failed:', err);
    if (batch) {
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED', errorMessage: String(err?.message || 'unknown').slice(0, 500) },
      }).catch(() => {});
    }
    if (requestId) {
      await prisma.pullRequest.update({
        where: { id: requestId },
        data: { status: 'FAILED', finishedAt: new Date(), error: String(err?.message || 'unknown').slice(0, 500) },
      }).catch(() => {});
    }
    return NextResponse.json({ error: 'Pull failed: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
