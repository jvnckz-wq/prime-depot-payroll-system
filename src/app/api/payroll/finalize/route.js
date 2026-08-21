import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { logSecurityEvent, requireAdmin } from '../../../../lib/auth';
import { applyLoanDeductions } from '../../../../lib/loans-apply';
import { summarizeAttendance } from '../../../../lib/attendance';
import { shapeEmployee } from '../../../../lib/employees';
import { shapeLoan } from '../../../../lib/loans';
import { computeStaffPayroll } from '../../../../lib/payroll';
import { shapeBir, shapePagibig, shapePhilhealth, shapeSss } from '../../../../lib/statutory';

// A released cutoff is stored as a snapshot: once written, its figures never
// move even if rates, statutory tables, or employee records change later.
//
// Every peso in that snapshot is computed HERE, on the server, from the
// database. It used to be taken from the request body — the browser ran
// computeStaffPayroll, posted the results, and this route wrote down whatever
// it was told, clamping each figure to "a positive number with two decimals"
// but never checking it was the RIGHT number. Anyone able to reach the endpoint
// could name their own net pay and have it stored as the permanent record of
// what the company owed.
//
// The fix is not more validation of the incoming numbers; it is not to need
// them. computeStaffPayroll is a pure function, so the server runs the very
// same code over the very same inputs and stores its own answer. The client's
// figures are still accepted, but only to be compared — see verifyAgainstClient
// below, which turns a stale browser tab into a clear error instead of a
// silently different payslip.

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (s) => new Date(`${s}T00:00:00.000Z`);
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const intOf = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/// The active statutory year is the most recent one loaded, matching
/// GET /api/statutory. Payroll must read the same tables the admin was shown.
async function loadStatutory() {
  const latest = await prisma.philhealthConfig.findFirst({ orderBy: { effectiveYear: 'desc' } });
  const year = latest?.effectiveYear ?? new Date().getFullYear();

  const [sss, ph, pagibig, bir] = await Promise.all([
    prisma.sssBracket.findMany({ where: { effectiveYear: year } }),
    prisma.philhealthConfig.findUnique({ where: { effectiveYear: year } }),
    prisma.pagibigConfig.findUnique({ where: { effectiveYear: year }, include: { brackets: true } }),
    prisma.birBracket.findMany({ where: { effectiveYear: year } }),
  ]);

  return {
    year,
    statutory: {
      sss: shapeSss(sss),
      philhealth: shapePhilhealth(ph),
      pagibig: shapePagibig(pagibig),
      bir: shapeBir(bir),
    },
  };
}

/// Build every staff payslip for a cutoff, from the database alone.
///
/// The employee set mirrors what Staff Payroll shows on screen exactly — office
/// staff (crew are paid through Truck Payroll) with a daily rate above zero.
/// Deliberately identical to the client's filter rather than "improved" here:
/// the point of this route is that the stored snapshot matches the reviewed
/// screen, and a server that quietly included a different set of people would
/// defeat that just as thoroughly as trusting the browser's arithmetic did.
async function computePayslips({ startDate, endDate, runKey }) {
  const [employees, attendanceRows, loanRows, { statutory }] = await Promise.all([
    prisma.employee.findMany({ orderBy: { id: 'asc' } }),
    prisma.attendance.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: { employee: { select: { name: true, position: true } } },
    }),
    // Loaded AFTER applyLoanDeductions has run, so a loan already charged for
    // this cutoff is read back at the exact amount charged rather than being
    // previewed a second time.
    prisma.loan.findMany({ include: { employee: true, entries: true }, orderBy: { createdAt: 'asc' } }),
    loadStatutory(),
  ]);

  const loans = loanRows.map(shapeLoan);
  const attendanceById = new Map(summarizeAttendance(attendanceRows).map((s) => [s.id, s]));

  const staff = employees
    .map(shapeEmployee)
    .filter((e) => !e.crew && Number(e.rate) > 0);

  return staff.map((e) => {
    const calc = computeStaffPayroll(e, loans, statutory, attendanceById.get(e.id), runKey);
    // MP2 is a voluntary top-up that computeStaffPayroll folds into the Pag-IBIG
    // figure; the payslip stores the two apart, so split them back out here.
    const mp2 = e.piOn ? (Number(e.mp2) || 0) : 0;

    return {
      employeeId: e.id,
      employeeName: e.name,
      daysPresent: intOf(calc.days),
      basicPay: money(calc.gross),
      overtimeWeekday: money(calc.otWeekday),
      overtimeWeekend: money(calc.otWeekend),
      allowances: money(calc.allowance),
      grossPay: money(calc.gross),
      sssDeduction: money(calc.sss),
      philhealthDeduction: money(calc.phic),
      pagibigDeduction: money(Math.max(0, calc.hdmf - mp2)),
      mp2Deduction: money(mp2),
      tardinessDeduction: money(calc.tardiness),
      loanDeduction: money(calc.advance),
      totalDeductions: money(calc.totalDeductions),
      netPay: money(calc.net),
    };
  });
}

