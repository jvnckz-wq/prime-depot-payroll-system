import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '../../../../lib/prisma';
import { withRetry } from '../../../../lib/db-retry';
import { requireAdmin } from '../../../../lib/auth';
import { MAX_IMPORT_BYTES, base64TooLarge } from '../../../../lib/uploads';
import { parseZktecoXls } from '../../../../lib/attendance-import';
import { callTimeFor, minutesLate } from '../../../../lib/attendance';

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const atTime = (dateStr, hhmm) => (hhmm ? new Date(`${dateStr}T${hhmm}:00.000Z`) : null);
const dayStr = (d) => d.toISOString().slice(0, 10);

/// POST /api/attendance/import
/// Body: { filename, dataBase64 } — the biometric .xls, base64-encoded.
///
/// Parses the ZKTeco export, matches each biometric User ID to an Employee of
/// the same id, computes tardiness against the position's call time, and writes
/// one Attendance row per matched employee per day (present or absent). Punches
/// whose id matches no employee are kept in UnmappedLog for later resolution,
/// never dropped. Manually-edited rows in the period are preserved on re-import.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let batch;
  try {
    const body = await request.json();
    const filename = String(body.filename || 'attendance.xls').slice(0, 200);
    if (!body.dataBase64) return NextResponse.json({ error: 'No file was received.' }, { status: 400 });

    // Cap the payload before decoding it. A real ZKTeco export for one cutoff is
    // well under a megabyte, and parsing a spreadsheet is expensive enough that
    // an unbounded one is worth refusing outright rather than discovering how
    // large it was halfway through XLSX.read.
    const tooLarge = base64TooLarge(body.dataBase64, MAX_IMPORT_BYTES, 'That file');
    if (tooLarge) return NextResponse.json({ error: tooLarge }, { status: 413 });

    const { period, roster, punches } = parseZktecoXls(Buffer.from(body.dataBase64, 'base64'));

    // Every day in the period, inclusive.
    const days = [];
    for (let d = new Date(period.start); d <= period.end; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(dayStr(d));
    }

    // Match by id — the biometric User ID is the Employee id (per the design).
    const employees = await prisma.employee.findMany();
    const empById = new Map(employees.map((e) => [String(e.id), e]));

    batch = await prisma.importBatch.create({
      data: { filename, periodStart: period.start, periodEnd: period.end, status: 'PROCESSING' },
    });

    // Keep manual corrections: never overwrite a row someone fixed by hand.
    const manual = await prisma.attendance.findMany({
      where: { date: { gte: period.start, lte: period.end }, isManualEdit: true },
      select: { employeeId: true, date: true },
    });
    const manualKeys = new Set(manual.map((m) => `${m.employeeId}|${dayStr(m.date)}`));

    const attendanceRows = [];
    const unmappedRows = [];
    const matchedIds = [];
    let totalRows = 0;

    for (const { userId, name } of roster) {
      const emp = empById.get(userId);
      const userDays = punches.get(userId)?.days || {};

      if (emp) {
        matchedIds.push(emp.id);
        for (const ds of days) {
          totalRows++;
          if (manualKeys.has(`${emp.id}|${ds}`)) continue;
          const date = new Date(`${ds}T00:00:00.000Z`);
          const p = userDays[ds];
          if (!p) {
            attendanceRows.push({ employeeId: emp.id, date, isAbsent: true, tardinessMins: 0, overtimeMins: 0, importBatchId: batch.id });
          } else {
            const assumedIn = !p.timeIn;
            const assumedOut = !p.timeOut;
            const tardiness = minutesLate(emp, date, p.timeIn);
            const timeOut = p.timeOut || '17:00';
            attendanceRows.push({
              employeeId: emp.id, date,
              timeIn: atTime(ds, p.timeIn), timeOut: atTime(ds, timeOut),
              tardinessMins: tardiness,
              overtimeMins: assumedOut ? 0 : Math.max(0, toMin(timeOut) - 17 * 60),
              isAbsent: false, isAssumedIn: assumedIn, isAssumedOut: assumedOut, importBatchId: batch.id,
            });
          }
        }
      } else {
        // Unmapped: log the actual punches only — an absence can't be pinned on
        // someone the system doesn't know yet.
        for (const [ds, p] of Object.entries(userDays)) {
          totalRows++;
          unmappedRows.push({
            importBatchId: batch.id, biometricId: userId, biometricName: name || null,
            date: new Date(`${ds}T00:00:00.000Z`),
            timeIn: atTime(ds, p.timeIn), timeOut: p.timeOut ? atTime(ds, p.timeOut) : null,
          });
        }
      }
    }

    // Atomic batch (not interactive — the Neon pooler runs these reliably).
    // A re-import is authoritative for its period, so clear that period's old
    // rows first: the matched employees' non-manual attendance AND every prior
    // unmapped log for these dates (otherwise old unmapped logs pile up and the
    // count keeps climbing on each re-import). Then insert the fresh rows.
    const ops = [];
    if (matchedIds.length) {
      ops.push(prismaBase.attendance.deleteMany({
        where: { date: { gte: period.start, lte: period.end }, employeeId: { in: matchedIds }, isManualEdit: false },
      }));
    }
    ops.push(prismaBase.unmappedLog.deleteMany({
      where: { date: { gte: period.start, lte: period.end } },
    }));
    if (attendanceRows.length) ops.push(prismaBase.attendance.createMany({ data: attendanceRows }));
    if (unmappedRows.length) ops.push(prismaBase.unmappedLog.createMany({ data: unmappedRows }));
    ops.push(prismaBase.importBatch.update({
      where: { id: batch.id },
      data: { status: 'COMPLETED', totalRows, mappedRows: attendanceRows.length, unmappedRows: unmappedRows.length },
    }));
    // Replace-on-reimport: a fresh import of a period is authoritative, so drop
    // any earlier completed batch for the SAME period. The history then keeps one
    // entry per cutoff. Attendance rows are preserved (the FK is SET NULL); only
    // the now-redundant batch record and its stale unmapped logs (cascade) go.
    ops.push(prismaBase.importBatch.deleteMany({
      where: { periodStart: period.start, periodEnd: period.end, status: 'COMPLETED', id: { not: batch.id } },
    }));
    await withRetry(() => prismaBase.$transaction(ops));

    return NextResponse.json({
      ok: true,
      period: { start: days[0], end: days[days.length - 1] },
      matchedEmployees: matchedIds.length,
      mappedRows: attendanceRows.length,
      unmappedRows: unmappedRows.length,
      unmappedUsers: new Set(unmappedRows.map((u) => u.biometricId)).size,
    });
  } catch (err) {
    console.error('POST /api/attendance/import failed:', err);
    if (batch) {
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED', errorMessage: String(err?.message || 'unknown').slice(0, 500) },
      }).catch(() => {});
    }
    return NextResponse.json({ error: 'Import failed: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
