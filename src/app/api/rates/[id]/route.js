import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin, logSecurityEvent } from '../../../../lib/auth';

const num = (d) => (d == null ? 0 : Number(d));
const money = (n) => '₱' + Number(n || 0).toFixed(2);

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

    // Read the current values first, so the audit entry can record what actually
    // changed (old → new). Piece rates decide crew pay, so every edit to them is
    // logged with who made it and when — a question the panel will ask.
    const before = await prisma.rateItem.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: 'Rate item not found.' }, { status: 404 });

    const r = await prisma.rateItem.update({ where: { id }, data });

    // Build a human-readable diff and, only if something really changed, append
    // one row to the audit trail. Never let an audit failure fail the update.
    const changes = [];
    if (data.itemName != null && before.itemName !== r.itemName) changes.push(`name "${before.itemName}"→"${r.itemName}"`);
    if (data.unit != null && before.unit !== r.unit) changes.push(`unit "${before.unit}"→"${r.unit}"`);
    if (data.driverRate != null && num(before.driverRate) !== num(r.driverRate)) changes.push(`driver ${money(before.driverRate)}→${money(r.driverRate)}`);
    if (data.helperRate != null && num(before.helperRate) !== num(r.helperRate)) changes.push(`helper ${money(before.helperRate)}→${money(r.helperRate)}`);
    if (data.driverRateDouble != null && num(before.driverRateDouble) !== num(r.driverRateDouble)) changes.push(`driver×2 ${money(before.driverRateDouble)}→${money(r.driverRateDouble)}`);
    if (data.helperRateDouble != null && num(before.helperRateDouble) !== num(r.helperRateDouble)) changes.push(`helper×2 ${money(before.helperRateDouble)}→${money(r.helperRateDouble)}`);
    if (data.isActive === false && before.isActive) changes.push('retired');
    if (data.isActive === true && !before.isActive) changes.push('reactivated');

    if (changes.length) {
      await logSecurityEvent('CREW_RATES_UPDATED', {
        actorId: auth.user?.id ?? null,
        actorLabel: auth.user?.username ?? auth.user?.displayName ?? null,
        targetType: 'rateItem',
        targetId: r.id,
        detail: `${r.itemName} (${r.unit}): ${changes.join(', ')}`,
      });
    }

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