// A centavo of slack per payslip, for the last bit of floating-point rounding.
const CENTAVO = 0.011;

/// Compare what the browser thought it was releasing against what the server
/// computed, and describe the first real disagreement.
///
/// This is not a security check — the stored figures are the server's either
/// way, so a tampered payload changes nothing. It exists for the honest case: a
/// tab left open since before an attendance re-import or a rate change would
/// otherwise release numbers the admin never actually saw. Better to stop and
/// say "refresh" than to store a payslip nobody reviewed.
function verifyAgainstClient(computed, claimed) {
  if (!Array.isArray(claimed) || claimed.length === 0) return null;

  const byId = new Map(computed.map((p) => [String(p.employeeId), p]));

  for (const slip of claimed) {
    const id = String(slip?.employeeId ?? '');
    if (!id) continue;

    const ours = byId.get(id);
    if (!ours) {
      return `The payroll on screen includes ${id}, who is no longer in this cutoff.`;
    }

    // A slip that carries no net pay at all is skipped rather than read as
    // zero — Number(null) is 0, which would otherwise be reported as a wild
    // mismatch. Nothing is lost by skipping: the amount stored is the server's
    // either way, and this comparison exists only to catch a stale screen.
    if (slip.netPay == null || slip.netPay === '') continue;

    const theirs = Number(slip.netPay);
    if (Number.isFinite(theirs) && Math.abs(theirs - ours.netPay) > CENTAVO) {
      return `${ours.employeeName}'s net pay has changed since this page was loaded `
        + `(shown ₱${theirs.toFixed(2)}, now ₱${ours.netPay.toFixed(2)}).`;
    }
  }

  if (claimed.length !== computed.length) {
    return `This cutoff now has ${computed.length} payslip(s); the page was showing ${claimed.length}.`;
  }

  return null;
}

