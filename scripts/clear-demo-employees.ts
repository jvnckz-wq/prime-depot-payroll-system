/**
 * Removes the seed/demo employees so the roster can be rebuilt with real people
 * registered under their biometric-scanner User IDs.
 *
 * Demo employees are the ones seeded with the placeholder ID patterns:
 *   EMP-###  (office staff)   DRV-###  (drivers)   PAH-###  (pahinante)
 *
 * Anyone registered manually with a real biometric ID (e.g. "7") uses a
 * different pattern and is LEFT UNTOUCHED — along with their attendance, loans,
 * and payslips.
 *
 * Deleting an employee cascades to their attendance, loans (+ ledger entries),
 * and payslips. Deliveries reference a driver with a required key, so this first
 * removes deliveries driven by a demo employee (their helper slots elsewhere are
 * nulled automatically).
 *
 * Run locally (same as reset-password.ts):
 *   npx tsx scripts/clear-demo-employees.ts
 *
 * NOTE: do NOT run `prisma db seed` or `prisma migrate reset` afterwards, or the
 * demo employees will be recreated.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const demo = await prisma.employee.findMany({
    where: {
      OR: [
        { id: { startsWith: 'EMP-' } },
        { id: { startsWith: 'DRV-' } },
        { id: { startsWith: 'PAH-' } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  if (!demo.length) {
    console.log('No demo employees (EMP-/DRV-/PAH-) found. Nothing to do.');
    return;
  }

  const ids = demo.map((e) => e.id);
  console.log(`Found ${demo.length} demo employees to remove:`);
  for (const e of demo) console.log(`  ${e.id.padEnd(9)} ${e.name}`);

  const keep = await prisma.employee.count({ where: { id: { notIn: ids } } });
  console.log(`\nKeeping ${keep} employee(s) registered with real IDs.\n`);

  const dels = await prisma.delivery.deleteMany({ where: { driverId: { in: ids } } });
  console.log(`Deleted ${dels.count} delivery record(s) driven by demo employees.`);

  const removed = await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${removed.count} demo employee(s).`);

  console.log('\nDone. Add your real employees using their biometric User IDs,');
  console.log('then re-import the attendance file.');
}

main()
  .catch((e) => {
    console.error('clear-demo-employees failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
