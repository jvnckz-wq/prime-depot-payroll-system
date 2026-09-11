import { NextResponse, after } from 'next/server';
import { createHash, randomInt } from 'crypto';
import { prisma } from '../../../../lib/prisma';
import { logSecurityEvent } from '../../../../lib/auth';
import { sendPasswordResetCode } from '../../../../lib/email';

// Request a password-reset code by email. Operations Head only — Checkers do
// not self-reset; the admin resets their password directly.
//
// The response is ALWAYS the same, whether or not a matching account with that
// recovery email exists: same status, same body, and the same timing, because
// the work a real account needs (issuing the code, sending the email) runs
// after the response has gone out. Saying "no such account" would let anyone
// probe which address is registered, and that address is half of what the
// reset step asks for.
const CODE_TTL_MS = 10 * 60 * 1000;   // a code is valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per minute per account

const hashCode = (code) => createHash('sha256').update(code).digest('hex');
const sixDigits = () => String(randomInt(100000, 1000000));

// A gentle hint of where the code went — "c•••@g•••.com" — so the operator can
// confirm the destination without the full address ever being shown.
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  const parts = domain.split('.');
  const tld = parts.length > 1 ? '.' + parts.slice(1).join('.') : '';
  return `${(local[0] || '')}•••@${(parts[0][0] || '')}•••${tld}`;
}

const generic = (masked) => NextResponse.json({
  ok: true,
  message: masked
    ? `If ${masked} is the registered recovery email, a one-time code has been sent to it.`
    : 'If that account has a recovery email on file, a reset code has been sent to it.',
});

/// Everything a matching account needs. Runs after the response is sent, so it
/// must never throw — failures go to the server log only.
async function issueResetCode(user) {
  try {
    // Throttle resends: if an unused code was just issued, do not send another.
    const recent = await prisma.passwordReset.findFirst({
      where: {
        userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
    });
    if (recent) return;

    // One live code at a time — drop any earlier unused ones for this account.
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
    });

    const code = sixDigits();
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await sendPasswordResetCode(user.email, code);
    await logSecurityEvent('PASSWORD_RESET', {
      actorId: user.id, actorLabel: user.username,
      targetType: 'user', targetId: user.id,
      detail: 'Reset code requested and emailed.',
    });
  } catch (err) {
    // Email failed (or is not configured), or the database did. Log it for the
    // operator; the caller already has its answer.
    console.error('Password reset code could not be issued:', err);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return NextResponse.json({ error: 'Enter your recovery email.' }, { status: 400 });

    // Look the account up by its recovery email. Only the Operations Head keeps
    // one (Checkers have none and do not self-reset), so matching on email
    // naturally limits this to the admin. email is not unique in the schema, so
    // findFirst — with role + active enforced in the same query.
    const user = await prisma.user.findFirst({ where: { email, role: 'ADMIN', isActive: true } });
    if (user) after(() => issueResetCode(user));

    // Masking the address that was typed gives the same text on a hit and a
    // miss (on a hit it is the address on file), so the reply reveals nothing.
    return generic(maskEmail(email));
  } catch (err) {
    console.error('POST /api/auth/forgot-password failed:', err);
    return generic(null); // never leak internal errors here either
  }
}
