import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { createSession, verifyPassword } from '../../../../lib/auth';

// Simple rate limiting: 5 failed attempts per (IP + username) per 15 minutes.
//
// Keying on the source IP as well as the username matters: if we throttled by
// username alone, anyone could lock a known user out for 15 minutes just by
// spamming wrong passwords for their name. Pairing it with the IP means a
// guesser only throttles themselves, while the real user (on a different IP)
// can still sign in.
//
// This lives in memory, which is a real limitation worth stating plainly — it
// resets when the server restarts, and each serverless instance keeps its own
// count. For a single-shop deployment that is still a meaningful barrier
// against password guessing, but a production system with real traffic would
// move this into the database or a shared cache.
const attempts = new Map();
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

function tooManyAttempts(key) {
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() - record.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const record = attempts.get(key);
  if (!record || Date.now() - record.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    record.count += 1;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400 });
    }

    // Throttle per source IP and username together, not by username alone.
    const key = `${clientIp(request)}|${username}`;

    if (tooManyAttempts(key)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please wait 15 minutes and try again.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });

    // One message for every failure mode — wrong username, wrong password,
    // disabled account. Saying "no such user" would let someone probe for
    // valid usernames one guess at a time.
    const reject = () => {
      recordFailure(key);
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    };

    if (!user || !user.isActive) return reject();

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return reject();

    attempts.delete(key);

    await createSession(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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
