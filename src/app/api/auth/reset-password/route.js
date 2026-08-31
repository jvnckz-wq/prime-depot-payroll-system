import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '../../../../lib/prisma';
import { destroyAllSessions, hashPassword, logSecurityEvent, validatePassword } from '../../../../lib/auth';

// Complete a password reset: username + emailed code + new password. On success
// the password is replaced, every existing session is destroyed (so anyone who
// knew the old password is locked out), and the code is spent.
const MAX_ATTEMPTS = 5;
const hashCode = (code) => createHash('sha256').update(code).digest('hex');

// One message for every failure mode — wrong code, expired, too many tries, no
// such account — so the endpoint never reveals which it was.
const INVALID = () => NextResponse.json(
  { error: 'That code is invalid or has expired. Request a new one and try again.' },
  { status: 400 },
);

export async function POST(request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!username || !code) return INVALID();

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive || user.role !== 'ADMIN') return INVALID();

    const reset = await prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset) return INVALID();

    // Expired, or too many wrong guesses — burn it so it cannot be tried again.
    if (reset.expiresAt < new Date() || reset.attempts >= MAX_ATTEMPTS) {
      await prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      return INVALID();
    }

    if (reset.codeHash !== hashCode(code)) {
      await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      return INVALID();
    }

    // Code is good — now the new password must clear the same policy the rest of
    // the app uses. This is checked only after the code, so password rules never
    // become an oracle for whether the code was right.
    const problem = validatePassword(newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
      }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    ]);

    // Sign out every device — if the reset was because someone else had the old
    // password, that person is now locked out.
    await destroyAllSessions(user.id);

    await logSecurityEvent('PASSWORD_RESET', {
      actorId: user.id, actorLabel: user.username,
      targetType: 'user', targetId: user.id,
      detail: 'Password reset completed via emailed code.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/reset-password failed:', err);
    return NextResponse.json({ error: 'Could not reset the password. Please try again.' }, { status: 500 });
  }
}
