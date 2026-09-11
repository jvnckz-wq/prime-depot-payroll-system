import { NextResponse } from 'next/server';
import { createHash, randomInt } from 'crypto';
import { prisma } from '../../../../../lib/prisma';
import { requireUser, validatePassword, verifyPassword } from '../../../../../lib/auth';
import { sendEmailVerificationCode } from '../../../../../lib/email';

// Step 1 of registering a recovery email: email a one-time code to the address
// the admin typed, so step 2 can prove the inbox is real and theirs before
// anything is saved. This is the ONLY way a recovery email is set or changed.
//
// Two callers:
//  * the admin's first-time gate, which also sets a new password (validated
//    here so we never email a code and then fail on the password, but NOT
//    changed until step 2);
//  * My Account, which changes the email alone. The current password is still
//    required, so a signed-in session on its own cannot redirect recovery.
//
// The caller is the authenticated admin, so unlike the logged-out "forgot"
// flow this returns real errors — there is no address to keep secret from the
// person setting it.
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per minute per account
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The code is hashed together with the target email, so a stored code only ever
// validates for the exact address it was sent to.
const hashFor = (code, email) => createHash('sha256').update(`${code}|${email}`).digest('hex');
const sixDigits = () => String(randomInt(100000, 1000000));

export async function POST(request) {
  // Allowed on a temporary password: the admin's gate replaces it here (the
  // mustChangePassword branch below makes the new password mandatory).
  const auth = await requireUser({ allowPasswordChange: true });
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

    const ok = await verifyPassword(currentPassword, record.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

    // A temporary password has to be replaced in the same step; otherwise the
    // new password is optional and only the email changes.
    const changingPassword = !!newPassword || record.mustChangePassword;
    if (changingPassword) {
      const problem = validatePassword(newPassword);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });

      if (await verifyPassword(newPassword, record.passwordHash)) {
        return NextResponse.json({ error: 'New password must be different from the current one.' }, { status: 400 });
      }
    }

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid recovery email address.' }, { status: 400 });
    }
    if (!changingPassword && email === record.email) {
      return NextResponse.json({ error: 'That is already your recovery email.' }, { status: 400 });
    }

    // Throttle sends, so a session and password cannot be used to flood an
    // inbox from the business mail account (and get it throttled by Gmail,
    // which would also stop password-reset emails).
    const recent = await prisma.passwordReset.findFirst({
      where: {
        userId: record.id, purpose: 'EMAIL_VERIFY', usedAt: null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
    });
    if (recent) {
      return NextResponse.json(
        { error: 'A code was sent less than a minute ago. Wait a moment, then try again.' },
        { status: 429 },
      );
    }

    // One live code at a time — clear any earlier unused one (also handles the
    // case where the admin used "Use a different email" and re-sent).
    await prisma.passwordReset.deleteMany({
      where: { userId: record.id, purpose: 'EMAIL_VERIFY', usedAt: null },
    });

    // Store the code before sending, so the cooldown above sees it as early as
    // possible; if the mailer is down, remove it again and tell the admin
    // rather than leave a code that can never arrive.
    const code = sixDigits();
    const row = await prisma.passwordReset.create({
      data: {
        userId: record.id,
        purpose: 'EMAIL_VERIFY',
        codeHash: hashFor(code, email),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    try {
      await sendEmailVerificationCode(email, code);
    } catch (mailErr) {
      console.error('Recovery email verification send failed:', mailErr);
      await prisma.passwordReset.deleteMany({ where: { id: row.id } });
      return NextResponse.json(
        { error: 'Could not send the code. Check the email settings and try again.' },
        { status: 502 },
      );
    }

    // The audit trail records the meaningful event (email changed, password
    // set) at the /complete step; the transient "code sent" is not logged.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/verify-email/start failed:', err);
    return NextResponse.json({ error: 'Could not start email verification.' }, { status: 500 });
  }
}
