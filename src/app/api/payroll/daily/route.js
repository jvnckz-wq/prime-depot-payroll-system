import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { loadDailyContributionsForMonth, loadDailyStaff } from '@/lib/server/services/payroll-inputs';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
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
