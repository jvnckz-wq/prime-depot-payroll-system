import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import {
  logSecurityEvent, releaseAttempt, requireAdmin, reserveAttempt,
} from '../../../../../../lib/auth';
import { totpStep } from '../../../../../../lib/twofactor';

// Step two of moving two-factor to a new phone. The secret returned by /start
// comes back here with a code the new app produced. Only if that code matches
// the new secret does it replace the live one, in a single conditional update.
// The accepted time step is recorded against the new secret, so the same code
// cannot then be replayed at the sign-in prompt. Backup codes are unaffected;
// they are independent of which authenticator is enrolled.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { secret, code } = await request.json();
    if (typeof secret !== 'string' || secret.length < 16) {
      return NextResponse.json({ error: 'Start re-enrollment again. The new secret is missing.' }, { status: 400 });
    }

    const key = `reenroll:${auth.user.id}`;
    if (!(await reserveAttempt(key))) {
      return NextResponse.json(
        { error: 'Too many incorrect codes. Please wait 15 minutes and try again.' },
        { status: 429 },
      );
    }

    const entered = typeof code === 'string' ? code.trim() : '';
    const step = totpStep(entered, secret);
    if (step === null) {
      return NextResponse.json(
        { error: 'That code did not match the new app. Check it and try again.' },
        { status: 400 },
      );
    }
    await releaseAttempt(key);

    // Swap the secret only if two-factor is still on for the account, and record
    // the step so this confirming code cannot be reused to sign in.
    const { count } = await prisma.user.updateMany({
      where: { id: auth.user.id, totpEnabled: true },
      data: { totpSecret: secret, totpLastStep: step },
    });
    if (count === 0) {
      return NextResponse.json({ error: 'Two-factor is not on for this account.' }, { status: 400 });
    }

    await logSecurityEvent('TWO_FACTOR_REENROLLED', {
      actorId: auth.user.id, actorLabel: auth.user.username,
      targetType: 'user', targetId: auth.user.id,
      detail: 'Re-enrolled a new authenticator device; the previous device no longer works.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/2fa/reenroll/confirm failed:', err);
    return NextResponse.json({ error: 'Could not confirm the new device.' }, { status: 500 });
  }
}
