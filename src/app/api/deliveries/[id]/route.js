import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { logSecurityEvent, requireUser } from '@/lib/server/security/auth';
import { todayYmdManila } from '@/lib/loan-rules';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export async function PATCH(request, { params }) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  try {
    const { action, reason, value, preview } = await request.json();

    const delivery = await prisma.delivery.findUnique({
      where: { id },
      select: { id: true, date: true, sequenceNo: true, truckId: true, voidedAt: true },
    });
    if (!delivery) return NextResponse.json({ error: 'Delivery not found.' }, { status: 404 });

    const isAdmin = auth.user.role === 'ADMIN';
    const isToday = ymd(delivery.date) === todayYmdManila();

    if (!isAdmin && !isToday) {
      return NextResponse.json(
        { error: "Checkers can only correct today's deliveries. Ask the Operations Head to correct an earlier entry." },
        { status: 403 }
      );
    }

    const period = await prisma.payrollPeriod.findFirst({
      where: { startDate: { lte: delivery.date }, endDate: { gte: delivery.date } },
      select: { label: true, isReleased: true },
    });
    const released = !!period?.isReleased;

    if (released && !isAdmin) {
      return NextResponse.json(
        { error: `${period.label} has already been released. Only the Operations Head can change a released cutoff.` },
        { status: 403 }
      );
    }

    if (action === 'void') {
      if (delivery.voidedAt) {
        return NextResponse.json({ error: 'This delivery is already voided.' }, { status: 409 });
      }
      const trimmed = typeof reason === 'string' ? reason.trim() : '';
      if (trimmed.length < 3) {
        return NextResponse.json({ error: 'Give a short reason so the correction can be understood later.' }, { status: 400 });
      }

      await prisma.delivery.update({
        where: { id },
        data: { voidedAt: new Date(), voidedById: auth.user.id, voidReason: trimmed },
      });

      await logSecurityEvent('DELIVERY_VOIDED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'delivery',
        targetId: id,
        detail: `Trip ${delivery.sequenceNo} on ${delivery.truckId}, ${ymd(delivery.date)}`
          + `${released ? ' (cutoff already released)' : ''}: ${trimmed}`,
      });

      return NextResponse.json({
        ok: true,
        warning: released
          ? `${period.label} was already released — the payslip issued for this cutoff no longer matches the record. Make the adjustment on the next cutoff.`
          : null,
      });
    }

    if (action === 'unvoid') {
      if (!isAdmin) {
        return NextResponse.json({ error: 'Only the Operations Head can restore a voided delivery.' }, { status: 403 });
      }
      if (!delivery.voidedAt) {
        return NextResponse.json({ error: 'This delivery is not voided.' }, { status: 409 });
      }
      await prisma.delivery.update({
        where: { id },
        data: { voidedAt: null, voidedById: null, voidReason: null },
      });

      await logSecurityEvent('DELIVERY_UNVOIDED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'delivery',
        targetId: id,
        detail: `Restored trip ${delivery.sequenceNo} on ${delivery.truckId}, ${ymd(delivery.date)}.`,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === 'setDouble') {
      if (!isAdmin) {
        return NextResponse.json({ error: "Only the Operations Head can change a trip's double rate." }, { status: 403 });
      }
      if (delivery.voidedAt) {
        return NextResponse.json({ error: 'This delivery is voided. Restore it first if you need to change it.' }, { status: 409 });
      }

      const want = !!value;
      const full = await prisma.delivery.findUnique({
        where: { id },
        select: { isDouble: true, items: { select: { id: true, quantity: true, rateItemId: true } } },
      });

      const rateIds = [...new Set(full.items.map((i) => i.rateItemId).filter(Boolean))];
      const rateItems = rateIds.length
        ? await prisma.rateItem.findMany({
            where: { id: { in: rateIds } },
            select: { id: true, driverRate: true, helperRate: true, driverRateDouble: true, helperRateDouble: true },
          })
        : [];
      const rateById = new Map(rateItems.map((r) => [r.id, r]));
      if (full.items.some((i) => !i.rateItemId || !rateById.has(i.rateItemId))) {
        return NextResponse.json(
          { error: 'This trip has an item whose rate was removed. Correct it by voiding and re-entering.' },
          { status: 400 },
        );
      }

      const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
      let beforeD = 0, beforeH = 0, afterD = 0, afterH = 0;
      const lineUpdates = [];
      for (const i of full.items) {
        const r = rateById.get(i.rateItemId);
        const q = Number(i.quantity);
        const newD = +(q * Number(want ? r.driverRateDouble : r.driverRate)).toFixed(2);
        const newH = +(q * Number(want ? r.helperRateDouble : r.helperRate)).toFixed(2);
        afterD += newD; afterH += newH;
        lineUpdates.push({ id: i.id, data: { driverAmount: newD, helperAmount: newH } });
      }
      const current = await prisma.deliveryItem.findMany({
        where: { deliveryId: id }, select: { driverAmount: true, helperAmount: true },
      });
      for (const l of current) { beforeD += Number(l.driverAmount); beforeH += Number(l.helperAmount); }

      const summary = {
        before: { driver: round2(beforeD), helper: round2(beforeH) },
        after: { driver: round2(afterD), helper: round2(afterH) },
        from: full.isDouble, to: want,
      };

      if (preview) {
        return NextResponse.json({ ok: true, preview: true, unchanged: full.isDouble === want, ...summary });
      }
      if (full.isDouble === want) {
        return NextResponse.json({ ok: true, unchanged: true, ...summary });
      }

      await withRetry(() => prismaBase.$transaction([
        prismaBase.delivery.update({ where: { id }, data: { isDouble: want } }),
        ...lineUpdates.map((u) => prismaBase.deliveryItem.update({ where: { id: u.id }, data: u.data })),
      ]));

      await logSecurityEvent('DELIVERY_DOUBLE_CHANGED', {
        actorId: auth.user.id,
        actorLabel: auth.user.username,
        targetType: 'delivery',
        targetId: id,
        detail: `Trip ${delivery.sequenceNo} on ${delivery.truckId}, ${ymd(delivery.date)}: `
          + `double rate ${want ? 'ON' : 'OFF'} (driver ${summary.before.driver} to ${summary.after.driver}, `
          + `helper ${summary.before.helper} to ${summary.after.helper})${released ? ' (cutoff already released)' : ''}.`,
      });

      return NextResponse.json({
        ok: true,
        ...summary,
        warning: released
          ? `${period.label} was already released. The payslip issued for this cutoff no longer matches the record. Make the adjustment on the next cutoff.`
          : null,
      });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/deliveries/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the delivery.' }, { status: 500 });
  }
}
