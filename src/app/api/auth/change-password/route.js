import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import {
  createSession, destroyAllSessions, hashPassword, logSecurityEvent,
  releaseAttempt, requireUser, reserveAttempt, validatePassword, verifyPassword,
} from '../../../../lib/auth';
import { totpStep } from '../../../../lib/twofactor';

// Changing your own password. Available to both roles — this is the one
// account action a Checker can perform. The admin's first-time change also
// registers a verified recovery email, but that runs through the dedicated
// verify-email endpoints, not here, so this stays password-only.
export async function POST(request) {
  // Allowed on a temporary password: this is how a Checker replaces it.
  const auth = await requireUser({ allowPasswordChange: true });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { currentPassword, newPassword, code } = await request.json();

    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!record) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    // Proving the current password matters even though the user is already
    // signed in: it stops someone who walks up to an unattended, logged-in
    // machine from locking the real owner out of their own account.
    const ok = await verifyPassword(currentPassword ?? '', record.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

    // If two-factor is on for this account, the password alone is not enough:
    // a current authenticator code is required too, so someone at an unattended
    // signed-in machine still cannot change the password. This never fires on
    // the first-time forced change (two-factor is set up only afterwards, so
    // totpEnabled is false then), which keeps that flow working. Wrong codes are
    // rate-limited fail-closed, and an accepted code's time step is recorded so
    // it cannot be replayed at the sign-in prompt.
    if (record.totpEnabled) {
      const key = `chpwd:${record.id}`;
      if (!(await reserveAttempt(key))) {
        return NextResponse.json(
          { error: 'Too many incorrect codes. Please wait 15 minutes and try again.' },
          { status: 429 },
        );
      }
      const entered = typeof code === 'string' ? code.trim() : '';
      let codeOk = false;
      const step = totpStep(entered, record.totpSecret);
      if (step !== null) {
        const { count } = await prisma.user.updateMany({
          where: { id: record.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
          data: { totpLastStep: step },
        });
        codeOk = count === 1;
      }
      if (!codeOk) {
        return NextResponse.json(
          { error: 'That authentication code did not match. Check your authenticator app and try again.' },
          { status: 400 },
        );
      }
      await releaseAttempt(key);
    }

    const problem = validatePassword(newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (await verifyPassword(newPassword, record.passwordHash)) {
      return NextResponse.json({ error: 'New password must be different from the current one.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: record.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });

    // Sign out every other device, then re-issue a session for this one. If the
    // password is being changed because someone else knew it, that person is
    // now locked out.
    await destroyAllSessions(record.id);
    await createSession(record.id);

    await logSecurityEvent('PASSWORD_CHANGED', {
      actorId: record.id,
      actorLabel: record.username,
      targetType: 'user',
      targetId: record.id,
      detail: 'Changed their own password; all other sessions signed out.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/change-password failed:', err);
    return NextResponse.json({ error: 'Could not change password.' }, { status: 500 });
  }
}
