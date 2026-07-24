import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

/// PATCH /api/doble-areas/:id — activate or deactivate.
///
/// Deactivating stops the address matcher from flagging new trips in that area,
/// while leaving past trips that were correctly paid double untouched.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const { isActive } = await request.json();
    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be true or false.' }, { status: 400 });
    }
    const area = await prisma.doubleRateArea.update({ where: { id }, data: { isActive } });
    return NextResponse.json({ area: { id: area.id, name: area.areaName, isActive: area.isActive } });
  } catch (err) {
    console.error('PATCH /api/doble-areas/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the area.' }, { status: 500 });
  }
}
