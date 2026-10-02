import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/server/db/prisma';
import { hashPassword, logSecurityEvent, requireAdmin } from '@/lib/server/security/auth';
import { POSITION_LABEL } from '@/lib/server/services/employees';
import { checkerLinkProblem } from '@/lib/checker-accounts';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [users, checkers] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      select: {
        id: true, username: true, displayName: true, role: true,
        isActive: true, mustChangePassword: true, lastLoginAt: true, createdAt: true,
        employee: { select: { id: true, name: true, position: true, status: true } },
      },
    }),
    prisma.employee.findMany({
      where: { position: 'CHECKER', status: 'ACTIVE', account: { is: null } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({
    users: users.map(({ employee, ...u }) => ({
      ...u,
      employee: employee
        ? { id: employee.id, name: employee.name, position: POSITION_LABEL[employee.position] ?? employee.position, active: employee.status === 'ACTIVE' }
        : null,
    })),
    availableCheckers: checkers,
  });
}

function generateTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) =>
    Array.from(randomBytes(n)).map((b) => set[b % set.length]).join('');
  return `pd-${pick(letters, 4)}${pick(digits, 4)}`;
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const employeeId = typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (body.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Only Checker accounts can be created. There is one Operations Head by design.' },
        { status: 400 },
      );
    }
    const role = 'CHECKER';

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3–32 characters: lowercase letters, numbers, dot, dash, or underscore.' },
        { status: 400 }
      );
    }
    const employee = employeeId
      ? await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, name: true, status: true, position: true, account: { select: { id: true, username: true } } },
      })
      : null;
    const problem = checkerLinkProblem(employee);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: `Username "${username}" is already taken.` }, { status: 409 });
    }

    const tempPassword = generateTempPassword();
    const user = await prisma.user.create({
      data: {
        username,
        displayName: employee.name,
        role,
        employeeId: employee.id,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });

    await logSecurityEvent('ACCOUNT_CREATED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'user',
      targetId: user.id,
      detail: `Created ${user.role} account "${user.username}" for employee ${employee.id} (${employee.name}).`,
    });

    return NextResponse.json({ user, tempPassword });
  } catch (err) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'That checker or username was just taken. Refresh and try again.' }, { status: 409 });
    }
    console.error('POST /api/users failed:', err);
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
