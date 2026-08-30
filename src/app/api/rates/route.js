import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { logSecurityEvent, requireAdmin, requireUser } from '../../../lib/auth';

const num = (d) => (d == null ? 0 : Number(d));
const shape = (r) => ({
  id: r.id, cat: r.itemName, unit: r.unit,
  s: [num(r.driverRate), num(r.helperRate)],
  d: [num(r.driverRateDouble), num(r.helperRateDouble)],
  isActive: r.isActive,
});

/// The crew rate card is a single row with a known id. Reading it through this
/// helper (rather than inlining findUnique everywhere) keeps the "what if the
/// row is missing" answer in one place — a fresh database that has not run the
/// seed still has to render something sane rather than paying everybody zero.
const CREW_RATE_DEFAULTS = { driverDaily: 280, helperDaily: 240, bonusHead: 100, bonusTrips: 5 };

const shapeCrewRates = (r) => (r
  ? {
    driverDaily: num(r.driverDaily),
    helperDaily: num(r.helperDaily),
    bonusHead: num(r.bonusHead),
    bonusTrips: r.bonusTrips,
  }
  : { ...CREW_RATE_DEFAULTS });

// Checkers need the rate table to log a delivery — the form shows what each
// trip is worth as it is entered. They can read it; only the Operations Head
// can change it. The crew rate card rides along in the same response because
// every screen that needs one needs the other.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [rates, crew] = await Promise.all([
    prisma.rateItem.findMany({ orderBy: { itemName: 'asc' } }),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
  ]);

  return NextResponse.json({ rates: rates.map(shape), crewRates: shapeCrewRates(crew) });
}

/// PATCH /api/rates — edit the crew rate card (daily minimums and the bonus).
///
/// Separate from POST, which adds a piece-rate item. These four numbers used to
/// be constants compiled into the browser bundle; they are money, so they live
/// in the database and change through an audited admin action.
export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    // Bounded on both ends. A negative daily rate is nonsense, and an
    // accidental extra zero on a pay rate is the kind of typo worth catching
    // here rather than discovering on a payslip.
    const money = (value, label, max) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return { error: `${label} must be zero or more.` };
      if (n > max) return { error: `${label} looks wrong — the maximum is ₱${max.toLocaleString('en-PH')}.` };
      return { value: Math.round(n * 100) / 100 };
    };

    const driverDaily = money(body.driverDaily, 'Driver daily rate', 10000);
    const helperDaily = money(body.helperDaily, 'Pahinante daily rate', 10000);
    const bonusHead = money(body.bonusHead, 'Palima bonus', 10000);
    const firstError = [driverDaily, helperDaily, bonusHead].find((f) => f.error);
    if (firstError) return NextResponse.json({ error: firstError.error }, { status: 400 });

    const bonusTrips = parseInt(body.bonusTrips, 10);
    if (!Number.isFinite(bonusTrips) || bonusTrips < 1 || bonusTrips > 50) {
      return NextResponse.json({ error: 'Bonus trip threshold must be between 1 and 50.' }, { status: 400 });
    }

    const data = {
      driverDaily: driverDaily.value,
      helperDaily: helperDaily.value,
      bonusHead: bonusHead.value,
      bonusTrips,
    };

    const updated = await prisma.crewRate.upsert({
      where: { id: 'current' },
      update: data,
      create: { id: 'current', ...data },
    });

    await logSecurityEvent('CREW_RATES_UPDATED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'crewRate',
      targetId: 'current',
      detail: `Driver ₱${data.driverDaily}/day, pahinante ₱${data.helperDaily}/day, `
        + `bonus ₱${data.bonusHead} at ${data.bonusTrips} trips.`,
    });

    return NextResponse.json({ crewRates: shapeCrewRates(updated) });
  } catch (err) {
    console.error('PATCH /api/rates failed:', err);
    return NextResponse.json({ error: 'Could not save the crew rates.' }, { status: 500 });
  }
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

    await logSecurityEvent('CREW_RATES_UPDATED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'rateItem',
      targetId: created.id,
      detail: `Added "${created.itemName}" (${created.unit}): driver ₱${num(created.driverRate).toFixed(2)}, helper ₱${num(created.helperRate).toFixed(2)}.`,
    });

    return NextResponse.json({ rate: shape(created) });
  } catch (err) {
    console.error('POST /api/rates failed:', err);
    return NextResponse.json({ error: 'Could not add the rate item.' }, { status: 500 });
  }
}
