import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '../../../../lib/prisma';
import { withRetry } from '../../../../lib/db-retry';
import {
  completeTwoFactor, destroySession, getPendingTwoFactorLogin, logSecurityEvent,
} from '../../../../lib/auth';
import { hashBackupCode, totpStep } from '../../../../lib/twofactor';

// Second step of a two-factor login. The pending session (set by /login after a
// correct password) proves the password was right; here the code proves
// possession of the phone. A TOTP code is tried first, then the one-time backup
// codes. On success the pending session is replaced by a full one.
//
// Guessing is capped twice. Each pending session allows MAX_PER_SESSION codes,
// then it is deleted and the password has to be entered again. And because a
// correct password can open any number of pending sessions, the account as a
// whole allows MAX_PER_ACCOUNT wrong codes per window. Both counters are bumped
// BEFORE the code is checked, each in a single conditional statement, so a
// burst of parallel requests cannot all slip in under the limit.
const MAX_PER_SESSION = 5;
const MAX_PER_ACCOUNT = 10;
const WINDOW_MS = 15 * 60 * 1000;

// The account-wide tally shares the login_attempts table with /login. Login
// keys are "<ip>|<username>" and always contain a "|"; this one never does, so
// a forged IP header can never land a login failure in this bucket.
const accountKey = (userId) => `2fa:${userId}`;

/// Take one attempt from the account's allowance. False once it is used up.
async function reserveAccountAttempt(key) {
  const now = new Date();
  // A window that has run out starts over from zero.
  await prisma.loginAttempt.deleteMany({
    where: { key, firstAt: { lt: new Date(now.getTime() - WINDOW_MS) } },
  });
  // One upsert, so parallel requests each get back their own count.
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

    // A TOTP code is accepted once per time step: recording the step and
    // checking it is still newer than the last one is a single statement, so a
    // code that has already been used (or is being used right now in a
    // parallel request) is refused.
    const step = totpStep(entered, user.totpSecret);
    if (step !== null) {
      const { count } = await prisma.user.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      ok = count === 1;
    }

    if (!ok) {
      // Fall back to a one-time backup code. Removing it is one conditional
      // UPDATE, and only the affected-row count is trusted: two requests
      // spending the same code cannot both succeed, and two spending different
      // codes cannot write back a stale list that restores the other's code.
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

    // Hand back the attempt this correct code reserved, so only wrong codes
    // count against the account.
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
