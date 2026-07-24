import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { createSession, verifyPassword } from '../../../../lib/auth';

// Simple rate limiting: 5 failed attempts per username per 15 minutes.
//
// This lives in memory, which is a real limitation worth stating plainly — it
// resets when the server restarts, and each serverless instance keeps its own
// count. For a single-shop deployment that is still a meaningful barrier
// against password guessing, but a production system with real traffic would
// move this into the database or a shared cache.
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

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

    if (tooManyAttempts(username)) {
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
      recordFailure(username);
      return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    };

    if (!user || !user.isActive) return reject();

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return reject();

    attempts.delete(username);

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
