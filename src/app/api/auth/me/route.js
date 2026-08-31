import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { destroyAllSessions, getCurrentUser, logSecurityEvent, requireUser } from '../../../../lib/auth';
import { MAX_AVATAR_BYTES, hasImageMagic, maxBase64Length } from '../../../../lib/uploads';

// Called once when the app loads, so a page refresh doesn't sign anyone out.
// Returns null rather than a 401 — "nobody is signed in" is a normal answer
// here, not an error.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { lastLoginAt: true, createdAt: true, avatar: true, email: true },
  });

  return NextResponse.json({
    user: {
      ...user,
      avatar: record?.avatar ?? null,
      email: record?.email ?? null,
      lastLoginAt: record?.lastLoginAt ? record.lastLoginAt.toISOString() : null,
      createdAt: record?.createdAt ? record.createdAt.toISOString() : null,
    },
  });
}

/// PATCH /api/auth/me — edit your own profile.
///
/// Only the display name is editable. The username is the login identity and
/// is attached to every delivery this account has logged; letting it change
/// would quietly rewrite who did what.
export async function PATCH(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const data = {};

    if ('displayName' in body) {
      const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      if (!displayName) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
      if (displayName.length > 80) return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
      data.displayName = displayName;
    }

    // Recovery email — the address a "forgot password" code is sent to. Only the
    // Operations Head keeps one; a Checker setting it would have no effect since
    // Checkers do not self-reset.
    if ('email' in body) {
      if (auth.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only the Operations Head can set a recovery email.' }, { status: 403 });
      }
      const raw = body.email;
      if (raw === null || (typeof raw === 'string' && !raw.trim())) {
        data.email = null; // clearing it
      } else if (typeof raw === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
        data.email = raw.trim().toLowerCase();
      } else {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      }
    }

    if ('avatar' in body) {
      const avatar = body.avatar;
      if (avatar === null) {
        data.avatar = null; // removing the picture
      } else if (typeof avatar === 'string') {
        // Only real images, and only small ones. The browser resizes to 128px
        // before sending; this is the backstop for anything that skips that
        // step, since nothing stops a caller posting straight to the endpoint.
        const match = /^data:image\/(png|jpeg|webp);base64,(.*)$/s.exec(avatar);
        if (!match) {
          return NextResponse.json({ error: 'Profile picture must be a PNG, JPEG, or WebP image.' }, { status: 400 });
        }
        if (avatar.length > maxBase64Length(MAX_AVATAR_BYTES)) {
          return NextResponse.json({ error: 'Profile picture is too large. Choose a smaller image.' }, { status: 413 });
        }
        // The declared MIME type is just a string in the data URL — a caller
        // that skips the browser can label anything `image/png`. Check the
        // first bytes actually carry that format's signature, so what gets
        // stored is a real image rather than 150KB of whatever.
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

/// DELETE /api/auth/me — sign out everywhere, this device included.
///
/// Signing out only *other* devices would need this session to be identified
/// and spared; ending all of them is simpler to reason about and leaves no
/// doubt about what happened. The user lands back on the sign-in screen.
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
