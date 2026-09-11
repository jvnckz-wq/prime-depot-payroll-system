import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '../../../../../lib/prisma';
import {
  createSession, destroyAllSessions, hashPassword, logSecurityEvent,
  requireUser, validatePassword, verifyPassword,
} from '../../../../../lib/auth';

// Step 2 of registering a recovery email. The email (and, from the first-time
// gate, the new password) is saved ONLY here, and only once the emailed code
// matches the address it was sent to. A mistyped or fake address can never be
// registered because it could not have received the code.
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

// Must match verify-email/start: the address is bound into the hash, so a code
// only validates for the exact email it was sent to.
const hashFor = (code, email) => createHash('sha256').update(`${code}|${email}`).digest('hex');

export async function POST(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!record) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    if (record.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only the Operations Head registers a recovery email.' }, { status: 403 });
    }

    const body = await request.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    // Re-check the password on this final call too, since the client re-sends it
    // between the two steps rather than the server holding it.
    const ok = await verifyPassword(currentPassword, record.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

    // Same rule as /start: a temporary password must be replaced here; otherwise
    // only the email changes.
    const changingPassword = !!newPassword || record.mustChangePassword;
    if (changingPassword) {
      const problem = validatePassword(newPassword);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid recovery email address.' }, { status: 400 });
    }
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit code sent to your email.' }, { status: 400 });
    }

    const pending = await prisma.passwordReset.findFirst({
      where: { userId: record.id, purpose: 'EMAIL_VERIFY', usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) {
      return NextResponse.json({ error: 'No pending code. Send a new one and try again.' }, { status: 400 });
    }

    // Count the attempt BEFORE comparing, in one conditional statement that
    // also refuses a spent, expired or exhausted code, so parallel requests
    // cannot each get a guess past the limit.
    const { count: allowed } = await prisma.passwordReset.updateMany({
      where: { id: pending.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS }, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    if (allowed === 0) {
      return NextResponse.json({ error: 'That code has expired. Send a new one and try again.' }, { status: 400 });
    }

    // Wrong code (or right code but a different email than it was issued for):
    // the email-bound hash will not match.
    if (pending.codeHash !== hashFor(code, email)) {
      return NextResponse.json({ error: 'That code did not match. Try again.' }, { status: 400 });
    }

    const newHash = changingPassword ? await hashPassword(newPassword) : null;

    // Spend the code first, and go on only if this request is the one that
    // spent it.
    const { count: claimed } = await prisma.passwordReset.updateMany({
      where: { id: pending.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed !== 1) {
      return NextResponse.json({ error: 'That code has already been used. Send a new one.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: record.id },
      data: changingPassword
        ? { passwordHash: newHash, email, mustChangePassword: false }
        : { email },
    });

    if (changingPassword) {
      // Sign out every other device, then re-issue this one so the admin stays in.
      await destroyAllSessions(record.id);
      await createSession(record.id);

      await logSecurityEvent('PASSWORD_CHANGED', {
        actorId: record.id, actorLabel: record.username,
        targetType: 'user', targetId: record.id,
        detail: 'First-time setup: password set and recovery email verified and registered.',
      });
    }

    if (email !== record.email) {
      await logSecurityEvent('RECOVERY_EMAIL_CHANGED', {
        actorId: record.id, actorLabel: record.username,
        targetType: 'user', targetId: record.id,
        detail: record.email
          ? 'Recovery email replaced after the new address was verified.'
          : 'Recovery email registered after the address was verified.',
      });
    }

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error('POST /api/auth/verify-email/complete failed:', err);
    return NextResponse.json({ error: 'Could not complete email verification.' }, { status: 500 });
  }
}
