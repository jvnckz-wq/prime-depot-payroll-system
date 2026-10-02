import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import {
  burnPasswordComparison, createSession, logSecurityEvent, reserveAttempt, verifyPassword,
} from '@/lib/server/security/auth';
import { isActiveChecker } from '@/lib/checker-accounts';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function sweepExpired() {
  await prisma.loginAttempt
    .deleteMany({ where: { firstAt: { lt: new Date(Date.now() - WINDOW_MS) } } })
    .catch(() => {});
}

export async function POST(request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400 });
    }

    const ip = clientIp(request);
    const key = `${ip}|${username}`;

    if (!(await reserveAttempt(key, { max: MAX_ATTEMPTS, windowMs: WINDOW_MS }))) {
      await logSecurityEvent('LOGIN_THROTTLED', { actorLabel: username, ip });
      return NextResponse.json(
        { error: 'Too many failed attempts. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { employee: { select: { status: true, position: true } } },
    });

    const reject = async () => {
      await logSecurityEvent('LOGIN_FAILURE', { actorId: user?.id ?? null, actorLabel: username, ip });
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    };

    if (!user || !user.isActive || (user.employeeId && !isActiveChecker(user.employee))) {
      await burnPasswordComparison(password);
      return reject();
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return reject();

    await prisma.loginAttempt.deleteMany({ where: { key } });
    await sweepExpired();

    if (user.totpEnabled) {
      await createSession(user.id, { pendingTwoFactor: true });
      await logSecurityEvent('LOGIN_2FA_PENDING', {
        actorId: user.id,
        actorLabel: user.username,
        ip,
        detail: 'Password accepted; waiting for the two-factor code.',
      });
      return NextResponse.json({ twoFactorRequired: true });
    }

    await createSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await logSecurityEvent('LOGIN_SUCCESS', {
      actorId: user.id,
      actorLabel: user.username,
      ip,
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
    console.error('POST /api/auth/login failed:', err);
    return NextResponse.json({ error: 'Could not sign in. Please try again.' }, { status: 500 });
  }
}
