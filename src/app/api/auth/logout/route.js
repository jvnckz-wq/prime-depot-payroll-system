import { NextResponse } from 'next/server';
import { destroySession, getCurrentUser, logSecurityEvent } from '@/lib/server/security/auth';

export async function POST() {
  const user = await getCurrentUser();

  await destroySession();

  if (user) {
    await logSecurityEvent('LOGOUT', { actorId: user.id, actorLabel: user.username });
  }

  return NextResponse.json({ ok: true });
}
