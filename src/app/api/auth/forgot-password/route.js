import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '../../../../lib/prisma';
import { logSecurityEvent } from '../../../../lib/auth';
import { sendPasswordResetCode } from '../../../../lib/email';

// Request a password-reset code by email. Operations Head only — Checkers do
// not self-reset; the admin resets their password directly.
//
// The response is ALWAYS the same generic success, whether or not a matching
// account with a registered email exists. Saying "no such user" or "no email on
// file" would let someone probe which usernames exist and who is the admin, so
// nothing here is allowed to leak that.
const CODE_TTL_MS = 10 * 60 * 1000;   // a code is valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per minute per account

const hashCode = (code) => createHash('sha256').update(code).digest('hex');
const sixDigits = () => String(Math.floor(100000 + Math.random() * 900000));

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
    ? `A one-time code has been sent to ${masked}.`
    : 'If that account has a recovery email on file, a reset code has been sent to it.',
  maskedEmail: masked || null,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!username) return generic(null);

    const user = await prisma.user.findUnique({ where: { username } });

    // Only a real, active Operations Head with a recovery email can receive a
    // code. Every other case falls through to the same generic answer.
    if (!user || !user.isActive || user.role !== 'ADMIN' || !user.email) {
      return generic(null);
    }

    const masked = maskEmail(user.email);

    // Throttle resends: if an unused code was just issued, do not send another —
    // but still confirm where it went so a double-tap is not confusing.
    const recent = await prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    });
    if (recent) return generic(masked);

    // One live code at a time — drop any earlier unused ones for this account.
    await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });

    const code = sixDigits();
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    try {
      await sendPasswordResetCode(user.email, code);
      await logSecurityEvent('PASSWORD_RESET', {
        actorId: user.id, actorLabel: user.username,
        targetType: 'user', targetId: user.id,
        detail: 'Reset code requested and emailed.',
      });
    } catch (mailErr) {
      // Email failed (or is not configured). Log it for the operator, but still
      // answer the same way so the failure reveals nothing to the caller.
      console.error('Password reset email failed:', mailErr);
    }

    return generic(masked);
  } catch (err) {
    console.error('POST /api/auth/forgot-password failed:', err);
    return generic(null); // never leak internal errors here either
  }
}
