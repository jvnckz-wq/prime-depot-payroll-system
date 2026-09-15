import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import {
  logSecurityEvent, releaseAttempt, requireAdmin, reserveAttempt, verifyPassword,
} from '../../../../../../lib/auth';
import { generateBackupCodes, hashBackupCode, totpStep } from '../../../../../../lib/twofactor';

// Replace all backup codes with a fresh set of ten. Operations Head only, and
// only with two-factor on (requireAdmin already refuses otherwise). Proving the
// current password AND a live authenticator code is required, so someone at an
// unattended signed-in machine cannot silently issue themselves a new set. A
// live TOTP code is required here rather than a backup code: you regenerate
// because you still have your app, and spending a backup code to make more is
// backwards. The plaintext codes are returned exactly once; only hashes are
// stored.
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

    // Fail-closed cap on wrong codes, counted before the check.
    const key = `regen:${record.id}`;
    if (!(await reserveAttempt(key))) {
      return NextResponse.json(
        { error: 'Too many incorrect codes. Please wait 15 minutes and try again.' },
        { status: 429 },
      );
    }

    // A live authenticator code, accepted once per time step so it cannot be
    // replayed at the sign-in prompt afterwards.
    const entered = typeof code === 'string' ? code.trim() : '';
    let codeOk = false;
    const step = totpStep(entered, record.totpSecret);
    if (step !== null) {
      const { count } = await prisma.user.updateMany({
        where: { id: record.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      codeOk = count === 1;
    }
    if (!codeOk) {
      return NextResponse.json(
        { error: 'That authentication code did not match. Check your authenticator app and try again.' },
        { status: 400 },
      );
    }
    await releaseAttempt(key);

    const backupCodes = generateBackupCodes(10);
    await prisma.user.update({
      where: { id: record.id },
      data: { backupCodes: backupCodes.map(hashBackupCode) },
    });

    await logSecurityEvent('BACKUP_CODES_REGENERATED', {
      actorId: record.id, actorLabel: record.username,
      targetType: 'user', targetId: record.id,
      detail: 'Regenerated two-factor backup codes; the previous set was revoked.',
    });

    return NextResponse.json({ ok: true, backupCodes });
  } catch (err) {
    console.error('POST /api/auth/2fa/backup-codes/regenerate failed:', err);
    return NextResponse.json({ error: 'Could not regenerate backup codes.' }, { status: 500 });
  }
}
