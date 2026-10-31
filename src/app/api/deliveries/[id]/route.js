// PATCH /api/deliveries/[id]: void or restore one logged trip.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { logSecurityEvent, requireUser } from '@/lib/server/security/auth';
import { todayYmdManila } from '@/lib/loan-rules';
import { voidReasonError } from '@/lib/void-reasons';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export async function PATCH(request, { params }) {
  const auth = await requireUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  try {
    const { action, reason } = await request.json();

    const delivery = await prisma.delivery.findUnique({
      where: { id },
      select: { id: true, date: true, sequenceNo: true, truckId: true, voidedAt: true },
    });
    if (!delivery) return NextResponse.json({ error: 'Delivery not found.' }, { status: 404 });

    const isAdmin = auth.user.role === 'ADMIN';
    const isToday = ymd(delivery.date) === todayYmdManila();

    if (!isToday) {
      return NextResponse.json(
        { error: 'Past days are view only. A delivery can only be changed on the day it was logged.' },
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
      const trimmed = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim() : '';
      const reasonErr = voidReasonError(trimmed);
      if (reasonErr) return NextResponse.json({ error: reasonErr }, { status: 400 });

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
          ? `${period.label} was already released. The payslip issued for this cutoff no longer matches the record. Make the adjustment on the next cutoff.`
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

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/deliveries/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the delivery.' }, { status: 500 });
  }
}
