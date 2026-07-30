import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { requireAdmin } from '../../../../lib/auth';
import { applyLoanDeductions } from '../../../../lib/loans-apply';

/// POST /api/loans/apply-deductions
/// Body: { scope: 'crew' | 'staff', runKey: string }
///
/// Deducts one instalment from every eligible loan in the group. Idempotent on
/// runKey (see lib/loans-apply.js) — the same deduction core is reused by the
/// Finalize/Release flow, so the two can never disagree.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const scope = body.scope === 'staff' ? 'staff' : 'crew';
    const runKey = typeof body.runKey === 'string' ? body.runKey.trim() : '';
    if (!runKey) return NextResponse.json({ error: 'Missing run key.' }, { status: 400 });

    const result = await applyLoanDeductions(prisma, { scope, runKey });
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/loans/apply-deductions failed:', err);
    return NextResponse.json({ error: 'Could not apply deductions: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
