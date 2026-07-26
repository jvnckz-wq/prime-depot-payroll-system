import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { minutesLate } from '../../../../lib/attendance';

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const atTime = (dateStr, hhmm) => (hhmm ? new Date(`${dateStr}T${hhmm}:00.000Z`) : null);
const hhmm = (dt) => (dt ? new Date(dt).toISOString().slice(11, 16) : null);
const dayStr = (d) => new Date(d).toISOString().slice(0, 10);

/// POST /api/attendance/resolve
/// Body: { biometricId }
///
/// Turns the stored unmapped scans for one biometric User ID into real
/// Attendance for the employee now registered under that id — no re-upload
/// needed. Rebuilds the full DTR for the import's period (present days from the
/// logs, the rest absent), preserves manual edits, then marks the logs resolved.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const biometricId = String(body.biometricId || '').trim();
    if (!biometricId) return NextResponse.json({ error: 'Missing biometric ID.' }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id: biometricId } });
    if (!emp) {
      return NextResponse.json(
        { error: `No employee is registered with ID ${biometricId}. Register them first, then resolve.` },
        { status: 400 }
      );
    }

    const logs = await prisma.unmappedLog.findMany({
      where: { biometricId, isResolved: false },
      include: { importBatch: true },
    });
    if (!logs.length) return NextResponse.json({ error: 'Nothing left to resolve for this ID.' }, { status: 400 });

    // Period: prefer the import batch's range so leading/trailing absences are
    // included; fall back to the span of the logs themselves.
    const batch = logs.find((l) => l.importBatch?.periodStart && l.importBatch?.periodEnd)?.importBatch;
    let start, end;
    if (batch) {
      start = new Date(batch.periodStart);
      end = new Date(batch.periodEnd);
    } else {
      const dates = logs.map((l) => dayStr(l.date)).sort();
      start = new Date(`${dates[0]}T00:00:00.000Z`);
      end = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
    }

    const days = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(dayStr(d));

    const punchByDate = new Map(logs.map((l) => [dayStr(l.date), { timeIn: hhmm(l.timeIn), timeOut: hhmm(l.timeOut) }]));

    // Keep any manual corrections already made for this employee in the period.
    const manual = await prisma.attendance.findMany({
      where: { employeeId: emp.id, date: { gte: start, lte: end }, isManualEdit: true },
      select: { date: true },
    });
    const manualDays = new Set(manual.map((m) => dayStr(m.date)));

    const rows = [];
    for (const ds of days) {
      if (manualDays.has(ds)) continue;
      const date = new Date(`${ds}T00:00:00.000Z`);
      const p = punchByDate.get(ds);
      if (!p) {
        rows.push({ employeeId: emp.id, date, isAbsent: true, tardinessMins: 0, overtimeMins: 0 });
      } else {
        const assumedIn = !p.timeIn;
        const assumedOut = !p.timeOut;
        const outTime = p.timeOut || '17:00';
        rows.push({
          employeeId: emp.id, date,
          timeIn: atTime(ds, p.timeIn), timeOut: atTime(ds, outTime),
          tardinessMins: minutesLate(emp, date, p.timeIn),
          overtimeMins: assumedOut ? 0 : Math.max(0, toMin(outTime) - 17 * 60),
          isAbsent: false, isAssumedIn: assumedIn, isAssumedOut: assumedOut,
        });
      }
    }

    // Atomic batch (pooler-safe): replace non-manual rows for the period, insert
    // the rebuilt ones, and mark this ID's logs resolved.
    await prisma.$transaction([
      prisma.attendance.deleteMany({
        where: { employeeId: emp.id, date: { gte: start, lte: end }, isManualEdit: false },
      }),
      prisma.attendance.createMany({ data: rows }),
      prisma.unmappedLog.updateMany({
        where: { biometricId, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      employee: emp.name,
      biometricId,
      daysResolved: rows.length,
      present: rows.filter((r) => !r.isAbsent).length,
    });
  } catch (err) {
    console.error('POST /api/attendance/resolve failed:', err);
    return NextResponse.json({ error: 'Could not resolve: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