/// POST /api/payroll/finalize
/// Body: { start, end, label, payslips? }
///
/// `start`, `end`, and `label` identify the cutoff. `payslips` is OPTIONAL and
/// advisory — send what the screen was showing and this route will refuse to
/// release if it no longer matches what the database says, which catches a tab
/// left open across an attendance re-import. Omit it and the cutoff is released
/// from the database alone. Either way, the amounts written are the ones
/// computed here.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { start, end, label } = body;
    if (!ymdRe.test(String(start)) || !ymdRe.test(String(end))) {
      return NextResponse.json({ error: 'A valid cutoff start and end are required.' }, { status: 400 });
    }
    if (typeof label !== 'string' || !label.trim()) {
      return NextResponse.json({ error: 'A cutoff label is required.' }, { status: 400 });
    }

    const startDate = toDate(start);
    const endDate = toDate(end);
    if (endDate < startDate) {
      return NextResponse.json({ error: 'The cutoff end cannot fall before its start.' }, { status: 400 });
    }
    const runKey = `staff-${label.trim()}`;

    // Guard: don't silently re-release. Un-finalize first if a correction is needed.
    const existing = await prisma.payrollPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
    if (existing?.isReleased) {
      return NextResponse.json({ error: 'This cutoff is already released. Un-finalize it first to make changes.' }, { status: 409 });
    }

    // Loan ledger first — idempotent, so a retry never double-charges. It also
    // has to happen before the payslips are computed, so each one records the
    // deduction that was actually charged rather than a fresh preview of it.
    const loanResult = await applyLoanDeductions(prisma, { scope: 'staff', runKey });

    const slips = await computePayslips({ startDate, endDate, runKey });
    if (slips.length === 0) {
      return NextResponse.json({ error: 'There are no staff payslips to finalize.' }, { status: 400 });
    }

    // The browser's figures are advisory: they are compared, never stored.
    const drift = verifyAgainstClient(slips, body.payslips);
    if (drift) {
      return NextResponse.json(
        { error: `${drift} Refresh Staff Payroll, review the updated figures, and release again.` },
        { status: 409 }
      );
    }

    // Create or reuse the period, then (re)write its snapshot cleanly.
    const period = existing
      ? await prisma.payrollPeriod.update({ where: { id: existing.id }, data: { label: label.trim(), isReleased: true, releasedAt: new Date() } })
      : await prisma.payrollPeriod.create({ data: { label: label.trim(), startDate, endDate, isReleased: true, releasedAt: new Date() } });

    await prisma.payslip.deleteMany({ where: { payrollPeriodId: period.id } });

    let written = 0;
    let netTotal = 0;
    for (const slip of slips) {
      await prisma.payslip.create({
        data: {
          payrollPeriodId: period.id,
          employeeId: slip.employeeId,
          payrollType: 'STAFF',
          daysPresent: slip.daysPresent,
          basicPay: slip.basicPay,
          overtimeWeekday: slip.overtimeWeekday,
          overtimeWeekend: slip.overtimeWeekend,
          allowances: slip.allowances,
          grossPay: slip.grossPay,
          sssDeduction: slip.sssDeduction,
          philhealthDeduction: slip.philhealthDeduction,
          pagibigDeduction: slip.pagibigDeduction,
          mp2Deduction: slip.mp2Deduction,
          withholdingTax: 0, // Most staff fall below the taxable threshold; BIR compute is future work.
          loanDeduction: slip.loanDeduction,
          tardinessDeduction: slip.tardinessDeduction,
          otherDeductions: 0,
          totalDeductions: slip.totalDeductions,
          netPay: slip.netPay,
        },
      });
      written++;
      netTotal += slip.netPay;
    }

    await logSecurityEvent('PAYROLL_FINALIZED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'payrollPeriod',
      targetId: period.id,
      detail: `Released ${period.label} — ${written} payslip(s), net ₱${netTotal.toFixed(2)}.`,
    });

    return NextResponse.json({
      released: true,
      periodId: period.id,
      label: period.label,
      payslips: written,
      loans: loanResult,
    });
  } catch (err) {
    console.error('POST /api/payroll/finalize failed:', err);
    return NextResponse.json({ error: 'Could not finalize the cutoff: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}

/// DELETE /api/payroll/finalize  — un-finalize (admin only).
/// Body: { start, end }. Reverses the release: removes the snapshot payslips,
/// reverses this cutoff's loan deductions, and marks the period unreleased so it
/// can be recomputed and released again cleanly.
export async function DELETE(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { start, end } = body;
    if (!ymdRe.test(String(start)) || !ymdRe.test(String(end))) {
      return NextResponse.json({ error: 'A valid cutoff start and end are required.' }, { status: 400 });
    }
    const startDate = toDate(start);
    const endDate = toDate(end);

    const period = await prisma.payrollPeriod.findUnique({ where: { startDate_endDate: { startDate, endDate } } });
    if (!period) return NextResponse.json({ error: 'That cutoff has not been released.' }, { status: 404 });

    const runKey = `staff-${period.label}`;

    // Reverse this cutoff's loan deductions so balances are restored, then drop
    // the snapshot and mark the period unreleased.
    const reversed = await prisma.loanEntry.deleteMany({ where: { payslipId: runKey, type: 'DEDUCTION' } });
    await prisma.payslip.deleteMany({ where: { payrollPeriodId: period.id } });
    await prisma.payrollPeriod.update({ where: { id: period.id }, data: { isReleased: false, releasedAt: null } });

    await logSecurityEvent('PAYROLL_UNFINALIZED', {
      actorId: auth.user.id,
      actorLabel: auth.user.username,
      targetType: 'payrollPeriod',
      targetId: period.id,
      detail: `Un-released ${period.label}; ${reversed.count} loan deduction(s) reversed.`,
    });

    return NextResponse.json({ unreleased: true, loanEntriesReversed: reversed.count });
  } catch (err) {
    console.error('DELETE /api/payroll/finalize failed:', err);
    return NextResponse.json({ error: 'Could not un-finalize the cutoff: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
