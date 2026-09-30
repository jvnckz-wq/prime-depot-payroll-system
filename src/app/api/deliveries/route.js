import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireUser } from '@/lib/server/security/auth';
import { isYmd, todayYmdManila } from '@/lib/loan-rules';
import { deliveryRange } from '@/lib/delivery-range';

const num = (d) => (d == null ? 0 : Number(d));
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

function shape(d) {
  return {
    id: d.id,
    date: ymd(d.date),
    truckId: d.truckId,
    driver: d.driver?.name ?? '',
    driverId: d.driverId,
    helpers: [d.helper1?.name, d.helper2?.name].filter(Boolean),
    helper1Id: d.helper1Id,
    helper2Id: d.helper2Id,
    seq: d.sequenceNo,
    customer: d.customerName ?? '',
    address: d.address,
    province: d.province ?? null,
    municipality: d.municipality ?? null,
    barangay: d.barangay ?? null,
    landmark: d.landmark ?? '',
    contactNo: d.contactNo ?? '',
    dbl: d.isDouble,
    matchedArea: d.matchedArea,
    items: d.items.map((i) => ({
      id: i.id, item: i.itemName, unit: i.unit,
      qty: num(i.quantity), d: num(i.driverAmount), h: num(i.helperAmount),
    })),
    loggedBy: d.loggedBy?.displayName ?? null,
    loggedAt: d.createdAt ? d.createdAt.toISOString() : null,
    // Void metadata travels with the row so the UI can strike it through and
    // name who corrected it, rather than the trip simply vanishing.
    voided: !!d.voidedAt,
    voidedAt: d.voidedAt ? d.voidedAt.toISOString() : null,
    voidedBy: d.voidedBy?.displayName ?? null,
    voidReason: d.voidReason ?? null,
  };
}

const INCLUDE = {
  driver: { select: { name: true } },
  helper1: { select: { name: true } },
  helper2: { select: { name: true } },
  loggedBy: { select: { displayName: true } },
  voidedBy: { select: { displayName: true } },
  items: true,
};

export async function GET(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const truckId = searchParams.get('truckId');

  const range = deliveryRange(from, to);
  if (range.error) return NextResponse.json({ error: range.error }, { status: 400 });

  const where = {};
  if (range.gte) where.date = { gte: range.gte, lte: range.lte };
  if (truckId) where.truckId = truckId;

  const deliveries = await prisma.delivery.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ date: 'desc' }, { truckId: 'asc' }, { sequenceNo: 'asc' }],
    ...(range.take ? { take: range.take } : {}),
  });

  return NextResponse.json({ deliveries: deliveries.map(shape) });
}

export async function POST(request) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    // Server-side validation. The delivery form checks these too, but that
    // check runs in the browser and can be bypassed — this is the one that
    // actually protects the payroll figures.
    const truckId = typeof body.truckId === 'string' ? body.truckId.trim() : '';
    const driverId = typeof body.driverId === 'string' ? body.driverId.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';

    if (!truckId) return NextResponse.json({ error: 'Select a truck.' }, { status: 400 });
    if (!driverId) return NextResponse.json({ error: 'Select a driver.' }, { status: 400 });
    if (!address) return NextResponse.json({ error: 'Delivery address is required.' }, { status: 400 });

    // The day a trip belongs to is the PHILIPPINE calendar day. The server runs
    // in UTC, so a plain new Date() still said "yesterday" until 8 AM Manila
    // time, and every trip logged from 6:30 to 8:00 AM was filed (trip number
    // and crew pay included) under the day before.
    //
    // The form sends no date: a trip is logged the day it happens. A date sent
    // straight to the API is checked here, because that is the check that
    // cannot be skipped: never a future day, and a Checker only today (the same
    // rule as voiding). The Operations Head may still file a missed trip on an
    // earlier day.
    const today = todayYmdManila();
    let dayYmd = today;
    if (body.date != null && body.date !== '') {
      const asked = String(body.date).slice(0, 10);
      if (!isYmd(asked)) return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
      if (asked > today) return NextResponse.json({ error: 'A delivery cannot be logged for a future date.' }, { status: 400 });
      if (auth.user.role !== 'ADMIN' && asked !== today) {
        return NextResponse.json({ error: "Checkers can only log today's deliveries. Ask the Operations Head to add a missed trip." }, { status: 403 });
      }
      dayYmd = asked;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const clean = items
      .map((i) => ({
        itemName: String(i.item ?? '').trim(),
        unit: String(i.unit ?? '').trim(),
        quantity: parseFloat(i.qty),
        driverAmount: parseFloat(i.d),
        helperAmount: parseFloat(i.h),
      }))
      .filter((i) => i.itemName && !isNaN(i.quantity) && i.quantity > 0);

    if (!clean.length) {
      return NextResponse.json({ error: 'Add at least one item with a quantity above zero.' }, { status: 400 });
    }
    if (clean.some((i) => isNaN(i.driverAmount) || isNaN(i.helperAmount) || i.driverAmount < 0 || i.helperAmount < 0)) {
      return NextResponse.json({ error: 'Item amounts must be zero or more.' }, { status: 400 });
    }

    const day = new Date(`${dayYmd}T00:00:00.000Z`);

    // The next trip number for that truck on that day. Two checkers logging at
    // the same moment can both read the same number, which is why the database
    // holds a unique constraint on (truck, date, sequence) — the retry below
    // handles the loser of that race instead of letting it fail.
    const attempt = async () => {
      const last = await prisma.delivery.findFirst({
        where: { truckId, date: day },
        orderBy: { sequenceNo: 'desc' },
        select: { sequenceNo: true },
      });
      const sequenceNo = (last?.sequenceNo ?? 0) + 1;

      return prisma.delivery.create({
        data: {
          date: day,
          truckId,
          driverId,
          helper1Id: body.helper1Id || null,
          helper2Id: body.helper2Id || null,
          sequenceNo,
          customerName: typeof body.customer === 'string' ? body.customer.trim() : null,
          address,
          province: typeof body.province === 'string' && body.province.trim() ? body.province.trim() : 'Batangas',
          municipality: typeof body.municipality === 'string' && body.municipality.trim() ? body.municipality.trim() : null,
          barangay: typeof body.barangay === 'string' && body.barangay.trim() ? body.barangay.trim() : null,
          landmark: typeof body.landmark === 'string' && body.landmark.trim() ? body.landmark.trim() : null,
          contactNo: typeof body.contactNo === 'string' && body.contactNo.trim() ? body.contactNo.trim() : null,
          isDouble: !!body.dbl,
          matchedArea: body.matchedArea || null,
          loggedById: auth.user.id,
          items: { create: clean },
        },
        include: INCLUDE,
      });
    };

    let delivery;
    for (let tries = 0; tries < 4; tries += 1) {
      try {
        delivery = await attempt();
        break;
      } catch (e) {
        // P2002 = unique constraint violation, i.e. someone took that trip
        // number first. Read the latest number again and retry.
        if (e?.code !== 'P2002' || tries === 3) throw e;
      }
    }

    return NextResponse.json({ delivery: shape(delivery) });
  } catch (err) {
    console.error('POST /api/deliveries failed:', err);
    return NextResponse.json({ error: 'Could not save the delivery.' }, { status: 500 });
  }
}