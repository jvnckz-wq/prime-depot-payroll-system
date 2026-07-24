import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

/// PATCH /api/trucks/:id — update details, or retire/restore.
///
/// A truck is retired rather than deleted: past deliveries point at it, and
/// deleting it would break the record of which vehicle made which trip.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();
    const data = {};

    if (typeof body.vehicle === 'string' && body.vehicle.trim()) data.vehicle = body.vehicle.trim();
    if (typeof body.plate === 'string' && body.plate.trim()) data.plateNumber = body.plate.trim().toUpperCase();
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const truck = await prisma.truck.update({ where: { id }, data });
    return NextResponse.json({
      truck: { id: truck.id, vehicle: truck.vehicle, plate: truck.plateNumber, isActive: truck.isActive },
    });
  } catch (err) {
    console.error('PATCH /api/trucks/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the truck.' }, { status: 500 });
  }
}
