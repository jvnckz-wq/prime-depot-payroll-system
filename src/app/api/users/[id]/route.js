import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/server/db/prisma';
import { destroyAllSessions, hashPassword, logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { checkerLinkProblem, isActiveChecker } from '@/lib/checker-accounts';

function generateTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) =>
    Array.from(randomBytes(n)).map((b) => set[b % set.length]).join('');
  return `pd-${pick(letters, 4)}${pick(digits, 4)}`;
}

/// PATCH /api/users/:id — { action: 'disable' | 'enable' | 'reset-password' | 'link', employeeId? }
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  try {
    const { action, employeeId } = await request.json();

    const target = await prisma.user.findUnique({
      where: { id },
      include: { employee: { select: { name: true, status: true, position: true } } },
    });
    if (!target) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    if (action === 'disable') {
      // Locking yourself out would leave the system with no way back in, since
      // only an admin can re-enable an account.
      if (target.id === auth.user.id) {
        return NextResponse.json({ error: 'You cannot disable your own account.' }, { status: 400 });
      }
      // The same guard for the last remaining admin.
      if (target.role === 'ADMIN') {
        const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (activeAdmins <= 1) {
          return NextResponse.json({ error: 'At least one active Operations Head account must remain.' }, { status: 400 });
        }
      }

      await prisma.user.update({ where: { id }, data: { isActive: false } });
      // Disabling has to take effect now, not at the next expiry — so every
      // session this account holds is destroyed immediately.
      await destroyAllSessions(id);

      await logSecurityEvent('ACCOUNT_DISABLED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'user',
        targetId: id,
        detail: `Disabled "${target.username}" and revoked its sessions.`,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'enable') {
      if (target.employeeId && !isActiveChecker(target.employee)) {
        const who = target.employee?.name ?? 'The linked employee';
        return NextResponse.json(
          { error: `${who} is no longer an active Checker, so this account cannot be enabled.` },
          { status: 400 },
        );
      }
      await prisma.user.update({ where: { id }, data: { isActive: true } });

      await logSecurityEvent('ACCOUNT_ENABLED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'user',
        targetId: id,
        detail: `Re-enabled "${target.username}".`,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'reset-password') {
      const tempPassword = generateTempPassword();
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
      });
      // Any session opened with the old password stops working.
      await destroyAllSessions(id);

      await logSecurityEvent('PASSWORD_RESET', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'user',
        targetId: id,
        // The temporary password itself is deliberately NOT recorded. An audit
        // trail that contains working credentials is a second place to steal
        // them from.
        detail: `Issued a temporary password for "${target.username}" and revoked its sessions.`,
      });

      return NextResponse.json({ ok: true, tempPassword });
    }

    if (action === 'link') {
      if (target.role !== 'CHECKER') {
        return NextResponse.json({ error: 'Only Checker accounts are linked to an employee.' }, { status: 400 });
      }
      if (target.employeeId) {
        return NextResponse.json({ error: 'This account is already linked to an employee.' }, { status: 400 });
      }
      const empId = typeof employeeId === 'string' ? employeeId.trim() : '';
      const employee = empId
        ? await prisma.employee.findUnique({
          where: { id: empId },
          select: { id: true, name: true, status: true, position: true, account: { select: { id: true, username: true } } },
        })
        : null;
      const problem = checkerLinkProblem(employee);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });

      await prisma.user.update({ where: { id }, data: { employeeId: employee.id, displayName: employee.name } });

      await logSecurityEvent('ACCOUNT_LINKED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'user',
        targetId: id,
        detail: `Linked "${target.username}" to employee ${employee.id} (${employee.name}).`,
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'That checker was just linked to another account. Refresh and try again.' }, { status: 409 });
    }
    console.error('PATCH /api/users/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the account.' }, { status: 500 });
  }
}
