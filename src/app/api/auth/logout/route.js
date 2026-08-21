import { NextResponse } from 'next/server';
import { destroySession, getCurrentUser, logSecurityEvent } from '../../../../lib/auth';

export async function POST() {
  // Read the user before the session goes away — afterwards there is nothing
  // left to attribute the entry to.
  const user = await getCurrentUser();

  await destroySession();

  if (user) {
    await logSecurityEvent('LOGOUT', { actorId: user.id, actorLabel: user.username });
  }

  return NextResponse.json({ ok: true });
}
