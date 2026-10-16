import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { labelTextError, plateError } from '@/lib/field-rules';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();
    const data = {};

    if (body.vehicle !== undefined) {
      const err = labelTextError(body.vehicle, { label: 'Vehicle description' });
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.vehicle = String(body.vehicle).replace(/\s+/g, ' ').trim();
    }
    if (body.plate !== undefined) {
      const err = plateError(body.plate);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      data.plateNumber = String(body.plate).replace(/\s+/g, ' ').trim().toUpperCase();
    }
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
