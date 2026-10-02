import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { destroyAllSessions, getCurrentUser, logSecurityEvent, requireUser } from '@/lib/server/security/auth';
import { MAX_AVATAR_BYTES, hasImageMagic, maxBase64Length } from '@/lib/server/security/uploads';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { lastLoginAt: true, createdAt: true, avatar: true, email: true, backupCodes: true },
  });

  return NextResponse.json({
    user: {
      ...user,
      avatar: record?.avatar ?? null,
      email: record?.email ?? null,
      backupCodesRemaining: record?.backupCodes?.length ?? 0,
      lastLoginAt: record?.lastLoginAt ? record.lastLoginAt.toISOString() : null,
      createdAt: record?.createdAt ? record.createdAt.toISOString() : null,
    },
  });
}

export async function PATCH(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const data = {};

    if ('email' in body) {
      return NextResponse.json(
        { error: 'The recovery email is changed from My Account, which confirms the new address first.' },
        { status: 400 },
      );
    }

    if ('displayName' in body) {
      const self = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { employeeId: true } });
      if (self?.employeeId) {
        return NextResponse.json(
          { error: 'Your name comes from your employee record. Ask the Operations Head to change it there.' },
          { status: 400 },
        );
      }
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      if (!displayName) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
      if (displayName.length > 80) return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
      data.displayName = displayName;
    }

    if ('avatar' in body) {
      const avatar = body.avatar;
      if (avatar === null) {
        data.avatar = null;
      } else if (typeof avatar === 'string') {
        const match = /^data:image\/(png|jpeg|webp);base64,(.*)$/s.exec(avatar);
        if (!match) {
          return NextResponse.json({ error: 'Profile picture must be a PNG, JPEG, or WebP image.' }, { status: 400 });
        }
        if (avatar.length > maxBase64Length(MAX_AVATAR_BYTES)) {
          return NextResponse.json({ error: 'Profile picture is too large. Choose a smaller image.' }, { status: 413 });
        }
        if (!hasImageMagic(match[1], match[2])) {
          return NextResponse.json({ error: 'That file is not a valid PNG, JPEG, or WebP image.' }, { status: 400 });
        }
        data.avatar = avatar;
      }
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data,
      select: { id: true, username: true, displayName: true, avatar: true, email: true, role: true, mustChangePassword: true },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error('PATCH /api/auth/me failed:', err);
    return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await destroyAllSessions(auth.user.id);

  await logSecurityEvent('SESSIONS_REVOKED', {
    actorId: auth.user.id,
    actorLabel: auth.user.username,
    targetType: 'user',
    targetId: auth.user.id,
    detail: 'Signed out of every device.',
  });

  return NextResponse.json({ ok: true });
}
