import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const conn = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';
if (!conn) {
  console.error('No DATABASE_URL found in .env.local. Aborting.');
  process.exit(1);
}

const host = conn.match(/@([^/?]+)/)?.[1] ?? '';
const endpoint = (host.split(':')[0].split('.')[0] || '').replace(/-pooler$/, '') || 'unknown';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const confirm = args.find((a) => a.startsWith('--confirm='))?.slice('--confirm='.length) ?? '';
const applyCommand = `npx tsx scripts/admin/reset-test-data.ts --apply --confirm=${endpoint}`;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const REMOVE: [string, () => Promise<number>][] = [
  ['employees', () => prisma.employee.count()],
  ['attendance rows', () => prisma.attendance.count()],
  ['import batches (.xls and device pulls)', () => prisma.importBatch.count()],
  ['unmapped ID logs', () => prisma.unmappedLog.count()],
  ['pull requests', () => prisma.pullRequest.count()],
  ['deliveries', () => prisma.delivery.count()],
  ['delivery items', () => prisma.deliveryItem.count()],
  ['loans and advances', () => prisma.loan.count()],
  ['loan ledger entries', () => prisma.loanEntry.count()],
  ['payroll periods (cutoffs)', () => prisma.payrollPeriod.count()],
  ['payslips', () => prisma.payslip.count()],
];

const KEEP: [string, () => Promise<number>][] = [
  ['accounts (admin + checker)', () => prisma.user.count()],
  ['trucks', () => prisma.truck.count()],
  ['rate items', () => prisma.rateItem.count()],
  ['crew rate settings', () => prisma.crewRate.count()],
  ['SSS brackets', () => prisma.sssBracket.count()],
  ['PhilHealth config', () => prisma.philhealthConfig.count()],
  ['Pag-IBIG config', () => prisma.pagibigConfig.count()],
  ['Pag-IBIG brackets', () => prisma.pagibigBracket.count()],
  ['BIR brackets', () => prisma.birBracket.count()],
  ['audit log entries', () => prisma.auditLog.count()],
  ['device status', () => prisma.deviceSync.count()],
];

async function counts(list: [string, () => Promise<number>][]) {
  const values = await Promise.all(list.map(([, fn]) => fn()));
  return list.map(([label], i) => ({ label, n: values[i] }));
}

function printCounts(title: string, rows: { label: string; n: number }[]) {
  console.log(title);
  for (const r of rows) console.log(`  ${String(r.n).padStart(6)}  ${r.label}`);
  console.log('');
}

async function main() {
  console.log(`\nDatabase endpoint: ${endpoint}`);
  console.log(apply ? 'Mode: APPLY\n' : 'Mode: DRY RUN (nothing will be deleted)\n');

  const before = await counts(REMOVE);
  const keptBefore = await counts(KEEP);

  printCounts('WILL BE DELETED:', before);
  printCounts('WILL BE KEPT:', keptBefore);

  const employees = await prisma.employee.findMany({
    select: { id: true, name: true, position: true, status: true },
    orderBy: { name: 'asc' },
  });
  if (employees.length) {
    console.log('Employees to delete:');
    for (const e of employees) console.log(`  ${e.id.padEnd(10)} ${e.name.padEnd(32)} ${e.position} (${e.status})`);
    console.log('');
  }

  const users = await prisma.user.findMany({
    select: { username: true, role: true, isActive: true, employeeId: true, employee: { select: { name: true } } },
    orderBy: { username: 'asc' },
  });
  console.log('Accounts kept:');
  for (const u of users) {
    const state = u.isActive ? 'active' : 'disabled';
    const link = u.employeeId ? `linked to ${u.employeeId} ${u.employee?.name ?? ''}, will be UNLINKED` : 'not linked';
    console.log(`  ${u.username.padEnd(20)} ${u.role.padEnd(8)} ${state.padEnd(9)} ${link}`);
  }
  console.log('');

  const openPulls = await prisma.pullRequest.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } });
  if (openPulls) console.log(`Note: ${openPulls} pull request(s) still queued. They will be deleted so the agent does not refill attendance.\n`);

  if (before.every((r) => r.n === 0)) {
    console.log('Already clean. Nothing to delete.');
    return;
  }

  if (!apply) {
    console.log('Dry run only. Nothing was deleted.');
    console.log('Before applying: create a Neon backup branch and download Settings > Backup Data.');
    console.log(`Then run:\n  ${applyCommand}\n`);
    return;
  }

  if (confirm !== endpoint) {
    console.error(`REFUSING TO RUN: --confirm must match the endpoint "${endpoint}".`);
    console.error(`Run:\n  ${applyCommand}\n`);
    process.exitCode = 1;
    return;
  }

  const results = await prisma.$transaction([
    prisma.loanEntry.deleteMany({}),
    prisma.loan.deleteMany({}),
    prisma.payslip.deleteMany({}),
    prisma.payrollPeriod.deleteMany({}),
    prisma.unmappedLog.deleteMany({}),
    prisma.attendance.deleteMany({}),
    prisma.importBatch.deleteMany({}),
    prisma.pullRequest.deleteMany({}),
    prisma.deliveryItem.deleteMany({}),
    prisma.delivery.deleteMany({}),
    prisma.user.updateMany({ where: { employeeId: { not: null } }, data: { employeeId: null } }),
    prisma.employee.deleteMany({}),
  ]);

  const labels = [
    'loan ledger entries', 'loans and advances', 'payslips', 'payroll periods', 'unmapped ID logs',
    'attendance rows', 'import batches', 'pull requests', 'delivery items', 'deliveries',
    'accounts unlinked', 'employees',
  ];
  console.log('Done in one transaction:');
  results.forEach((r, i) => console.log(`  ${String(r.count).padStart(6)}  ${labels[i]}`));
  console.log('');

  const after = await counts(REMOVE);
  const keptAfter = await counts(KEEP);
  const leftover = after.filter((r) => r.n !== 0);
  const changed = keptAfter.filter((r, i) => r.n !== keptBefore[i].n);

  if (leftover.length || changed.length) {
    for (const r of leftover) console.error(`CHECK: ${r.label} still has ${r.n} row(s).`);
    for (const r of changed) console.error(`CHECK: ${r.label} changed while it should have been kept.`);
    process.exitCode = 1;
    return;
  }

  console.log('Verified: every deleted table is empty and every kept table is unchanged.');
  console.log('Next: register the real checker in Employees, then link the account in Settings > Accounts.\n');
}

main()
  .catch((e) => {
    console.error('reset-test-data failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
