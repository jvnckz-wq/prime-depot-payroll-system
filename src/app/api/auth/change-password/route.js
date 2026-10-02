import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import {
  createSession, destroyAllSessions, hashPassword, logSecurityEvent,
  releaseAttempt, requireUser, reserveAttempt, validatePassword, verifyPassword,
} from '@/lib/server/security/auth';
import { totpStep } from '@/lib/server/security/twofactor';

export async function POST(request) {
  const auth = await requireUser({ allowPasswordChange: true });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { currentPassword, newPassword, code } = await request.json();

    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!record) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    const ok = await verifyPassword(currentPassword ?? '', record.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

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
