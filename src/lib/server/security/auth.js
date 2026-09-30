import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma';

const COOKIE_NAME = 'pd_session';
const SESSION_DAYS = 7;
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

const ABSENT_USER_HASH = '$2b$12$au9eIrtb8olxzU8/t9GBHOdIMc1dgBzsN8Zp67AtsRi8PeYhRfvbC';

export function burnPasswordComparison(plain) {
  return bcrypt.compare(typeof plain === 'string' ? plain : '', ABSENT_USER_HASH);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId, { pendingTwoFactor = false } = {}) {
  const jar = await cookies();

  const previous = jar.get(COOKIE_NAME)?.value;
  if (previous) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(previous) } });
  }

  const token = randomBytes(32).toString('hex');
  const ttlMs = pendingTwoFactor ? 10 * 60 * 1000 : SESSION_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, pendingTwoFactor },
  });

  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(COOKIE_NAME);
}

export async function destroyAllSessions(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt < new Date() || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (session.pendingTwoFactor) return null;

  const { id, username, displayName, avatar, role, mustChangePassword, totpEnabled } = session.user;
  return { id, username, displayName, avatar, role, mustChangePassword, totpEnabled };
}

export async function getPendingTwoFactorLogin() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || !session.user.isActive || !session.pendingTwoFactor) {
    return null;
  }
  return { sessionId: session.id, user: session.user };
}

export async function completeTwoFactor(sessionId, userId) {
  const { count } = await prisma.session.deleteMany({
    where: { id: sessionId, pendingTwoFactor: true },
  });
  if (count !== 1) return false;
  await createSession(userId);
  return true;
}

export async function requireUser({ allowPasswordChange = false } = {}) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not signed in.', status: 401 };
  if (user.mustChangePassword && !allowPasswordChange) {
    return { error: 'You must change your password first.', status: 403 };
  }
  return { user };
}

export async function requireAdmin() {
  const result = await requireUser();
  if (result.error) return result;
  if (result.user.role !== 'ADMIN') {
    return { error: 'This action is restricted to the Operations Head.', status: 403 };
  }
  if (!result.user.totpEnabled) {
    return { error: 'Set up two-factor login to continue.', status: 403 };
  }
  return result;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain a lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain an uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain a number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain a symbol (e.g. ! # @ ? ^ *).';
  }
  return null;
}

export async function clientIp() {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || 'unknown';
}

export async function logSecurityEvent(action, details = {}) {
  try {
    const { actorId = null, actorLabel = null, targetType = null, targetId = null, detail = null } = details;
    await prisma.auditLog.create({
      data: {
        action,
        actorId,
        actorLabel: actorLabel ? String(actorLabel).slice(0, 200) : null,
        targetType,
        targetId: targetId ? String(targetId).slice(0, 200) : null,
        detail: detail ? String(detail).slice(0, 500) : null,
        ip: details.ip ?? (await clientIp().catch(() => null)),
      },
    });
  } catch (err) {
    console.error('Audit log write failed:', action, err);
  }
}

export async function reserveAttempt(key, { max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const now = new Date();
  await prisma.loginAttempt.deleteMany({
    where: { key, firstAt: { lt: new Date(now.getTime() - windowMs) } },
  });
  const { count } = await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, count: 1, firstAt: now, lastAt: now },
    update: { count: { increment: 1 }, lastAt: now },
  });
  return count <= max;
}

export async function releaseAttempt(key) {
  await prisma.loginAttempt.updateMany({
    where: { key, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}
