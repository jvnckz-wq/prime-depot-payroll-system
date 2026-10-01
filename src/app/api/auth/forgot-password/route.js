import { NextResponse } from 'next/server';
import { createHash, randomInt } from 'crypto';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { clientIp, logSecurityEvent, releaseAttempt, reserveAttempt } from '@/lib/server/security/auth';
import { sendPasswordResetCode } from '@/lib/server/integrations/email';
import { isEmail, maskEmail, normalizeEmail } from '@/lib/email-format';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAIL_TRIES = 5;
const MAX_IP_TRIES = 20;

const hashCode = (code) => createHash('sha256').update(code).digest('hex');
const sixDigits = () => String(randomInt(100000, 1000000));
const reply = (body, status = 200) => NextResponse.json(body, { status });
const TOO_MANY = () => reply({ error: 'Too many tries. Please wait 15 minutes and try again.' }, 429);

async function findAccount(username) {
  if (!username) return null;
  return prisma.user.findFirst({ where: { username, isActive: true } });
}

async function issueResetCode(user) {
  const recent = await prisma.passwordReset.findFirst({
    where: {
      userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
  });
  if (recent) return 'cooldown';

  const code = sixDigits();
  await withRetry(() => prismaBase.$transaction([
    prismaBase.passwordReset.deleteMany({ where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null } }),
    prismaBase.passwordReset.create({
      data: { userId: user.id, purpose: 'PASSWORD_RESET', codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    }),
  ]));

  try {
    await sendPasswordResetCode(user.email, code);
  } catch (err) {
    console.error('Password reset email could not be sent:', err);
    await prisma.passwordReset.deleteMany({ where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null } }).catch(() => {});
    return 'failed';
  }

  await logSecurityEvent('PASSWORD_RESET', {
    actorId: user.id, actorLabel: user.username,
    targetType: 'user', targetId: user.id,
    detail: 'Reset code requested and emailed.',
  });
  return 'sent';
}

export async function POST(request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!username) return reply({ error: 'Enter your username.' }, 400);

    const ip = (await clientIp().catch(() => null)) || 'unknown';
    if (!(await reserveAttempt(`forgot-ip|${ip}`, { max: MAX_IP_TRIES, windowMs: WINDOW_MS }))) return TOO_MANY();

    const user = await findAccount(username);
    if (!user) return reply({ error: 'We could not find an active account with that username.' }, 404);

    if (user.role !== 'ADMIN') {
      return reply({ next: 'ask-admin', message: 'Checker passwords are reset by the Operations Head. Ask them to reset yours in Settings, Accounts.' });
    }
    if (!user.email) {
      return reply({ next: 'no-email', message: 'This account has no recovery email on file, so it cannot be reset here. Contact the system administrator.' });
    }

    if (body.email === undefined) return reply({ next: 'email' });

    const email = normalizeEmail(body.email);
    if (!isEmail(email)) return reply({ error: 'Enter a valid email address, for example name@gmail.com.' }, 400);

    const key = `forgot-email|${user.id}`;
    if (!(await reserveAttempt(key, { max: MAX_EMAIL_TRIES, windowMs: WINDOW_MS }))) return TOO_MANY();

    if (email !== normalizeEmail(user.email)) {
      await logSecurityEvent('PASSWORD_RESET', {
        actorLabel: username, targetType: 'user', targetId: user.id,
        detail: 'Reset attempt with a recovery email that does not match.',
      });
      return reply({ error: 'That is not the recovery email for this account.' }, 400);
    }

    await releaseAttempt(key).catch(() => {});
    const result = await issueResetCode(user);
    if (result === 'failed') return reply({ error: 'The code could not be emailed right now. Please try again in a few minutes.' }, 502);

    const masked = maskEmail(user.email);
    return reply({
      next: 'code',
      message: result === 'cooldown'
        ? `A code was already sent to ${masked} less than a minute ago. Check that inbox, including Spam.`
        : `A 6-digit code was sent to ${masked}. It expires in 10 minutes.`,
    });
  } catch (err) {
    console.error('POST /api/auth/forgot-password failed:', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
