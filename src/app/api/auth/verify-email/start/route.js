import { NextResponse } from 'next/server';
import { createHash, randomInt } from 'crypto';
import { prisma } from '@/lib/server/db/prisma';
import { requireUser, validatePassword, verifyPassword } from '@/lib/server/security/auth';
import { sendEmailVerificationCode } from '@/lib/server/integrations/email';
import { isEmail } from '@/lib/email-format';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const hashFor = (code, email) => createHash('sha256').update(`${code}|${email}`).digest('hex');
const sixDigits = () => String(randomInt(100000, 1000000));

export async function POST(request) {
  const auth = await requireUser({ allowPasswordChange: true });
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const record = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!record) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    if (record.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only the Operations Head registers a recovery email.' }, { status: 403 });
    }

    const body = await request.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    const ok = await verifyPassword(currentPassword, record.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

    const changingPassword = !!newPassword || record.mustChangePassword;
    if (changingPassword) {
      const problem = validatePassword(newPassword);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });

      if (await verifyPassword(newPassword, record.passwordHash)) {
        return NextResponse.json({ error: 'New password must be different from the current one.' }, { status: 400 });
      }
    }

    if (!isEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid recovery email address.' }, { status: 400 });
    }
    if (!changingPassword && email === record.email) {
      return NextResponse.json({ error: 'That is already your recovery email.' }, { status: 400 });
    }

    const recent = await prisma.passwordReset.findFirst({
      where: {
        userId: record.id, purpose: 'EMAIL_VERIFY', usedAt: null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
    });
    if (recent) {
      return NextResponse.json(
        { error: 'A code was sent less than a minute ago. Wait a moment, then try again.' },
        { status: 429 },
      );
    }

    await prisma.passwordReset.deleteMany({
      where: { userId: record.id, purpose: 'EMAIL_VERIFY', usedAt: null },
    });

    const code = sixDigits();
    const row = await prisma.passwordReset.create({
      data: {
        userId: record.id,
        purpose: 'EMAIL_VERIFY',
        codeHash: hashFor(code, email),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    try {
      await sendEmailVerificationCode(email, code);
    } catch (mailErr) {
      console.error('Recovery email verification send failed:', mailErr);
      await prisma.passwordReset.deleteMany({ where: { id: row.id } });
      return NextResponse.json(
        { error: 'Could not send the code. Check the email settings and try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/auth/verify-email/start failed:', err);
    return NextResponse.json({ error: 'Could not start email verification.' }, { status: 500 });
  }
}
