import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { loadCrewReport, loadDailyContributionsForMonth, loadDailyStaff } from '@/lib/server/services/payroll-inputs';
import { deliveryRange } from '@/lib/delivery-range';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;

  if (params.get('summary') === 'crew') {
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    const range = deliveryRange(from, to);
    if (range.error || !range.days) {
      return NextResponse.json({ error: range.error || 'Choose a start date and an end date.' }, { status: 400 });
    }
    try {
      return NextResponse.json({ rows: await loadCrewReport(prisma, from, to) });
    } catch (err) {
      console.error('GET /api/payroll/daily (crew report) failed:', err);
      return NextResponse.json({ error: 'Could not load the crew report.' }, { status: 500 });
    }
  }

  const date = params.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date (YYYY-MM-DD) is required.' }, { status: 400 });
  }

  try {
    if (params.get('summary') === 'month') {
      return NextResponse.json(await loadDailyContributionsForMonth(prisma, date));
    }
    const staff = await loadDailyStaff(prisma, date);
    return NextResponse.json({ staff });
  } catch (err) {
    console.error('GET /api/payroll/daily failed:', err);
    return NextResponse.json({ error: 'Could not load daily attendance.' }, { status: 500 });
  }
}
