import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireUser } from '../../../../lib/auth';

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

/// PATCH /api/deliveries/:id — { action: 'void' | 'unvoid', reason }
///
/// Voiding replaces deletion. The rules were set with the client:
///
///   * A Checker may correct only TODAY's trips. Yesterday is already part of
///     a payroll figure someone may have looked at, so it stops being theirs
///     to change.
///   * The Operations Head may correct anything, including a released cutoff —
///     but the response says so plainly, because that means a payslip already
///     handed out no longer matches the record behind it.
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
    const isToday = ymd(delivery.date) === ymd(new Date());

    if (!isAdmin && !isToday) {
      return NextResponse.json(
        { error: "Checkers can only correct today's deliveries. Ask the Operations Head to correct an earlier entry." },
        { status: 403 }
      );
    }

    // Was this delivery inside a cutoff that has already been released?
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

      return NextResponse.json({
        ok: true,
        // Surfaced so the UI can warn rather than silently rewrite history.
        warning: released
          ? `${period.label} was already released — the payslip issued for this cutoff no longer matches the record. Make the adjustment on the next cutoff.`
          : null,
      });
    }

    if (action === 'unvoid') {
      // Restoring is Operations Head only. Letting a Checker un-void would
      // undo the visibility the whole arrangement depends on.
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
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/deliveries/[id] failed:', err);
    return NextResponse.json({ error: 'Could not update the delivery.' }, { status: 500 });
  }
}
