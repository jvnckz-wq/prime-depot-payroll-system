import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/auth';

const hhmm = (d) => (d ? new Date(d).toISOString().slice(11, 16) : null);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/// GET /api/attendance
///   - no params      → per-employee summaries for the current period, the
///                       import history, and the unresolved-unmapped count.
///   - ?employeeId=ID → that employee's day-by-day DTR for the current period.
///
/// "Current period" is the range of the most recent completed import.
export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');

    const latest = await prisma.importBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { importedAt: 'desc' },
    });
    const period = latest && latest.periodStart && latest.periodEnd
      ? { start: latest.periodStart, end: latest.periodEnd }
      : null;
    const periodOut = period ? { start: ymd(period.start), end: ymd(period.end) } : null;

    // --- DTR for one employee ---
    if (employeeId) {
      const where = { employeeId };
      if (period) where.date = { gte: period.start, lte: period.end };
      const rows = await prisma.attendance.findMany({ where, orderBy: { date: 'asc' } });
      return NextResponse.json({
        period: periodOut,
        rows: rows.map((a) => {
          const d = new Date(a.date);
          return {
            date: ymd(d),
            weekday: WD[d.getUTCDay()],
            in: hhmm(a.timeIn),
            out: hhmm(a.timeOut),
            late: a.tardinessMins,
            ot: a.overtimeMins,
            absent: a.isAbsent,
            assumedIn: a.isAssumedIn,
            assumedOut: a.isAssumedOut,
            manual: a.isManualEdit,
          };
        }),
      });
    }

    // --- Per-employee summaries for the current period ---
    let summaries = [];
    if (period) {
      const rows = await prisma.attendance.findMany({
        where: { date: { gte: period.start, lte: period.end } },
        include: { employee: { select: { name: true, position: true } } },
      });
      const byEmp = new Map();
      for (const a of rows) {
        if (!byEmp.has(a.employeeId)) {
          byEmp.set(a.employeeId, {
            id: a.employeeId, name: a.employee?.name || a.employeeId,
            present: 0, absent: 0, daysLate: 0, lateMins: 0, otMins: 0,
          });
        }
        const s = byEmp.get(a.employeeId);
        if (a.isAbsent) s.absent++; else s.present++;
        if (a.tardinessMins > 0) s.daysLate++;
        s.lateMins += a.tardinessMins;
        s.otMins += a.overtimeMins;
      }
      summaries = [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    const batches = await prisma.importBatch.findMany({ orderBy: { importedAt: 'desc' }, take: 30 });
    const unmappedCount = await prisma.unmappedLog.count({ where: { isResolved: false } });

    return NextResponse.json({
      period: periodOut,
      summaries,
      unmappedCount,
      batches: batches.map((b) => ({
        id: b.id,
        filename: b.filename,
        importedAt: b.importedAt.toISOString(),
        periodStart: b.periodStart ? ymd(b.periodStart) : null,
        periodEnd: b.periodEnd ? ymd(b.periodEnd) : null,
        mappedRows: b.mappedRows,
        unmappedRows: b.unmappedRows,
        status: b.status,
      })),
    });
  } catch (err) {
    console.error('GET /api/attendance failed:', err);
    return NextResponse.json({ error: 'Could not load attendance.' }, { status: 500 });
  }
}
