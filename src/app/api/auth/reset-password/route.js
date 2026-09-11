import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '../../../../lib/prisma';
import { destroyAllSessions, hashPassword, logSecurityEvent, validatePassword } from '../../../../lib/auth';

// Complete a password reset: recovery email + emailed code + new password. On success
// the password is replaced, every existing session is destroyed (so anyone who
// knew the old password is locked out), and the code is spent.
const MAX_ATTEMPTS = 5;
const CODE_RE = /^\d{6}$/;
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
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    // Reset codes are always six digits. Refusing anything else up front also
    // keeps a recovery-email confirmation code (hashed as "<code>|<email>")
    // from ever being accepted here.
    if (!email || !CODE_RE.test(code)) return INVALID();

    // Same email-based lookup as the request step, so the two stages agree on
    // which account is being reset. Not unique in the schema, hence findFirst.
    const user = await prisma.user.findFirst({ where: { email, role: 'ADMIN', isActive: true } });
    if (!user) return INVALID();

    const reset = await prisma.passwordReset.findFirst({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset) return INVALID();

    // Count the guess BEFORE comparing it, in one conditional statement that
    // also refuses a code that is spent, expired or out of tries. Reading the
    // counter and incrementing it separately would let a burst of parallel
    // requests all see "under the limit" and each get a guess.
    const { count: allowed } = await prisma.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    if (allowed === 0) return INVALID();

    if (reset.codeHash !== hashCode(code)) return INVALID();

    // Code is good — now the new password must clear the same policy the rest of
    // the app uses. This is checked only after the code, so password rules never
    // become an oracle for whether the code was right.
    const problem = validatePassword(newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const newHash = await hashPassword(newPassword);

    // Spend the code first, and go on only if this request is the one that
    // spent it — two parallel requests with the right code cannot both reset.
    const { count: claimed } = await prisma.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed !== 1) return INVALID();

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

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
