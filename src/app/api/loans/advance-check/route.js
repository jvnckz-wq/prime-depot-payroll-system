// GET /api/loans/advance-check?employeeId=&date=: whether a cash advance can be given yet (the employee
// needs at least one day of attendance in that cutoff, up to the date given).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { hasAttendanceForAdvance } from '@/lib/server/services/loans';
import { cutoffOf, isYmd, todayYmdManila } from '@/lib/loan-rules';

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const employeeId = params.get('employeeId') || '';
  const date = params.get('date') || todayYmdManila();
  if (!employeeId || !isYmd(date)) return NextResponse.json({ error: 'Choose the employee and the date.' }, { status: 400 });

  try {
    const period = cutoffOf(date);
    return NextResponse.json({ hasAttendance: await hasAttendanceForAdvance(prisma, employeeId, period.start, date) });
  } catch (err) {
    console.error('GET /api/loans/advance-check failed:', err);
    return NextResponse.json({ error: 'Could not check attendance.' }, { status: 500 });
  }
}
