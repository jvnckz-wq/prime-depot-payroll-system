import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { buildEmployeeData, shapeEmployee } from '@/lib/server/services/employees';
import { accountAfterEmployeeChange } from '@/lib/checker-accounts';

/// PATCH /api/employees/:id — edit a record, or flip its Active/Inactive status.
///
/// The ID itself is never changed here. It is the key that attendance logs,
/// loans, and payslips all point at, so renaming it would orphan that history.
/// An edit that only carries { status } is how the list's Deactivate/Activate
/// button works — the same endpoint, a partial update of one field.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();

    const built = buildEmployeeData(body, { partial: true });
    if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
    if (!Object.keys(built.data).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const existing = await prisma.employee.findUnique({
      where: { id },
      include: { account: { select: { id: true, username: true, isActive: true } } },
    });
    if (!existing) return NextResponse.json({ error: `No employee found with ID ${id}.` }, { status: 404 });

    const { disable, rename } = accountAfterEmployeeChange(existing, built.data);
    const account = existing.account;
    const buildOps = () => {
      const ops = [prismaBase.employee.update({ where: { id }, data: built.data })];
      if (disable || rename) {
        ops.push(prismaBase.user.update({
          where: { id: account.id },
          data: { ...(disable ? { isActive: false } : {}), ...(rename ? { displayName: rename } : {}) },
        }));
      }
      if (disable) ops.push(prismaBase.session.deleteMany({ where: { userId: account.id } }));
      return ops;
    };

    const [employee] = await withRetry(() => prismaBase.$transaction(buildOps()));

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
