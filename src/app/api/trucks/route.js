import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin, requireUser } from '../../../lib/auth';

// A truck is a vehicle and nothing else. Crew belongs to each delivery.
const shape = (t) => ({
  id: t.id, vehicle: t.vehicle, plate: t.plateNumber, isActive: t.isActive,
});

// Any signed-in user needs the fleet list — a Checker cannot log a delivery
// without knowing which trucks exist.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const trucks = await prisma.truck.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json({ trucks: trucks.map(shape) });
}

// Adding a truck to the fleet is an Operations Head action.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : '';
    const vehicle = typeof body.vehicle === 'string' ? body.vehicle.trim() : '';
    const plateNumber = typeof body.plate === 'string' ? body.plate.trim().toUpperCase() : '';

    if (!/^[A-Z0-9-]{3,12}$/.test(id)) {
      return NextResponse.json({ error: 'Truck ID must be 3-12 characters: letters, numbers, or dashes.' }, { status: 400 });
    }
    if (!vehicle) return NextResponse.json({ error: 'Vehicle description is required.' }, { status: 400 });
    if (!plateNumber) return NextResponse.json({ error: 'Plate number is required.' }, { status: 400 });

    if (await prisma.truck.findUnique({ where: { id } })) {
      return NextResponse.json({ error: `Truck ${id} already exists.` }, { status: 409 });
    }

    const truck = await prisma.truck.create({ data: { id, vehicle, plateNumber } });
    return NextResponse.json({ truck: shape(truck) });
  } catch (err) {
    console.error('POST /api/trucks failed:', err);
    return NextResponse.json({ error: 'Could not add the truck.' }, { status: 500 });
  }
}
