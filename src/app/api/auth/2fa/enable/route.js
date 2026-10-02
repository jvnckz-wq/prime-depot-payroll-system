import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { logSecurityEvent, requireUser } from '@/lib/server/security/auth';
import { totpStep, generateBackupCodes, hashBackupCode } from '@/lib/server/security/twofactor';

export async function POST(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Two-factor is for the Operations Head account.' }, { status: 403 });
  }

  try {
    const { code } = await request.json();
    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (record?.totpEnabled) {
      return NextResponse.json({ error: 'Two-factor login is already on for this account.' }, { status: 409 });
    }
    if (!record?.totpSecret) {
      return NextResponse.json({ error: 'Start setup again — there is no pending secret.' }, { status: 400 });
    }

    const step = totpStep(code, record.totpSecret);
    if (step === null) {
      return NextResponse.json(
        { error: 'That code did not match. Check your authenticator app and try again.' },
        { status: 400 },
      );
    }

    const backupCodes = generateBackupCodes(10);
    const { count } = await prisma.user.updateMany({
      where: { id: record.id, totpEnabled: false, totpSecret: record.totpSecret },
      data: { totpEnabled: true, backupCodes: backupCodes.map(hashBackupCode), totpLastStep: step },
    });
    if (count === 0) {
      return NextResponse.json(
        { error: 'Two-factor setup changed in another window. Refresh this page and start again.' },
        { status: 409 },
      );
    }

    await logSecurityEvent('TWO_FACTOR_ENABLED', {
      actorId: record.id, actorLabel: record.username,
      targetType: 'user', targetId: record.id,
      detail: 'Two-factor login turned on; ten backup codes issued.',
    });

    return NextResponse.json({ ok: true, backupCodes });
  } catch (err) {
    console.error('POST /api/auth/2fa/enable failed:', err);
    return NextResponse.json({ error: 'Could not enable two-factor.' }, { status: 500 });
  }
}
