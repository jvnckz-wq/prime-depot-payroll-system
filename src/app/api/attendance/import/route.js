import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { requireAdmin } from '@/lib/server/security/auth';
import { MAX_IMPORT_BYTES, base64TooLarge } from '@/lib/server/security/uploads';
import { parseZktecoXls } from '@/lib/server/services/attendance-import';
import { buildAttendanceRow } from '@/lib/attendance';

const atTime = (dateStr, hhmm) => (hhmm ? new Date(`${dateStr}T${hhmm}:00.000Z`) : null);
const dayStr = (d) => d.toISOString().slice(0, 10);

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let batch;
  try {
    const body = await request.json();
    const filename = String(body.filename || 'attendance.xls').slice(0, 200);
    if (!body.dataBase64) return NextResponse.json({ error: 'No file was received.' }, { status: 400 });

    const tooLarge = base64TooLarge(body.dataBase64, MAX_IMPORT_BYTES, 'That file');
    if (tooLarge) return NextResponse.json({ error: tooLarge }, { status: 413 });

    const { period, roster, punches } = parseZktecoXls(Buffer.from(body.dataBase64, 'base64'));

    const days = [];
    for (let d = new Date(period.start); d <= period.end; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(dayStr(d));
    }

    const employees = await prisma.employee.findMany();
    const empById = new Map(employees.map((e) => [String(e.id), e]));

    batch = await prisma.importBatch.create({
      data: { filename, periodStart: period.start, periodEnd: period.end, status: 'PROCESSING' },
    });

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
          const p = userDays[ds];
          attendanceRows.push(buildAttendanceRow(emp, ds, p || null, { importBatchId: batch.id }));
        }
      } else {
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
