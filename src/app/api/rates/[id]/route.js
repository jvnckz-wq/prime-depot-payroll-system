import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';

const num = (d) => (d == null ? 0 : Number(d));

/// PATCH /api/rates/:id — edit the amounts, or retire the item.
///
/// Retiring keeps it out of the delivery form's dropdown without touching past
/// deliveries. Amounts on a logged delivery are frozen at the moment it was
/// logged, so changing a rate here never rewrites what someone already earned.
export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const body = await request.json();
    const data = {};
    const rate = (v) => { const n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; };

    if (typeof body.cat === 'string' && body.cat.trim()) data.itemName = body.cat.trim();
    if (typeof body.unit === 'string' && body.unit.trim()) data.unit = body.unit.trim();
    if (body.driverRate != null) data.driverRate = rate(body.driverRate);
    if (body.helperRate != null) data.helperRate = rate(body.helperRate);
    if (body.driverRateDouble != null) data.driverRateDouble = rate(body.driverRateDouble);
    if (body.helperRateDouble != null) data.helperRateDouble = rate(body.helperRateDouble);
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const r = await prisma.rateItem.update({ where: { id }, data });
    return NextResponse.json({
      rate: {
        id: r.id, cat: r.itemName, unit: r.unit,
        s: [num(r.driverRate), num(r.helperRate)],
        d: [num(r.driverRateDouble), num(r.helperRateDouble)],
        isActive: r.isActive,
      },
    });
  } catch (err) {
    console.error('PATCH /api/rates/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the rate item.' }, { status: 500 });
  }
}
