import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { buildEmployeeData, shapeEmployee, shiftScheduleOps } from '@/lib/server/services/employees';
import { accountAfterEmployeeChange } from '@/lib/checker-accounts';
import { employeeIdError } from '@/lib/field-rules';
import { todayYmdManila } from '@/lib/loan-rules';
import { hasNoEarlyShift } from '@/lib/positions';

const ID_LOCKED = 'This ID can no longer be changed because the employee already has attendance, payroll, deliveries, loans or a linked account. Deactivate and register again if the ID is wrong.';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();

    const newId = typeof body.newId === 'string' ? body.newId.trim() : '';
    const changingId = !!newId && newId !== id;
    if (changingId) {
      const idErr = employeeIdError(newId);
      if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });
      const taken = await prisma.employee.findUnique({ where: { id: newId }, select: { id: true } });
      if (taken) return NextResponse.json({ error: `ID ${newId} is already used by another employee.`, field: 'id' }, { status: 409 });
    }

    const built = buildEmployeeData(body, { partial: true });
    if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
    if (!Object.keys(built.data).length && !changingId) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const existing = await prisma.employee.findUnique({
      where: { id },
      include: { shiftSchedules: true, account: { select: { id: true, username: true, isActive: true } }, _count: { select: { attendance: true, loans: true, payslips: true, drivenDeliveries: true, helper1Deliveries: true, helper2Deliveries: true } } },
    });
    if (!existing) return NextResponse.json({ error: `No employee found with ID ${id}.` }, { status: 404 });
    if (hasNoEarlyShift(built.data.position || existing.position) && 'earlyShiftDays' in built.data) built.data.earlyShiftDays = [];
    if (changingId && (existing.account || Object.values(existing._count).some((n) => n > 0))) {
      return NextResponse.json({ error: ID_LOCKED, field: 'id' }, { status: 409 });
    }

    const { disable, rename } = accountAfterEmployeeChange(existing, built.data);
    const account = existing.account;
    const buildOps = () => {
      const ops = changingId
        ? [
          prismaBase.$executeRaw`UPDATE "employees" SET "id" = ${newId} WHERE "id" = ${id}
            AND NOT EXISTS (SELECT 1 FROM "attendance" WHERE "employeeId" = ${id})
            AND NOT EXISTS (SELECT 1 FROM "payslips" WHERE "employeeId" = ${id})
            AND NOT EXISTS (SELECT 1 FROM "loans" WHERE "employeeId" = ${id})
            AND NOT EXISTS (SELECT 1 FROM "deliveries" WHERE "driverId" = ${id} OR "helper1Id" = ${id} OR "helper2Id" = ${id})
            AND NOT EXISTS (SELECT 1 FROM "users" WHERE "employeeId" = ${id})`,
          Object.keys(built.data).length
            ? prismaBase.employee.update({ where: { id: newId }, data: built.data })
            : prismaBase.employee.findUniqueOrThrow({ where: { id: newId } }),
        ]
        : [prismaBase.employee.update({ where: { id }, data: built.data })];
      if (disable || rename) {
        ops.push(prismaBase.user.update({
          where: { id: account.id },
          data: { ...(disable ? { isActive: false } : {}), ...(rename ? { displayName: rename } : {}) },
        }));
      }
      if (disable) ops.push(prismaBase.session.deleteMany({ where: { userId: account.id } }));
      return ops;
    };

    let results;
    try {
      results = await withRetry(() => prismaBase.$transaction(buildOps()));
    } catch (err) {
      if (changingId && (err?.code === 'P2025' || err?.code === 'P2002')) {
        return NextResponse.json({ error: err.code === 'P2002' ? `ID ${newId} is already used by another employee.` : ID_LOCKED, field: 'id' }, { status: 409 });
      }
      throw err;
    }
    const employee = changingId ? results[1] : results[0];
    const schedOps = shiftScheduleOps(prismaBase, existing, employee, body, todayYmdManila());
    if (schedOps.length) await withRetry(() => prismaBase.$transaction(schedOps));

    if (disable) {
      await logSecurityEvent('ACCOUNT_DISABLED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'user',
        targetId: account.id,
        detail: `Disabled "${account.username}" because ${employee.name} (${id}) is no longer an active Checker.`,
      });
    }

    return NextResponse.json({
      employee: shapeEmployee(employee),
      accountDisabled: disable ? account.username : null,
    });
  } catch (err) {
    console.error('PATCH /api/employees/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the employee.' }, { status: 500 });
  }
}
