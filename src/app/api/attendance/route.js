import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { isCalendarDate, isClockTime, minutesLate, shiftEndFor, summarizeAttendance } from '@/lib/attendance';
import { timeOrderError } from '@/lib/field-rules';
import { enrolledNotRegistered } from '@/lib/server/services/device-roster';
import { cutoffsWithAttendance, finalizedCutoffsBetween, lockedMessage } from '@/lib/server/services/cutoff-lock';
import { countNoScanDeliveries } from '@/lib/server/services/crew-scans';
import { cutoffOf } from '@/lib/loan-rules';
import { isPieceRatePosition } from '@/lib/positions';

const hhmm = (d) => (d ? new Date(d).toISOString().slice(11, 16) : null);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || '').trim();
    const dateStr = String(body.date || '').trim();
    if (!employeeId || !isCalendarDate(dateStr)) {
      return NextResponse.json({ error: 'employeeId and a valid date are required.' }, { status: 400 });
    }
    const locked = await finalizedCutoffsBetween(dateStr, dateStr);
    if (locked.length) return NextResponse.json({ error: lockedMessage(locked) }, { status: 409 });
    if (!body.isLeave && !body.isAbsent && [body.timeIn, body.timeOut].some((t) => t != null && t !== '' && !isClockTime(t))) {
      return NextResponse.json({ error: 'Times must be in 24-hour HH:MM, from 00:00 to 23:59.' }, { status: 400 });
    }
    const orderErr = !body.isLeave && !body.isAbsent ? timeOrderError(body.timeIn, body.timeOut) : '';
    if (orderErr) return NextResponse.json({ error: orderErr }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, include: { shiftSchedules: true } });
    if (!emp) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    if (body.isLeave && isPieceRatePosition(emp.position)) {
      return NextResponse.json({ error: 'Drivers and helpers have no leave. Mark the day as present or absent.' }, { status: 400 });
    }

    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const editNote = (body.editNote || '').toString().replace(/\s+/g, ' ').trim().slice(0, 200) || null;
    const clean = (t) => (isClockTime(t) ? String(t) : null);

    let fields;
    if (body.isLeave) {
      fields = { timeIn: null, timeOut: null, tardinessMins: 0, overtimeMins: 0, isLeave: true, isAbsent: false, isAssumedIn: false, isAssumedOut: false };
    } else if (body.isAbsent) {
      fields = { timeIn: null, timeOut: null, tardinessMins: 0, overtimeMins: 0, isLeave: false, isAbsent: true, isAssumedIn: false, isAssumedOut: false };
    } else {
      const inT = clean(body.timeIn);
      const outT = clean(body.timeOut);
      const assumedOut = !outT;
      const shiftEnd = shiftEndFor(dateStr);
      const effectiveOut = outT || shiftEnd;
      fields = {
        timeIn: inT ? new Date(`${dateStr}T${inT}:00.000Z`) : null,
        timeOut: new Date(`${dateStr}T${effectiveOut}:00.000Z`),
        tardinessMins: minutesLate(emp, date, inT),
        overtimeMins: assumedOut ? 0 : Math.max(0, toMin(effectiveOut) - toMin(shiftEnd)),
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

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');
    const explicitRange = validYmd(fromStr) && validYmd(toStr)
      ? { start: new Date(`${fromStr}T00:00:00.000Z`), end: new Date(`${toStr}T00:00:00.000Z`) }
      : null;

    if (searchParams.get('live')) {
      const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      const reqDate = searchParams.get('date');
      const dateStr = validYmd(reqDate) ? reqDate : todayStr;
      const isToday = dateStr === todayStr;
      const day = new Date(`${dateStr}T00:00:00.000Z`);
      const rows = await prisma.attendance.findMany({
        where: { date: day },
        include: { employee: { select: { name: true, position: true } } },
        orderBy: { timeIn: 'asc' },
      });
      const expected = await prisma.employee.findMany({
        where: { status: 'ACTIVE', position: { not: 'OPERATIONS_HEAD' }, createdAt: { lte: new Date(`${dateStr}T23:59:59.999+08:00`) } },
        select: { id: true, name: true },
      });
      const accounted = new Set(rows.filter((a) => !a.isAbsent || a.isLeave || a.isManualEdit).map((a) => a.employeeId));
      const notYetIn = expected
        .filter((e) => !accounted.has(e.id))
        .map((e) => ({ id: e.id, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const present = rows
        .filter((a) => !a.isAbsent && !a.isLeave && a.employee?.position !== 'OPERATIONS_HEAD')
        .map((a) => ({
          id: a.employeeId,
          name: (a.employee && a.employee.name) || a.employeeId,
          position: (a.employee && a.employee.position) || null,
          in: hhmm(a.timeIn),
          out: a.isAssumedOut ? null : hhmm(a.timeOut),
          late: a.tardinessMins,
          status: a.isAssumedOut ? 'in' : 'out',
          assumedIn: a.isAssumedIn,
        }));
      const stats = {
        present: present.length,
        late: present.filter((r) => r.late > 0).length,
        notYetIn: notYetIn.length,
      };

      let sync = { status: 'offline', lastSyncAt: null, lastScanAt: null };
      if (isToday) {
        try {
          const s = await prisma.deviceSync.findUnique({ where: { id: 'primary' } });
          if (s && s.lastSyncAt) {
            const ageMs = Date.now() - new Date(s.lastSyncAt).getTime();
            const status = ageMs < 30000 ? 'live' : ageMs < 60000 ? 'stale' : 'offline';
            sync = { status, lastSyncAt: s.lastSyncAt, lastScanAt: s.lastScanAt || null };
          }
        } catch { }
      }

      return NextResponse.json({
        finalized: (await finalizedCutoffsBetween(dateStr, dateStr)).length > 0, date: dateStr, today: todayStr, isToday, rows: present, notYetIn, stats, sync });
    }

    if (searchParams.get('trend')) {
      const recent = (await cutoffsWithAttendance()).slice(-6);
      const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const agg = new Map(recent.map((c) => {
        const [, m, d] = c.start.split('-').map(Number);
        return [c.start, { label: `${MO[m - 1]} ${d}\u2013${Number(c.end.slice(8, 10))}`, present: 0, late: 0, absent: 0 }];
      }));
      const rows = recent.length
        ? await prisma.attendance.findMany({
            where: { date: { gte: new Date(`${recent[0].start}T00:00:00.000Z`), lte: new Date(`${recent[recent.length - 1].end}T00:00:00.000Z`) } },
            select: { date: true, isAbsent: true, isLeave: true, tardinessMins: true },
          })
        : [];
      for (const r of rows) {
        const a = agg.get(cutoffOf(ymd(r.date)).start);
        if (!a) continue;
        if (r.isAbsent) a.absent++;
        else if (!r.isLeave) { a.present++; if (r.tardinessMins > 0) a.late++; }
      }
      return NextResponse.json({ trend: [...agg.values()] });
    }

    const latest = await prisma.importBatch.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { importedAt: 'desc' },
    });
    const period = latest && latest.periodStart && latest.periodEnd
      ? { start: latest.periodStart, end: latest.periodEnd }
      : null;
    const periodOut = period ? { start: ymd(period.start), end: ymd(period.end) } : null;

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
    const unmappedIdRows = await prisma.unmappedLog.groupBy({ by: ['biometricId'], where: { isResolved: false } });
    const enrolledUsers = await enrolledNotRegistered().then((r) => r.users).catch(() => []);
    const enrolledCount = enrolledUsers.length;
    const unregisteredIds = new Set([...unmappedIdRows.map((r) => r.biometricId), ...enrolledUsers.map((u) => u.userId)]).size;
    const noScanDeliveries = await countNoScanDeliveries().catch(() => 0);

    const finalized = rangeOut ? (await finalizedCutoffsBetween(rangeOut.start, rangeOut.end)).some((c) => c.start === rangeOut.start && c.end === rangeOut.end) : false;
    const cutoffs = await cutoffsWithAttendance().catch(() => []);

    return NextResponse.json({
      period: rangeOut,
      finalized,
      cutoffs,
      summaries,
      unmappedCount,
      enrolledCount,
      unregisteredIds,
      noScanDeliveries,
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
