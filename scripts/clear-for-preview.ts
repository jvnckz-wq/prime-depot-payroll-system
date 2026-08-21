/**
 * clear-for-preview.ts
 *
 * Empties EMPLOYEES and IMPORTS (attendance) so you can see the system in a
 * blank state. KEEPS your admin login, statutory tables, crew rates, trucks,
 * and delivery-area rates — so you can still log in and the pages don't break.
 *
 * Deletes, in FK-safe order:
 *   deliveries (+ their items)  →  employees (cascades attendance, loans,
 *   loan entries, payslips)  →  import batches (cascades unmapped logs).
 *
 * KEEPS: User (login), Session, statutory tables (SSS/PhilHealth/Pag-IBIG/BIR),
 *        CrewRate, Truck, RateItem, DoubleRateArea, PayrollPeriod.
 *
 * SAFETY: refuses to run if the connection points at the LIVE database
 * (endpoint "small-heart"). Only ever runs against a Neon test branch.
 *
 * Run locally:
 *   npx tsx scripts/clear-for-preview.ts
 *
 * When done previewing: restore .env.local from your backup and delete the
 * Neon branch. Your live data was never touched.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const conn = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';

// ---- SAFETY GUARD -----------------------------------------------------------
// Never let this run against the live/production database.
const LIVE_MARKER = 'small-heart';
const host = (conn.match(/@([^/?]+)/)?.[1]) ?? '(unknown host)';

if (!conn) {
  console.error('No DATABASE_URL found in .env.local. Aborting.');
  process.exit(1);
}
if (conn.includes(LIVE_MARKER)) {
  console.error('\n=========================================================');
  console.error('  REFUSING TO RUN.');
  console.error(`  This connection points at the LIVE database (${LIVE_MARKER}).`);
  console.error('  Point .env.local at your preview branch first.');
  console.error('=========================================================\n');
  process.exit(1);
}

console.log(`\nConnected to host: ${host}`);
console.log('(Confirm this is your preview branch, NOT small-heart.)\n');

const adapter = new PrismaPg({ connectionString: conn });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Show what's here before we touch anything.
  const [emps, atts, batches, dels] = await Promise.all([
    prisma.employee.count(),
    prisma.attendance.count(),
    prisma.importBatch.count(),
    prisma.delivery.count(),
  ]);
  console.log('Before clearing:');
  console.log(`  employees:      ${emps}`);
  console.log(`  attendance:     ${atts}`);
  console.log(`  import batches: ${batches}`);
  console.log(`  deliveries:     ${dels}\n`);

  if (emps === 0 && atts === 0 && batches === 0 && dels === 0) {
    console.log('Already empty. Nothing to do.');
    return;
  }

  // FK-safe order.
  const d1 = await prisma.delivery.deleteMany({});      // frees the driver FK; items cascade
  console.log(`Deleted ${d1.count} delivery record(s).`);

  const e1 = await prisma.employee.deleteMany({});      // cascades attendance, loans, payslips
  console.log(`Deleted ${e1.count} employee(s) (attendance, loans, payslips cascaded).`);

  const b1 = await prisma.importBatch.deleteMany({});   // cascades unmapped logs
  console.log(`Deleted ${b1.count} import batch(es).`);

  // Any stragglers (should already be gone via cascade).
  await prisma.attendance.deleteMany({});
  await prisma.unmappedLog.deleteMany({});

  const [emps2, atts2, batches2, dels2] = await Promise.all([
    prisma.employee.count(),
    prisma.attendance.count(),
    prisma.importBatch.count(),
    prisma.delivery.count(),
  ]);
  console.log('\nAfter clearing:');
  console.log(`  employees:      ${emps2}`);
  console.log(`  attendance:     ${atts2}`);
  console.log(`  import batches: ${batches2}`);
  console.log(`  deliveries:     ${dels2}`);
  console.log('\nDone. Your admin login and rate/statutory tables were kept.');
  console.log('Run `npm run dev` and browse the blank system on localhost.');
}

main()
  .catch((e) => {
    console.error('clear-for-preview failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
