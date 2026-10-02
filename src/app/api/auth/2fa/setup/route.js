import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireUser } from '@/lib/server/security/auth';
import { generateTotpSecret, totpKeyUri, totpQrDataUrl } from '@/lib/server/security/twofactor';

export async function POST() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Two-factor is for the Operations Head account.' }, { status: 403 });
  }

  try {
    const secret = generateTotpSecret();
    const { count } = await prisma.user.updateMany({
      where: { id: auth.user.id, totpEnabled: false },
      data: { totpSecret: secret, totpLastStep: null },
    });
    if (count === 0) {
      return NextResponse.json({ error: 'Two-factor login is already on for this account.' }, { status: 409 });
    }

    const uri = totpKeyUri(auth.user.username, secret);
    const qrDataUrl = await totpQrDataUrl(uri);
    return NextResponse.json({ secret, qrDataUrl });
  } catch (err) {
    console.error('POST /api/auth/2fa/setup failed:', err);
    return NextResponse.json({ error: 'Could not start two-factor setup.' }, { status: 500 });
  }
}
