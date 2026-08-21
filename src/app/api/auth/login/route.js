import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import {
  burnPasswordComparison, createSession, logSecurityEvent, verifyPassword,
} from '../../../../lib/auth';

// Rate limiting: 5 failed attempts per (IP + username) per 15 minutes.
//
// Keying on the source IP as well as the username matters: if we throttled by
// username alone, anyone could lock a known user out for 15 minutes just by
// spamming wrong passwords for their name. With a single Operations Head
// account that is a remote off switch for the whole business. Pairing it with
// the IP means a guesser only throttles themselves, while the real user (on a
// different IP) can still sign in.
//
// The counter lives in the database. It used to be a Map in this module's
// scope, which reset on every server restart and gave each serverless instance
// its own private tally — so on a platform that recycles instances constantly,
// an attacker rarely met the same counter twice. That version looked like a
// throttle without being one.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Best-effort client IP behind Vercel's proxy. x-forwarded-for is a list, with
// the original client first; fall back to x-real-ip, then a constant so the
// limiter still works (just coarser) if neither header is present.
function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

const isExpired = (record) => Date.now() - record.firstAt.getTime() > WINDOW_MS;

async function tooManyAttempts(key) {
  const record = await prisma.loginAttempt.findUnique({ where: { key } });
  if (!record) return false;
  if (isExpired(record)) {
    // The window has passed — clear it so counting starts fresh.
    await prisma.loginAttempt.delete({ where: { key } }).catch(() => {});
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

async function recordFailure(key) {
  const now = new Date();
  const existing = await prisma.loginAttempt.findUnique({ where: { key } });

  // Inside the window, add to the tally; outside it (or first ever failure),
  // start a new window at one.
  if (existing && !isExpired(existing)) {
    await prisma.loginAttempt.update({
      where: { key },
      data: { count: { increment: 1 }, lastAt: now },
    });
    return;
  }

  await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, count: 1, firstAt: now, lastAt: now },
    update: { count: 1, firstAt: now, lastAt: now },
  });
}

/// Drop windows that have already expired. Called after a successful sign-in —
/// rare enough to be free, frequent enough that the table never accumulates.
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
    // Throttle per source IP and username together, not by username alone.
    const key = `${ip}|${username}`;

    if (await tooManyAttempts(key)) {
      await logSecurityEvent('LOGIN_THROTTLED', { actorLabel: username, ip });
      return NextResponse.json(
        { error: 'Too many failed attempts. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });

    // One message for every failure mode — wrong username, wrong password,
    // disabled account. Saying "no such user" would let someone probe for
    // valid usernames one guess at a time.
    const reject = async () => {
      await recordFailure(key);
      await logSecurityEvent('LOGIN_FAILURE', { actorId: user?.id ?? null, actorLabel: username, ip });
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    };

    // A missing or disabled account still pays for a bcrypt comparison, against
    // a hash no password matches. Skipping it would make these rejections
    // measurably faster than a wrong-password rejection, and that timing
    // difference enumerates usernames just as effectively as a distinct error
    // message would — undoing the point of the shared message above.
    if (!user || !user.isActive) {
      await burnPasswordComparison(password);
      return reject();
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return reject();

    await prisma.loginAttempt.deleteMany({ where: { key } });
    await sweepExpired();

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
      },
    });
  } catch (err) {
    console.error('POST /api/auth/login failed:', err);
    return NextResponse.json({ error: 'Could not sign in. Please try again.' }, { status: 500 });
  }
}
