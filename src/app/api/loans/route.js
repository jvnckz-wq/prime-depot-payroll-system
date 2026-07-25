import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { requireAdmin } from '../../../lib/auth';
import { shapeLoan, typeToEnum } from '../../../lib/loans';

export async function GET() {
  // Loans are Operations Head only — a Checker never sees anyone's balances.
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const loans = await prisma.loan.findMany({
      include: { employee: true, entries: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ loans: loans.map(shapeLoan) });
  } catch (err) {
    console.error('GET /api/loans failed:', err);
    return NextResponse.json({ error: 'Could not load loans.' }, { status: 500 });
  }
}

// Granting a loan writes the loan and its first ledger entry (the money going
// out) together, so the balance is correct from the very first read.
export async function POST(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const person = typeof body.person === 'string' ? body.person.trim() : '';
    const principal = Number(body.principal);

    if (!person) return NextResponse.json({ error: 'Please choose the person the loan is for.' }, { status: 400 });
    if (!Number.isFinite(principal) || principal <= 0) {
      return NextResponse.json({ error: 'Principal must be a number greater than zero.' }, { status: 400 });
    }

    // A loan belongs to a real employee — that link is what lets payroll find
    // and deduct it automatically.
    const employee = await prisma.employee.findFirst({ where: { name: person } });
    if (!employee) {
      return NextResponse.json({ error: `No employee named "${person}". Register them first.` }, { status: 400 });
    }

    const label = typeof body.type === 'string' && body.type.trim() ? body.type.trim() : 'Cash Advance';
    const perRun = Number(body.perCutoff);
    const deductionPerRun = Number.isFinite(perRun) && perRun > 0 ? perRun : principal;
    const granted = body.date ? new Date(body.date + 'T00:00:00Z') : new Date();

    const loan = await prisma.loan.create({
      data: {
        employeeId: employee.id,
        type: typeToEnum(label),
        note: label,
        principal,
        deductionPerRun,
        dateGranted: granted,
        entries: { create: [{ date: granted, type: 'GRANT', amount: principal, note: 'Granted' }] },
      },
      include: { employee: true, entries: true },
    });
    return NextResponse.json({ loan: shapeLoan(loan) });
  } catch (err) {
    console.error('POST /api/loans failed:', err);
    return NextResponse.json({ error: 'Could not add the loan.' }, { status: 500 });
  }
}
