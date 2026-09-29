import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { applyLoanDeductions } from '../../../../lib/loans-apply';
import { cutoffOf, isYmd, staffRunKey, todayYmdManila } from '../../../../lib/loan-rules';
import { crewAvailableOn, loadStaffPayrollInputs, staffAvailable, toDate } from '../../../../lib/payroll-inputs';

const bad = (error, status = 400) => NextResponse.json({ error }, { status });

/// POST /api/loans/apply-deductions
///   staff: { scope: 'staff', start, end }   the cutoff's attendance range
///   crew:  { scope: 'crew', runKey: 'crew-YYYY-MM-DD' }
///
/// Deducts from every eligible loan in the group, but never more than the pay
/// that is actually there (Phase 2): cash advances first, then the loan
/// installment, net pay never below P0, and the unpaid part carried over (staff)
/// or left for the loan to run a day longer (crew). What is available is
/// computed HERE from the database, never taken from the browser.
///
/// Idempotent on the run key (see lib/loans-apply.js). The same core is reused
/// by Finalize/Release, so the two can never disagree.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();

    if (body.scope === 'staff') {
      const start = typeof body.start === 'string' ? body.start.trim() : '';
      const end = typeof body.end === 'string' ? body.end.trim() : '';
      // No attendance, no known pay, so nothing can be taken safely.
      if (!isYmd(start) || !isYmd(end)) return bad("Import this cutoff's attendance first. Loans are only deducted from pay that is known.");
      if (end < start) return bad('The attendance range ends before it starts.');
      const cut = cutoffOf(start);
      if (end > cut.end) return bad('The attendance range crosses into the next cutoff.');

      // Once released, the payslips are frozen; a deduction now would take money
      // that no stored payslip shows.
      const released = await prisma.payrollPeriod.findFirst({
        where: { isReleased: true, startDate: { lte: toDate(cut.end) }, endDate: { gte: toDate(cut.start) } },
      });
      if (released) return bad(`${released.label} is already released. Un-finalize it first to change its deductions.`, 409);

      // The key names the calendar cutoff, decided here rather than by the browser.
      const runKey = staffRunKey(start);
      const inputs = await loadStaffPayrollInputs(prisma, { start, end, withLoans: false });
      const result = await applyLoanDeductions(prisma, { scope: 'staff', runKey, cutoffEnd: cut.end, available: staffAvailable(inputs) });
      return NextResponse.json({ ...result, runKey });
    }

    // Crew: one run per day, keyed by that day.
    const runKey = typeof body.runKey === 'string' ? body.runKey.trim() : '';
    const m = /^crew-(\d{4}-\d{2}-\d{2})$/.exec(runKey);
    if (!m) return bad('Missing or invalid run key.');
    const day = m[1];
    if (day > todayYmdManila()) return bad('That day has not happened yet.');

    const result = await applyLoanDeductions(prisma, { scope: 'crew', runKey, available: await crewAvailableOn(prisma, day) });
    return NextResponse.json({ ...result, runKey });
  } catch (err) {
    console.error('POST /api/loans/apply-deductions failed:', err);
    return NextResponse.json({ error: 'Could not apply deductions: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
