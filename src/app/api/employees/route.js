// /api/employees: list employees (GET) and add a new one (POST).
import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { buildEmployeeData, shapeEmployee, shiftScheduleOps } from '@/lib/server/services/employees';
import { employeeIdError } from '@/lib/field-rules';
import { cutoffOf, todayYmdManila } from '@/lib/loan-rules';
import { withRetry } from '@/lib/server/db/db-retry';
import { finalizedCutoffsBetween } from '@/lib/server/services/cutoff-lock';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const rows = await prisma.employee.findMany({
      orderBy: { id: 'asc' },
      include: { account: { select: { username: true, isActive: true } }, shiftSchedules: true, _count: { select: { attendance: true, loans: true, payslips: true, drivenDeliveries: true, helper1Deliveries: true, helper2Deliveries: true } } },
    });
    return NextResponse.json({ employees: rows.map(shapeEmployee) });
  } catch (err) {
    console.error('GET /api/employees failed:', err);
    return NextResponse.json({ error: 'Could not load employees.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const idErr = employeeIdError(id);
    if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });

    const built = buildEmployeeData(body, { partial: false });
    if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

    if (await prisma.employee.findUnique({ where: { id } })) {
      return NextResponse.json({ error: `ID ${id} is already used by another employee.`, field: 'id' }, { status: 409 });
    }

    const employee = await prisma.employee.create({ data: { id, ...built.data } });
    const ops = shiftScheduleOps(prismaBase, null, employee, body, todayYmdManila());
    if (ops.length) await withRetry(() => prismaBase.$transaction(ops));
    const fresh = await prisma.employee.findUnique({ where: { id: employee.id }, include: { shiftSchedules: true } });
    const pullQueued = await queueCutoffPullFor(employee.id).catch((err) => { console.error('Could not queue a pull for the new employee:', err); return false; });
    const pendingScans = await unmappedScansFor(employee.id).catch((err) => { console.error('Could not check saved scans for the new employee:', err); return null; });
    return NextResponse.json({ employee: shapeEmployee(fresh || employee), pullQueued, pendingScans });
  } catch (err) {
    console.error('POST /api/employees failed:', err);
    return NextResponse.json({ error: 'Could not register the employee.' }, { status: 500 });
  }
}

// A new employee who is already enrolled on the device may have scans from
// earlier in this cutoff that live sync skipped. Queue a pull of the cutoff so
// the sync agent brings them in. Skipped when the device has not reported this
// ID, a pull is already waiting, or the cutoff is finalized.
async function queueCutoffPullFor(employeeId) {
  const sync = await prisma.deviceSync.findUnique({ where: { id: 'primary' }, select: { roster: true } });
  const roster = Array.isArray(sync?.roster) ? sync.roster : [];
  if (!roster.some((u) => String(u.userId) === String(employeeId))) return false;
  const today = todayYmdManila();
  const { start } = cutoffOf(today);
  if ((await finalizedCutoffsBetween(start, today)).length) return false;
  const waiting = await prisma.pullRequest.findFirst({ where: { status: { in: ['PENDING', 'RUNNING'] } }, select: { id: true } });
  if (waiting) return false;
  await prisma.pullRequest.create({
    data: { periodStart: new Date(`${start}T00:00:00.000Z`), periodEnd: new Date(`${today}T00:00:00.000Z`), status: 'PENDING' },
  });
  return true;
}

async function unmappedScansFor(employeeId) {
  const logs = await prisma.unmappedLog.findMany({
    where: { biometricId: String(employeeId), isResolved: false },
    select: { date: true },
  });
  if (!logs.length) return null;
  const byStart = new Map();
  for (const { date } of logs) {
    const c = cutoffOf(date.toISOString().slice(0, 10));
    const entry = byStart.get(c.start) || { ...c, days: 0 };
    entry.days += 1;
    byStart.set(c.start, entry);
  }
  const all = [...byStart.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
  const locked = new Set((await finalizedCutoffsBetween(all[0].start, all[all.length - 1].end)).map((c) => c.start));
  const open = all.filter((c) => !locked.has(c.start));
  if (!open.length) return null;
  return { days: open.reduce((n, c) => n + c.days, 0), cutoffs: open.map(({ start, end }) => ({ start, end })) };
}
