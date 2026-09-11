import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { requireUser } from '../../../../../lib/auth';
import { generateTotpSecret, totpKeyUri, totpQrDataUrl } from '../../../../../lib/twofactor';

// Begin two-factor enrollment: mint a fresh secret, store it (disabled until a
// code confirms it), and hand back a QR plus the secret for manual entry.
// Operations Head only. Called each time the setup screen opens, so a new
// secret always replaces any abandoned one.
//
// Only while two-factor is OFF. Once it is on this refuses instead of replacing
// the working secret; otherwise anyone holding a signed-in session could swap
// in their own authenticator, or turn two-factor off just by starting setup
// and walking away.
export async function POST() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Two-factor is for the Operations Head account.' }, { status: 403 });
  }

  try {
    const secret = generateTotpSecret();
    // The "still off" check and the write are one statement, so a setup racing
    // an enable cannot slip a new secret in underneath it.
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
