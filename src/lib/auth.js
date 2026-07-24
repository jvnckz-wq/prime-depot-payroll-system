// Authentication helpers. SERVER-ONLY — importing this from a 'use client'
// component would ship password logic and the database connection to the
// browser.
//
// Design notes:
//
//  * Passwords are stored as bcrypt hashes, never as text. Hashing is one-way:
//    we can check whether a submitted password produces the same hash, but
//    nobody — including the admin, including us — can read the original back
//    out of the database.
//
//  * Sessions live in the database rather than in a signed token, because they
//    must be revocable. When the admin disables an account, that person has to
//    lose access on their very next click, not whenever a token expires.
//
//  * The cookie carries a random token; the database stores only its SHA-256
//    hash. Same principle as passwords: a leaked database gives an attacker
//    hashes, not usable sessions.
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const COOKIE_NAME = 'pd_session';
const SESSION_DAYS = 7;
// Cost factor 12: deliberately slow. A legitimate login spends a few hundred
// milliseconds, which nobody notices; an attacker trying millions of guesses
// against a stolen database pays that cost on every single attempt.
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/// Issues a session and sets the cookie. Returns nothing useful on purpose —
/// callers should not be passing the raw token around.
export async function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    // httpOnly keeps the cookie out of reach of JavaScript, so a script
    // injected into the page cannot read the session and impersonate the user.
    httpOnly: true,
    // Only sent over HTTPS in production.
    secure: process.env.NODE_ENV === 'production',
    // Blocks the cookie from being attached to requests originating on other
    // sites, which is what makes cross-site request forgery work.
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

/// Revokes every session belonging to a user. Used when an account is disabled
/// or its password changes — a password change should log out anyone else who
/// was already signed in as that account.
export async function destroyAllSessions(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

/// Returns the signed-in user, or null. Every API route that touches real data
/// starts here.
export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  // Expired, or the account was disabled after the session was issued.
  if (session.expiresAt < new Date() || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const { id, username, displayName, avatar, role, mustChangePassword } = session.user;
  return { id, username, displayName, avatar, role, mustChangePassword };
}

/// Guards for API routes. Each returns { user } on success or { error, status }
/// on failure, so a route can bail out in two lines.
///
/// This is the server-side half of access control. Hiding a page in the UI is
/// not protection — without these checks, anyone could call the endpoint
/// directly and read whatever it returns.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not signed in.', status: 401 };
  return { user };
}

export async function requireAdmin() {
  const result = await requireUser();
  if (result.error) return result;
  if (result.user.role !== 'ADMIN') {
    return { error: 'This action is restricted to the Operations Head.', status: 403 };
  }
  return result;
}

/// Minimum password rules. Kept modest on purpose: rules so strict that people
/// write passwords on sticky notes make a system less safe, not more.
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain both letters and numbers.';
  }
  return null;
}
