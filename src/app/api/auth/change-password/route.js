import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import {
  destroyAllSessions, createSession, hashPassword,
  requireUser, validatePassword, verifyPassword,
} from '../../../../lib/auth';

// Changing your own password. Available to both roles — this is the one
// account action a Checker can perform.
export async function POST(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { currentPassword, newPassword } = await request.json();

    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!record) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    // Proving the current password matters even though the user is already
    // signed in: it stops someone who walks up to an unattended, logged-in
    // machine from locking the real owner out of their own account.
    const ok = await verifyPassword(currentPassword ?? '', record.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

    const problem = validatePassword(newPassword);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    if (await verifyPassword(newPassword, record.passwordHash)) {
      return NextResponse.json({ error: 'New password must be different from the current one.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: record.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });

    // Sign out every other device, then re-issue a session for this one. If the
    // password is being changed because someone else knew it, that person is
    // now locked out.
    await destroyAllSessions(record.id);
    await createSession(record.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/change-password failed:', err);
    return NextResponse.json({ error: 'Could not change password.' }, { status: 500 });
  }
}
