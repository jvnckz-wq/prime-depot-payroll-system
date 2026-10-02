import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { requireAdmin } from '@/lib/server/security/auth';
import { applyLoanDeductions } from '@/lib/server/services/loans-apply';
import { cutoffOf, isYmd, staffRunKey, todayYmdManila } from '@/lib/loan-rules';
import { crewAvailableOn, loadStaffPayrollInputs, staffAvailable, toDate } from '@/lib/server/services/payroll-inputs';

const bad = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    if (body.scope === 'staff') {
      const start = typeof body.start === 'string' ? body.start.trim() : '';
      const end = typeof body.end === 'string' ? body.end.trim() : '';
      if (!isYmd(start) || !isYmd(end)) return bad("Import this cutoff's attendance first. Loans are only deducted from pay that is known.");
      if (end < start) return bad('The attendance range ends before it starts.');
      const cut = cutoffOf(start);
      if (end > cut.end) return bad('The attendance range crosses into the next cutoff.');

      const released = await prisma.payrollPeriod.findFirst({
        where: { isReleased: true, startDate: { lte: toDate(cut.end) }, endDate: { gte: toDate(cut.start) } },
      });
      if (released) return bad(`${released.label} is already released. Un-finalize it first to change its deductions.`, 409);

      const runKey = staffRunKey(start);
      const inputs = await loadStaffPayrollInputs(prisma, { start, end, withLoans: false });
      const result = await applyLoanDeductions(prismaBase, { scope: 'staff', runKey, cutoffEnd: cut.end, available: staffAvailable(inputs) });
      return NextResponse.json({ ...result, runKey });
    }

    const runKey = typeof body.runKey === 'string' ? body.runKey.trim() : '';
    const m = /^crew-(\d{4}-\d{2}-\d{2})$/.exec(runKey);
    if (!m) return bad('Missing or invalid run key.');
    const day = m[1];
    if (day > todayYmdManila()) return bad('That day has not happened yet.');

    const result = await applyLoanDeductions(prismaBase, { scope: 'crew', runKey, available: await crewAvailableOn(prisma, day) });
    return NextResponse.json({ ...result, runKey });
  } catch (err) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'These deductions were just applied by someone else. Refresh to see them.' }, { status: 409 });
    }
    console.error('POST /api/loans/apply-deductions failed:', err);
    return NextResponse.json({ error: 'Could not apply deductions: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
