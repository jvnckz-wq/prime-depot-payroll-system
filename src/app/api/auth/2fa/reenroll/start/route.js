import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '../../../../../../lib/prisma';
import { withRetry } from '../../../../../../lib/db-retry';
import {
  releaseAttempt, requireAdmin, reserveAttempt, verifyPassword,
} from '../../../../../../lib/auth';
import {
  generateTotpSecret, hashBackupCode, totpKeyUri, totpQrDataUrl, totpStep,
} from '../../../../../../lib/twofactor';

// Step one of moving two-factor to a new phone. Proves it is really the owner
// (current password AND a code from the CURRENT authenticator, or a backup
// code, since the whole reason to re-enroll may be that the phone is gone), then
// mints a FRESH secret and returns it with a QR. That new secret is NOT stored
// yet: the account keeps working on the old authenticator until /confirm proves
// the new one scans. So a half-finished re-enrollment can never lock the account
// out, and simply starting this never weakens the working setup.
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

    // Accept a current TOTP code first (recorded so it cannot be replayed at
    // sign-in), then fall back to a one-time backup code, spent with a single
    // conditional UPDATE so it can be used exactly once.
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

    // A fresh secret, handed back for the QR. Intentionally not written to the
    // account here; /confirm writes it only once a code proves the new app has
    // it.
    const secret = generateTotpSecret();
    const uri = totpKeyUri(record.username, secret);
    const qrDataUrl = await totpQrDataUrl(uri);

    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('POST /api/auth/2fa/reenroll/start failed:', err);
    return NextResponse.json({ error: 'Could not start re-enrollment.' }, { status: 500 });
  }
}
