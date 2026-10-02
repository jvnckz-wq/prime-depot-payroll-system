import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import {
  releaseAttempt, requireAdmin, reserveAttempt, verifyPassword,
} from '@/lib/server/security/auth';
import {
  generateTotpSecret, hashBackupCode, totpKeyUri, totpQrDataUrl, totpStep,
} from '@/lib/server/security/twofactor';

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { currentPassword, code } = await request.json();

    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!record?.totpEnabled) {
      return NextResponse.json({ error: 'Two-factor login is not on for this account.' }, { status: 400 });
    }

    if (!(await verifyPassword(currentPassword ?? '', record.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
    }

    const key = `reenroll:${record.id}`;
    if (!(await reserveAttempt(key))) {
      return NextResponse.json(
        { error: 'Too many incorrect codes. Please wait 15 minutes and try again.' },
        { status: 429 },
      );
    }

    const entered = typeof code === 'string' ? code.trim() : '';
    let authed = false;
    const step = totpStep(entered, record.totpSecret);
    if (step !== null) {
      const { count } = await prisma.user.updateMany({
        where: { id: record.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      authed = count === 1;
    }
    if (!authed) {
      const h = hashBackupCode(entered);
      const removed = await withRetry(() => prismaBase.$executeRaw`
        UPDATE "users" SET "backupCodes" = array_remove("backupCodes", ${h})
        WHERE "id" = ${record.id} AND ${h} = ANY("backupCodes")`);
      authed = removed === 1;
    }
    if (!authed) {
      return NextResponse.json(
        { error: 'That code did not match. Use a code from your current app, or a backup code.' },
        { status: 400 },
      );
    }
    await releaseAttempt(key);

    const secret = generateTotpSecret();
    const uri = totpKeyUri(record.username, secret);
    const qrDataUrl = await totpQrDataUrl(uri);

    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('POST /api/auth/2fa/reenroll/start failed:', err);
    return NextResponse.json({ error: 'Could not start re-enrollment.' }, { status: 500 });
  }
}
