import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin, requireUser } from '../../../lib/auth';

const num = (d) => (d == null ? 0 : Number(d));
const shape = (r) => ({
  id: r.id, cat: r.itemName, unit: r.unit,
  s: [num(r.driverRate), num(r.helperRate)],
  d: [num(r.driverRateDouble), num(r.helperRateDouble)],
  isActive: r.isActive,
});

// Checkers need the rate table to log a delivery — the form shows what each
// trip is worth as it is entered. They can read it; only the Operations Head
// can change it.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rates = await prisma.rateItem.findMany({ orderBy: { itemName: 'asc' } });
  return NextResponse.json({ rates: rates.map(shape) });
}

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const itemName = typeof body.cat === 'string' ? body.cat.trim() : '';
    const unit = typeof body.unit === 'string' ? body.unit.trim() : '';

    if (!itemName) return NextResponse.json({ error: 'Item name is required.' }, { status: 400 });
    if (!unit) return NextResponse.json({ error: 'Unit is required (bag, piece, box, elf...).' }, { status: 400 });

    const rate = (v) => {
      const n = parseFloat(v);
      return isNaN(n) || n < 0 ? 0 : n;
    };

    const existing = await prisma.rateItem.findUnique({ where: { itemName_unit: { itemName, unit } } });
    if (existing) {
      return NextResponse.json({ error: `"${itemName}" per ${unit} is already in the rate table.` }, { status: 409 });
    }

    const created = await prisma.rateItem.create({
      data: {
        itemName, unit,
        driverRate: rate(body.driverRate), helperRate: rate(body.helperRate),
        // Double-rate areas pay twice the standard rate unless told otherwise.
        driverRateDouble: body.driverRateDouble != null ? rate(body.driverRateDouble) : rate(body.driverRate) * 2,
        helperRateDouble: body.helperRateDouble != null ? rate(body.helperRateDouble) : rate(body.helperRate) * 2,
      },
    });
    return NextResponse.json({ rate: shape(created) });
  } catch (err) {
    console.error('POST /api/rates failed:', err);
    return NextResponse.json({ error: 'Could not add the rate item.' }, { status: 500 });
  }
}
