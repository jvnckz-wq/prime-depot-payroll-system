import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '../../../lib/prisma';
import { withRetry } from '../../../lib/db-retry';
import { requireAdmin } from '../../../lib/auth';
import {
  shapeSss, shapePhilhealth, shapePagibig, shapeBir,
  sssToDb, philhealthToDb, pagibigToDb, birToDb,
} from '../../../lib/statutory';

// The active year is the most recent one present in the tables (the seed loads
// the current year). Edits update that year in place.
async function activeYear() {
  const latest = await prisma.philhealthConfig.findFirst({ orderBy: { effectiveYear: 'desc' } });
  return latest?.effectiveYear ?? new Date().getFullYear();
}

/// GET /api/statutory — the current year's SSS, PhilHealth, Pag-IBIG, and BIR
/// tables, in the shape the Settings editor and the compute* functions expect.
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const year = await activeYear();
    const [sss, ph, pagibig, bir] = await Promise.all([
      prisma.sssBracket.findMany({ where: { effectiveYear: year } }),
      prisma.philhealthConfig.findUnique({ where: { effectiveYear: year } }),
      prisma.pagibigConfig.findUnique({ where: { effectiveYear: year }, include: { brackets: true } }),
      prisma.birBracket.findMany({ where: { effectiveYear: year } }),
    ]);
    return NextResponse.json({
      year,
      sss: shapeSss(sss),
      philhealth: shapePhilhealth(ph),
      pagibig: shapePagibig(pagibig),
      bir: shapeBir(bir),
    });
  } catch (err) {
    console.error('GET /api/statutory failed:', err);
    return NextResponse.json({ error: 'Could not load statutory tables.' }, { status: 500 });
  }
}

/// PUT /api/statutory — save one table for the active year.
/// Body: { table: 'sss' | 'philhealth' | 'pagibig' | 'bir', data }
export async function PUT(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const table = body.table;
    const data = body.data;
    const year = await activeYear();

    if (table === 'sss') {
      if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: 'SSS table cannot be empty.' }, { status: 400 });
      await withRetry(() => prismaBase.$transaction([
        prismaBase.sssBracket.deleteMany({ where: { effectiveYear: year } }),
        prismaBase.sssBracket.createMany({ data: sssToDb(data, year) }),
      ]));
    } else if (table === 'philhealth') {
      const d = philhealthToDb(data, year);
      await prisma.philhealthConfig.upsert({ where: { effectiveYear: year }, update: d, create: d });
    } else if (table === 'pagibig') {
      const { config, brackets } = pagibigToDb(data, year);
      const cfg = await prisma.pagibigConfig.upsert({ where: { effectiveYear: year }, update: { monthlyCap: config.monthlyCap }, create: config });
      await withRetry(() => prismaBase.$transaction([
        prismaBase.pagibigBracket.deleteMany({ where: { configId: cfg.id } }),
        prismaBase.pagibigBracket.createMany({ data: brackets.map((b) => ({ ...b, configId: cfg.id })) }),
      ]));
    } else if (table === 'bir') {
      if (!Array.isArray(data) || !data.length) return NextResponse.json({ error: 'BIR table cannot be empty.' }, { status: 400 });
      await withRetry(() => prismaBase.$transaction([
        prismaBase.birBracket.deleteMany({ where: { effectiveYear: year } }),
        prismaBase.birBracket.createMany({ data: birToDb(data, year) }),
      ]));
    } else {
      return NextResponse.json({ error: 'Unknown table.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, year, table });
  } catch (err) {
    console.error('PUT /api/statutory failed:', err);
    return NextResponse.json({ error: 'Could not save: ' + (err?.message || 'unknown error') }, { status: 500 });
  }
}
