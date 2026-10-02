import { NextResponse } from 'next/server';
import { prisma, prismaBase } from '@/lib/server/db/prisma';
import { withRetry } from '@/lib/server/db/db-retry';
import { requireAdmin } from '@/lib/server/security/auth';
import {
  shapeSss, shapePhilhealth, shapePagibig, shapeBir,
  sssToDb, philhealthToDb, pagibigToDb, birToDb,
  validateSss, validatePhilhealth, validatePagibig, validateBir,
} from '@/lib/server/services/statutory';

const VALIDATORS = { sss: validateSss, philhealth: validatePhilhealth, pagibig: validatePagibig, bir: validateBir };

async function activeYear() {
  const latest = await prisma.philhealthConfig.findFirst({ orderBy: { effectiveYear: 'desc' } });
  return latest?.effectiveYear ?? new Date().getFullYear();
}

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

export async function PUT(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const table = body.table;
    const data = body.data;
    if (!VALIDATORS[table]) return NextResponse.json({ error: 'Unknown table.' }, { status: 400 });
    const problem = VALIDATORS[table](data);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const year = await activeYear();

    if (table === 'sss') {
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
    return NextResponse.json({ error: 'Could not save the table. Please try again.' }, { status: 500 });
  }
}
