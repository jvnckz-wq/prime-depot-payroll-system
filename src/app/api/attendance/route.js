import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/auth';
import { minutesLate, summarizeAttendance } from '../../../lib/attendance';

const hhmm = (d) => (d ? new Date(d).toISOString().slice(11, 16) : null);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/// PATCH /api/attendance — a manual correction to one employee's one day.
/// Body: { employeeId, date, isAbsent, timeIn, timeOut, editNote }
///
/// Tardiness and overtime are recomputed from the corrected times using the
/// same call-time rules as the import, so a hand-fixed row stays consistent with
/// the rest. The row is flagged isManualEdit, which the importer then refuses to
/// overwrite — a correction survives every future re-import.
export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || '').trim();
    const dateStr = String(body.date || '').trim();
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'employeeId and a valid date are required.' }, { status: 400 });
    }

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const editNote = (body.editNote || '').toString().trim() || null;
    const clean = (t) => (/^\d{2}:\d{2}$/.test(String(t || '')) ? String(t) : null);

    let fields;
    if (body.isLeave) {
      // Paid leave: no times, no tardiness/overtime, and explicitly not absent.
      fields = { timeIn: null, timeOut: null, tardinessMins: 0, overtimeMins: 0, isLeave: true, isAbsent: false, isAssumedIn: false, isAssumedOut: false };
    } else if (body.isAbsent) {
      fields = { timeIn: null, timeOut: null, tardinessMins: 0, overtimeMins: 0, isLeave: false, isAbsent: true, isAssumedIn: false, isAssumedOut: false };
    } else {
      const inT = clean(body.timeIn);
      const outT = clean(body.timeOut);
      const assumedOut = !outT;
      const effectiveOut = outT || '17:00';
      fields = {
        timeIn: inT ? new Date(`${dateStr}T${inT}:00.000Z`) : null,
        timeOut: new Date(`${dateStr}T${effectiveOut}:00.000Z`),
        tardinessMins: minutesLate(emp, date, inT),
        overtimeMins: assumedOut ? 0 : Math.max(0, toMin(effectiveOut) - 17 * 60),
        isLeave: false,
        isAbsent: false,
        isAssumedIn: !inT,
        isAssumedOut: assumedOut,
      };
    }

    const data = { ...fields, isManualEdit: true, editNote };
    const row = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: data,
      create: { employeeId, date, ...data },
    });

    return NextResponse.json({
      ok: true,
      row: {
        date: ymd(row.date), weekday: WD[new Date(row.date).getUTCDay()],
        in: hhmm(row.timeIn), out: hhmm(row.timeOut),
        late: row.tardinessMins, ot: row.overtimeMins,
        absent: row.isAbsent, leave: row.isLeave, assumedIn: row.isAssumedIn, assumedOut: row.isAssumedOut, manual: row.isManualEdit,
      },
    });
  } catch (err) {
    console.error('PATCH /api/attendance failed:', err);
    return NextResponse.json({ error: 'Could not save the correction: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}

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
    // Optional explicit range — powers the read-only "view a past import" panel.
    // Absent this, everything behaves exactly as before (current period only).
    const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');
    const explicitRange = validYmd(fromStr) && validYmd(toStr)
      ? { start: new Date(`${fromStr}T00:00:00.000Z`), end: new Date(`${toStr}T00:00:00.000Z`) }
      : null;

    // Multi-cutoff attendance trend for the dashboard: Present / Late / Absent
    // totals per recent import, oldest to newest (up to the last 6 cutoffs).
    if (searchParams.get('trend')) {
      const batches = await prisma.importBatch.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { importedAt: 'desc' },
        take: 6,
      });
      const ids = batches.map((b) => b.id);
      const rows = ids.length
        ? await prisma.attendance.findMany({
            where: { importBatchId: { in: ids } },
            select: { importBatchId: true, isAbsent: true, isLeave: true, tardinessMins: true },
          })
        : [];
      const agg = {};
      for (const b of batches) agg[b.id] = { present: 0, late: 0, absent: 0 };
      for (const r of rows) {
        const a = agg[r.importBatchId];
        if (!a) continue;
        if (r.isAbsent) a.absent++;
        else if (r.isLeave) { /* leave is paid but neither worked, late, nor absent */ }
        else { a.present++; if (r.tardinessMins > 0) a.late++; }
      }
      const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const label = (b) => {
        if (!b.periodStart || !b.periodEnd) return b.filename || 'Cutoff';
        const s = new Date(b.periodStart), e = new Date(b.periodEnd);
        return `${MO[s.getUTCMonth()]} ${s.getUTCDate()}\u2013${e.getUTCDate()}`;
      };
      const trend = batches.slice().reverse().map((b) => ({ label: label(b), ...agg[b.id] }));
      return NextResponse.json({ trend });
    }

    const latest = await prisma.importBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { importedAt: 'desc' },
    });
    const period = latest && latest.periodStart && latest.periodEnd
      ? { start: latest.periodStart, end: latest.periodEnd }
      : null;
    const periodOut = period ? { start: ymd(period.start), end: ymd(period.end) } : null;

    // --- DTR for one employee (current period, or an explicit past range) ---
    if (employeeId) {
      const dtrRange = explicitRange || period;
      const where = { employeeId };
      if (dtrRange) where.date = { gte: dtrRange.start, lte: dtrRange.end };
      const rows = await prisma.attendance.findMany({ where, orderBy: { date: 'asc' } });
      return NextResponse.json({
        period: dtrRange ? { start: ymd(dtrRange.start), end: ymd(dtrRange.end) } : periodOut,
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
            leave: a.isLeave,
            assumedIn: a.isAssumedIn,
            assumedOut: a.isAssumedOut,
            manual: a.isManualEdit,
          };
        }),
      });
    }

    // --- Per-employee summaries (current period, or an explicit range when the
    // admin opens a past import read-only) ---
    const range = explicitRange || period;
    const rangeOut = range ? { start: ymd(range.start), end: ymd(range.end) } : periodOut;
    let summaries = [];
    if (range) {
      const rows = await prisma.attendance.findMany({
        where: { date: { gte: range.start, lte: range.end } },
        include: { employee: { select: { name: true, position: true } } },
      });
      summaries = summarizeAttendance(rows);
    }

    const batches = await prisma.importBatch.findMany({ orderBy: { importedAt: 'desc' }, take: 30 });
    const unmappedCount = await prisma.unmappedLog.count({ where: { isResolved: false } });

    return NextResponse.json({
      period: rangeOut,
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
