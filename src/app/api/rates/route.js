import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { logSecurityEvent, requireAdmin, requireUser } from '@/lib/server/security/auth';

const num = (d) => (d == null ? 0 : Number(d));
const shape = (r) => ({
  id: r.id, cat: r.itemName, unit: r.unit,
  s: [num(r.driverRate), num(r.helperRate)],
  d: [num(r.driverRateDouble), num(r.helperRateDouble)],
  isActive: r.isActive,
});

const CREW_RATE_DEFAULTS = { driverDaily: 280, helperDaily: 240, bonusHead: 100, bonusTrips: 5, dailyContribution: null };

const shapeCrewRates = (r) => (r
  ? {
    driverDaily: num(r.driverDaily),
    helperDaily: num(r.helperDaily),
    bonusHead: num(r.bonusHead),
    bonusTrips: r.bonusTrips,
    dailyContribution: r.dailyContribution == null ? null : num(r.dailyContribution),
  }
  : { ...CREW_RATE_DEFAULTS });

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [rates, crew] = await Promise.all([
    prisma.rateItem.findMany({ orderBy: { itemName: 'asc' } }),
    prisma.crewRate.findUnique({ where: { id: 'current' } }),
  ]);

  return NextResponse.json({ rates: rates.map(shape), crewRates: shapeCrewRates(crew) });
}

export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    const money = (value, label, max) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return { error: `${label} must be zero or more.` };
      if (n > max) return { error: `${label} looks wrong — the maximum is ₱${max.toLocaleString('en-PH')}.` };
      return { value: Math.round(n * 100) / 100 };
    };

    const data = {};
    const parts = [];

    if (body.driverDaily !== undefined) {
      const driverDaily = money(body.driverDaily, 'Driver daily rate', 10000);
      const helperDaily = money(body.helperDaily, 'Pahinante daily rate', 10000);
      const bonusHead = money(body.bonusHead, 'Palima bonus', 10000);
      const firstError = [driverDaily, helperDaily, bonusHead].find((f) => f.error);
      if (firstError) return NextResponse.json({ error: firstError.error }, { status: 400 });

      const bonusTrips = parseInt(body.bonusTrips, 10);
      if (!Number.isFinite(bonusTrips) || bonusTrips < 1 || bonusTrips > 50) {
        return NextResponse.json({ error: 'Bonus trip threshold must be between 1 and 50.' }, { status: 400 });
      }

      Object.assign(data, { driverDaily: driverDaily.value, helperDaily: helperDaily.value, bonusHead: bonusHead.value, bonusTrips });
      parts.push(`Driver ₱${data.driverDaily}/day, pahinante ₱${data.helperDaily}/day, bonus ₱${data.bonusHead} at ${data.bonusTrips} trips.`);
    }

    if (body.dailyContribution !== undefined) {
      if (body.dailyContribution === null || body.dailyContribution === '') {
        data.dailyContribution = null;
        parts.push('Daily contributions: even split of the monthly share across working days.');
      } else {
        const daily = money(body.dailyContribution, 'Daily contribution deduction', 1000);
        if (daily.error) return NextResponse.json({ error: daily.error }, { status: 400 });
        data.dailyContribution = daily.value;
        parts.push(`Daily contributions: fixed ₱${data.dailyContribution} per day.`);
      }
    }

    if (!parts.length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

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
      detail: parts.join(' '),
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
