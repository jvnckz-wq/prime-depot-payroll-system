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
import 'server-only';
import { cookies, headers } from 'next/headers';
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

// A real bcrypt hash, at the same cost factor, of a value no account uses.
//
// It exists to make a failed login take the same time whether or not the
// username is real. Returning early for an unknown username skips the ~250ms
// bcrypt comparison, and that gap is easily measurable over the network: an
// attacker times a few hundred requests and learns exactly which usernames
// exist, which is the enumeration the single shared error message was written
// to prevent. Burning the same work on both paths closes it.
const ABSENT_USER_HASH = '$2b$12$au9eIrtb8olxzU8/t9GBHOdIMc1dgBzsN8Zp67AtsRi8PeYhRfvbC';

/// Spend the same time a real password check would, and discard the result.
export function burnPasswordComparison(plain) {
  return bcrypt.compare(typeof plain === 'string' ? plain : '', ABSENT_USER_HASH);
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/// Issues a session and sets the cookie. Returns nothing useful on purpose —
/// callers should not be passing the raw token around.
export async function createSession(userId, { pendingTwoFactor = false } = {}) {
  const jar = await cookies();

  // Drop whatever session this browser already holds before issuing a new one,
  // so signing in again (or finishing 2FA) never leaves the old token working
  // alongside the new one.
  const previous = jar.get(COOKIE_NAME)?.value;
  if (previous) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(previous) } });
  }

  const token = randomBytes(32).toString('hex');
  // A pending-2FA session is deliberately short-lived: it only has to survive
  // the few minutes between the password and the code, so it is not a long
  // brute-force window if left open.
  const ttlMs = pendingTwoFactor ? 10 * 60 * 1000 : SESSION_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, pendingTwoFactor },
  });

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

  // Password was correct but the required 2FA code has not been entered yet, so
  // this session grants no access anywhere except the /api/auth/2fa endpoint
  // (which reads it through getPendingTwoFactorLogin instead).
  if (session.pendingTwoFactor) return null;

  const { id, username, displayName, avatar, role, mustChangePassword, totpEnabled } = session.user;
  return { id, username, displayName, avatar, role, mustChangePassword, totpEnabled };
}

/// Read the user behind a still-pending 2FA login. Returns { sessionId, user }
/// (the full user record, so the caller can check the TOTP secret and backup
/// codes) or null. Only /api/auth/2fa uses this — everywhere else a pending
/// session is treated as signed out.
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

/// Finish a two-factor login once the code checks out: spend the pending
/// session and issue a brand-new full one in its place. A fresh token, rather
/// than upgrading the pending one, means the token handed out before the code
/// was checked never becomes a full session, and the cookie gets the full
/// lifetime instead of keeping the pending session's ten minutes.
///
/// Returns false if the pending session was already spent or removed, so two
/// racing requests cannot both turn one pending session into a login.
export async function completeTwoFactor(sessionId, userId) {
  const { count } = await prisma.session.deleteMany({
    where: { id: sessionId, pendingTwoFactor: true },
  });
  if (count !== 1) return false;
  await createSession(userId);
  return true;
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
  // The Operations Head must have two-factor on before any admin data or action
  // is reachable. The setup screen enforces this in the browser; this is the
  // check that actually holds. Enrollment itself (2fa/setup, 2fa/enable) and
  // the first-time password and email steps go through requireUser, so they
  // still work before this is satisfied.
  if (!result.user.totpEnabled) {
    return { error: 'Set up two-factor login to continue.', status: 403 };
  }
  return result;
}

/// Password strength rules, enforced authoritatively on the server so the
/// client-side meter can never be bypassed by calling the API directly. Login
/// does NOT run through this (existing passwords keep working); it applies only
/// when a new password is being SET (change-password). Temporary passwords are
/// machine-generated and force-changed on first sign-in, so they bypass this too.
/// Keep this list in step with PASSWORD_RULES in views/AccountView.jsx.
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

/// Best-effort client IP behind a proxy. `x-forwarded-for` is a list with the
/// original client first; fall back to `x-real-ip`, then to a constant so a
/// caller still gets a usable (if coarser) key when neither header is present.
///
/// Worth being honest about: on a request that did NOT pass through a trusted
/// proxy, this header is attacker-controlled. That is acceptable for the two
/// jobs it does here — throttling and audit context — because a forged value
/// only ever gives the attacker a *different* throttle bucket, never someone
/// else's access. It must never be used for authorization.
export async function clientIp() {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') || 'unknown';
}

/// Append one row to the audit trail.
///
/// Deliberately never throws. An audit write failing must not turn a successful
/// sign-in or a released cutoff into an error the user sees — losing one log
/// line is bad, but failing the operation it was describing is worse. Failures
/// go to the server console so they are still visible in the platform logs.
///
/// `actorLabel` is stored as plain text alongside `actorId` on purpose: the
/// trail has to stay readable after an account is renamed or deleted, and a
/// failed sign-in may have no real account behind it to point at.
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
