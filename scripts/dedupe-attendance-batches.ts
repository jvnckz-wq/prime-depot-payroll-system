/**
 * De-duplicates attendance import batches.
 *
 * Re-importing the same cutoff used to leave the previous batch behind as an
 * empty record (the attendance rows move to the newest import). This cleans up
 * that history: for every period, it KEEPS the most recent completed batch and
 * deletes the older duplicates.
 *
 * SAFE: deleting a batch does NOT delete attendance — the foreign key is
 * SET NULL, so the daily records stay. Only the redundant batch record and its
 * stale unmapped logs (cascade) are removed. Payroll and DTR read attendance by
 * date, so they are unaffected.
 *
 * Run locally (same as the other scripts):
 *   npx tsx scripts/dedupe-attendance-batches.ts
 *
 * After this, the import route also prevents new duplicates automatically
 * (re-importing a period replaces its previous batch).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const ymd = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

async function main() {
  // Newest first, so the FIRST batch seen for a period is the keeper.
  const batches = await prisma.importBatch.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { importedAt: 'desc' },
    select: { id: true, periodStart: true, periodEnd: true, importedAt: true, filename: true },
  });

  const keepByPeriod = new Map<string, string>(); // periodKey -> kept batch id
  const toDelete: { id: string; period: string }[] = [];

  for (const b of batches) {
    if (!b.periodStart || !b.periodEnd) continue; // no period — leave it alone
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
