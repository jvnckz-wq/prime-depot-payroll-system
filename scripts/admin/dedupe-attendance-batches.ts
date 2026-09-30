import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

async function main() {
  const batches = await prisma.importBatch.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { importedAt: 'desc' },
    select: { id: true, periodStart: true, periodEnd: true, importedAt: true, filename: true },
  });

  const keepByPeriod = new Map<string, string>(); 
  const toDelete: { id: string; period: string }[] = [];

  for (const b of batches) {
    if (!b.periodStart || !b.periodEnd) continue; 
    const key = `${ymd(b.periodStart)}|${ymd(b.periodEnd)}`;
    if (keepByPeriod.has(key)) {
      toDelete.push({ id: b.id, period: `${ymd(b.periodStart)} to ${ymd(b.periodEnd)}` });
    } else {
      keepByPeriod.set(key, b.id);
    }
  }

  console.log(`Completed batches: ${batches.length}`);
  console.log(`Distinct periods (kept): ${keepByPeriod.size}`);
  console.log(`Duplicate batches to remove: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('Nothing to clean up. History already has one batch per period.');
    return;
  }

  for (const d of toDelete) console.log(`  - removing duplicate for ${d.period}`);

  const result = await prisma.importBatch.deleteMany({
    where: { id: { in: toDelete.map((d) => d.id) } },
  });

  console.log(`\nDone. Removed ${result.count} duplicate batch(es); kept the latest per period.`);
  console.log('Attendance rows were preserved (foreign key SET NULL).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
