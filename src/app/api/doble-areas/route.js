import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin, requireUser } from '../../../lib/auth';

// Checkers need this list: the delivery form matches the address they type
// against it and flags a double-rate trip automatically.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const areas = await prisma.doubleRateArea.findMany({ orderBy: { areaName: 'asc' } });
  return NextResponse.json({ areas: areas.map(a => ({ id: a.id, name: a.areaName, isActive: a.isActive })) });
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const areaName = typeof body.name === 'string' ? body.name.trim().toUpperCase() : '';
    if (!areaName) return NextResponse.json({ error: 'Area name is required.' }, { status: 400 });

    if (await prisma.doubleRateArea.findUnique({ where: { areaName } })) {
      return NextResponse.json({ error: `"${areaName}" is already on the list.` }, { status: 409 });
    }

    const area = await prisma.doubleRateArea.create({ data: { areaName } });
    return NextResponse.json({ area: { id: area.id, name: area.areaName, isActive: area.isActive } });
  } catch (err) {
    console.error('POST /api/doble-areas failed:', err);
    return NextResponse.json({ error: 'Could not add the area.' }, { status: 500 });
  }
}
