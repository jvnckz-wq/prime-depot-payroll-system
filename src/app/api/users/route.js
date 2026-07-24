import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '../../../lib/prisma';
import { hashPassword, requireAdmin } from '../../../lib/auth';

// Account management is restricted to the Operations Head. Per the client's
// requirement there is no public registration anywhere in this system — every
// account is created here, by hand.

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    // passwordHash is deliberately not selected. There is no reason for a hash
    // to travel to the browser, so it never leaves this file's query.
    select: {
      id: true, username: true, displayName: true, role: true,
      isActive: true, mustChangePassword: true, lastLoginAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

/// Readable temporary password — the admin has to say this out loud to the
/// checker, so it avoids characters that are ambiguous when spoken or written
/// (no O/0, no l/1/I).
function generateTempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) =>
    Array.from(randomBytes(n)).map((b) => set[b % set.length]).join('');
  return `pd-${pick(letters, 4)}${pick(digits, 4)}`;
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    // Fields are picked one by one rather than spreading the request body into
    // Prisma. Spreading would let a caller set anything the model happens to
    // have — including role — regardless of what this endpoint intends.
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'CHECKER';

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must be 3–32 characters: lowercase letters, numbers, dot, dash, or underscore.' },
        { status: 400 }
      );
    }
    if (!displayName) {
      return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: `Username "${username}" is already taken.` }, { status: 409 });
    }

    const tempPassword = generateTempPassword();
    const user = await prisma.user.create({
      data: {
        username,
        displayName,
        role,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });

    // The temporary password is returned exactly once, here, for the admin to
    // hand over. It is not stored anywhere in readable form and cannot be
    // retrieved again — a forgotten one has to be reset, not looked up.
    return NextResponse.json({ user, tempPassword });
  } catch (err) {
    console.error('POST /api/users failed:', err);
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
