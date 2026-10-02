import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import {
  completeTwoFactor, destroySession, getPendingTwoFactorLogin, logSecurityEvent,
} from '@/lib/server/security/auth';
import { hashBackupCode, totpStep } from '@/lib/server/security/twofactor';

const MAX_PER_SESSION = 5;
const MAX_PER_ACCOUNT = 10;
const WINDOW_MS = 15 * 60 * 1000;

const accountKey = (userId) => `2fa:${userId}`;

async function reserveAccountAttempt(key) {
  const now = new Date();
  await prisma.loginAttempt.deleteMany({
    where: { key, firstAt: { lt: new Date(now.getTime() - WINDOW_MS) } },
  });
  const { count } = await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, count: 1, firstAt: now, lastAt: now },
    update: { count: { increment: 1 }, lastAt: now },
  });
  return count <= MAX_PER_ACCOUNT;
}

const tooMany = (error) => NextResponse.json({ error }, { status: 429 });

export async function POST(request) {
  try {
    const pending = await getPendingTwoFactorLogin();
    if (!pending) {
      return NextResponse.json({ error: 'Your sign-in expired. Please start again.' }, { status: 401 });
    }
    const { user, sessionId } = pending;

    const { code } = await request.json();
    const entered = typeof code === 'string' ? code.trim() : '';
    if (!entered) return NextResponse.json({ error: 'Enter your authentication code.' }, { status: 400 });

    const key = accountKey(user.id);
    if (!(await reserveAccountAttempt(key))) {
      await destroySession();
      await logSecurityEvent('LOGIN_THROTTLED', {
        actorId: user.id, actorLabel: user.username,
        detail: 'Too many two-factor codes tried; two-factor sign-in paused for 15 minutes.',
      });
      return tooMany('Too many incorrect codes. Please wait 15 minutes, then sign in again.');
    }

    const { count: allowed } = await prisma.session.updateMany({
      where: { id: sessionId, pendingTwoFactor: true, twoFactorAttempts: { lt: MAX_PER_SESSION } },
      data: { twoFactorAttempts: { increment: 1 } },
    });
    if (allowed === 0) {
      await destroySession();
      return tooMany('Too many incorrect codes. Please sign in again.');
    }

    let ok = false;
    let usedBackup = false;

    const step = totpStep(entered, user.totpSecret);
    if (step !== null) {
      const { count } = await prisma.user.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      ok = count === 1;
    }

    if (!ok) {
      const h = hashBackupCode(entered);
      const removed = await withRetry(() => prismaBase.$executeRaw`
        UPDATE "users" SET "backupCodes" = array_remove("backupCodes", ${h})
        WHERE "id" = ${user.id} AND ${h} = ANY("backupCodes")`);
      if (removed === 1) {
        ok = true;
        usedBackup = true;
      }
    }

    if (!ok) {
      await logSecurityEvent('LOGIN_2FA_FAILURE', {
        actorId: user.id, actorLabel: user.username,
        detail: 'Wrong two-factor code entered.',
      });
      return NextResponse.json(
        { error: 'That code did not match. Try again, or use a backup code.' },
        { status: 400 },
      );
    }

    await prisma.loginAttempt.updateMany({
      where: { key, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });

    if (!(await completeTwoFactor(sessionId, user.id))) {
      return NextResponse.json({ error: 'Your sign-in expired. Please start again.' }, { status: 401 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await logSecurityEvent('LOGIN_SUCCESS', {
      actorId: user.id,
      actorLabel: user.username,
      detail: usedBackup ? 'Signed in with a backup code.' : 'Signed in with a two-factor code.',
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        email: user.email,
        totpEnabled: user.totpEnabled,
      },
    });
  } catch (err) {
    console.error('POST /api/auth/2fa failed:', err);
    return NextResponse.json({ error: 'Could not verify the code.' }, { status: 500 });
  }
}
