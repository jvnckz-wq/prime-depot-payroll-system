// ============================================================================
// Database seed — Prime Depot Payroll
//
// Loads the real reference data extracted from the client's own workbooks:
//   PAYROLL_SHEET.xlsx  → office staff roster, daily rates, contribution flags
//   TRUCK_PAYROLL.xlsx  → fleet, VALUES piece-rate table, DOBLE area list
//   Taxes.pdf           → 2026 SSS / PhilHealth / Pag-IBIG / BIR tables
//
// Safe to re-run: every write is an upsert keyed on a stable identifier, so
// running this twice updates rather than duplicates.
//
//   npx tsx prisma/seed.ts
//
// Prisma 7 generates the client as TypeScript, so this runs through tsx rather
// than plain node. The file itself is ordinary JavaScript — .ts only so the
// generated client's types resolve.
// ============================================================================

import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

// Seeding writes schema-level volumes of data, so it uses the direct
// (unpooled) connection — same reasoning as migrations.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const YEAR = 2026;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const STAFF = [
  ['EMP-001', 'Jean Margaret Tengco', 'OPERATIONS_HEAD',         800, 20800, true,  true,  true,   0],
  ['EMP-002', 'Girlie Ernesto',       'ADMINISTRATIVE_STAFF',    700, 18200, true,  true,  true, 500],
  ['EMP-003', 'April Rose Castillo',  'ADMINISTRATIVE_STAFF',    650, 16900, true,  true,  true,   0],
  ['EMP-004', 'Jaclyn Joyce Genova',  'ADMINISTRATIVE_STAFF',    650, 16900, true,  true,  false,  0],
  ['EMP-005', 'Ma. Christine Reyes',  'ADMINISTRATIVE_STAFF',    650, 16900, true,  true,  true, 200],
  ['EMP-006', 'Paula Mae Nazarro',    'ADMINISTRATIVE_STAFF',    550, 14300, false, false, false,  0],
  ['EMP-007', 'Lea May Magsino',      'ADMINISTRATIVE_STAFF',    600, 15600, false, false, false,  0],
  ['EMP-008', 'Lovely Bantoy',        'ADMINISTRATIVE_STAFF',    600, 15600, false, false, false,  0],
  ['EMP-009', 'Ayessa Mae Mahaguay',  'ADMINISTRATIVE_STAFF',    600, 15600, false, false, true, 200],
  ['EMP-010', 'Romelyn Villanueva',   'ADMINISTRATIVE_STAFF',    600, 15600, true,  true,  true,   0],
  ['EMP-011', 'Jessa Pintor',         'ADMINISTRATIVE_STAFF',    600, 15600, true,  true,  true,   0],
  ['EMP-012', 'Yesha Espinosa',       'ADMINISTRATIVE_STAFF',    600, 15600, true,  true,  true,   0],
  ['EMP-013', 'Krine',                'SECRETARY_SPECIAL_SHIFT', 650, 16900, true,  true,  true,   0],
  ['EMP-014', 'Jerome Ylagan',        'ADMINISTRATIVE_STAFF',    550, 14300, false, false, false,  0],
];

// Fleet. `helpers` is the crew usually seen on that truck — a prefill hint for
// the delivery form, never an assignment. Driver and helpers are both chosen
// per delivery.
const FLEET = [
  ['TRK-01', 'Andro',     ['Echo', 'Joven'],        'White DT6',        'NKJ3476'],
  ['TRK-02', 'Arnold',    ['Elmer', 'Perlas'],      'Blue MD',          'CBS3797'],
  ['TRK-03', 'Bryan',     ['Melvin', 'Joshua'],     'White MD',         'CCR3211'],
  ['TRK-04', 'Eric',      ['John J.', 'Jhan Jhan'], 'Green Elf',        'DTC394'],
  ['TRK-05', 'Ruel',      ['Gasi'],                 'Blue MD',          'CCB5159'],
  ['TRK-06', 'Ton-Ton',   ['Tantan'],               'Violet MD',        'CBN6617'],
  ['TRK-07', 'Wannie',    ['Erwin', 'Victor'],      'Blue MD',          'CCR3265'],
  ['TRK-08', 'Ian',       ['Aljun', 'Kenneth'],     'Blue 4x4 MD',      'CCK8810'],
  ['TRK-09', 'Christian', ['Jerico'],               'HOWO DT',          'NHE5123'],
  ['TRK-10', 'Dennis',    ['Roderick'],             'Yellow MD',        'CCP1625'],
  ['TRK-11', 'Edmar',     ['Aljun', 'Kenneth'],     'White 4x4 MD',     'CBR1765'],
  ['TRK-12', 'Romel',     ['Joshua'],               'Boom Truck',       'CCP2554'],
  ['TRK-13', 'Sonny',     ['Tantan'],               'Barako Tricycle',  '0524DL'],
];

const DRIVER_DAILY = 280;
const HELPER_DAILY = 480;

// VALUES sheet — [item, unit, driver, helper, driverDoble, helperDoble]
const RATES = [
  ['Aggregates',                                 'elf',       15,   70,   30,   140],
  ['Aggregates',                                 'mini dump', 20,   60,   40,   120],
  ['CHB',                                        'piece',     0.04, 0.12, 0.08, 0.24],
  ['Cement, Adhesive, Boral, Skimcoat, Sand',    'bag',       0.5,  0.75, 1,    1.5],
  ['Steel, Wood, Plywood, Pipe, Roofing Items',  'piece',     0.5,  0.5,  1,    1],
  ['Tiles 60 x 60',                              'box',       1,    1,    2,    2],
  ['Tiles 30 x 60',                              'box',       0.75, 1,    0.75, 2],
  ['Tiles 40 x 40',                              'box',       0.5,  0.5,  1,    1],
  ['Tiles 30 x 30',                              'box',       0.5,  0.5,  1,    1],
];

// DOBLE sheet — barangay / sitio names that pay double rates.
const DOBLE_AREAS = [
  'ESTRELLANG LANGIT', 'TULO LAUREL', 'LAUREL', 'MATALA GULUGOD', 'MALIMATOC 2',
  'YONG YONG MALIMATOC 2', 'MAINIT', 'NAGIBA', 'STA MONIC NAGIBA', 'SAMPALUCAN',
  'BALANOY', 'GULOD BAGALANGIT', 'MALAGAKLAK LIGAYA', 'PANAY', 'GUITISAN SAN TEODORO',
  'HULO SOLO', 'KINA PIOLO PASCUAL', 'NANGKAAN SAN TEODORO', 'PANG AKLE',
  'BAUAN', 'ORENSE',
];

// SSS — [salaryFrom, salaryTo, employeeShare]. Upper band has no ceiling.
const SSS_CEILINGS = [
  [4250, 135], [4750, 157.5], [5250, 180], [5750, 202.5], [6250, 225],
  [6750, 247.5], [7250, 270], [7750, 292.5], [8250, 315], [8750, 337.5],
  [9250, 360], [9750, 382.5], [10250, 405], [10750, 427.5], [11250, 450],
  [11750, 472.5], [12250, 495], [12750, 517.5], [13250, 540], [13750, 562.5],
  [14250, 585], [14750, 607.5], [15250, 630], [15750, 652.5], [16250, 675],
  [16750, 697.5], [17250, 720], [17750, 742.5], [18250, 765], [18750, 787.5],
  [19250, 810], [19750, 832.5], [20250, 855], [null, 900],
];

// BIR TRAIN annual brackets — [from, to, baseTax, percentOverExcess]
const BIR = [
  [0,       250000,  0,       0],
  [250000,  400000,  0,       15],
  [400000,  800000,  22500,   20],
  [800000,  2000000, 102500,  25],
  [2000000, 8000000, 402500,  30],
  [8000000, null,    2202500, 35],
];

// ---------------------------------------------------------------------------

async function seedStatutory() {
  await prisma.sssBracket.deleteMany({ where: { effectiveYear: YEAR } });
  let from = 0;
  for (const [ceiling, share] of SSS_CEILINGS) {
    await prisma.sssBracket.create({
      data: {
        effectiveYear: YEAR,
        salaryFrom: from,
        // The open-ended top band is stored with a very high ceiling so range
        // lookups stay a simple BETWEEN, with no null special-casing.
        salaryTo: ceiling ?? 999999999,
        employeeShare: share,
      },
    });
    if (ceiling) from = ceiling;
  }

  await prisma.philhealthConfig.upsert({
    where: { effectiveYear: YEAR },
    update: { ratePercent: 5, salaryFloor: 10000, salaryCeiling: 100000 },
    create: { effectiveYear: YEAR, ratePercent: 5, salaryFloor: 10000, salaryCeiling: 100000 },
  });

  const pagibig = await prisma.pagibigConfig.upsert({
    where: { effectiveYear: YEAR },
    update: { monthlyCap: 200 },
    create: { effectiveYear: YEAR, monthlyCap: 200 },
  });
  await prisma.pagibigBracket.deleteMany({ where: { configId: pagibig.id } });
  await prisma.pagibigBracket.createMany({
    data: [
      { configId: pagibig.id, salaryUpTo: 1500, employeePercent: 1, employerPercent: 2 },
      { configId: pagibig.id, salaryUpTo: null, employeePercent: 2, employerPercent: 2 },
    ],
  });

  await prisma.birBracket.deleteMany({ where: { effectiveYear: YEAR } });
  for (const [incomeFrom, incomeTo, baseTax, pct] of BIR) {
    await prisma.birBracket.create({
      data: { effectiveYear: YEAR, incomeFrom, incomeTo, baseTax, percentOverExcess: pct },
    });
  }
  console.log(`  statutory tables (${YEAR}): SSS ${SSS_CEILINGS.length}, PhilHealth, Pag-IBIG, BIR ${BIR.length}`);
}

async function seedEmployees() {
  for (const [id, name, position, rate, declared, sss, ph, pi, mp2] of STAFF) {
    await prisma.employee.upsert({
      where: { id },
      update: { name, position, dailyRate: rate, declaredSalary: declared },
      create: {
        id, name, position,
        dailyRate: rate, declaredSalary: declared,
        sssEnrolled: sss, philhealthEnrolled: ph, pagibigEnrolled: pi, mp2Amount: mp2,
      },
    });
  }

  // Crew. IDs follow a readable pattern for now — these must be replaced with
  // each person's real biometric-scanner ID before the first attendance
  // import, since that number is what links a scan to a person.
  const drivers = [...new Set(FLEET.map(f => f[1]))];
  const helpers = [...new Set(FLEET.flatMap(f => f[2]))];

  for (const [i, name] of drivers.entries()) {
    const id = 'DRV-' + String(i + 1).padStart(3, '0');
    await prisma.employee.upsert({
      where: { id },
      update: { name, position: 'DRIVER', dailyRate: DRIVER_DAILY },
      create: { id, name, position: 'DRIVER', dailyRate: DRIVER_DAILY, declaredSalary: 0 },
    });
  }
  for (const [i, name] of helpers.entries()) {
    const id = 'PAH-' + String(i + 1).padStart(3, '0');
    await prisma.employee.upsert({
      where: { id },
      update: { name, position: 'PAHINANTE', dailyRate: HELPER_DAILY },
      create: { id, name, position: 'PAHINANTE', dailyRate: HELPER_DAILY, declaredSalary: 0 },
    });
  }
  console.log(`  employees: ${STAFF.length} staff, ${drivers.length} drivers, ${helpers.length} pahinante`);
  return { drivers, helpers };
}

async function seedFleet() {
  for (const [id, driverName, helpers, vehicle, plate] of FLEET) {
    const driver = await prisma.employee.findFirst({
      where: { name: driverName, position: 'DRIVER' },
    });
    await prisma.truck.upsert({
      where: { id },
      update: { vehicle, plateNumber: plate, usualDriverId: driver?.id ?? null, usualHelper1: helpers[0] ?? null, usualHelper2: helpers[1] ?? null },
      create: { id, vehicle, plateNumber: plate, usualDriverId: driver?.id ?? null, usualHelper1: helpers[0] ?? null, usualHelper2: helpers[1] ?? null },
    });
  }
  console.log(`  trucks: ${FLEET.length}`);
}

async function seedRates() {
  for (const [itemName, unit, d, h, dd, hd] of RATES) {
    await prisma.rateItem.upsert({
      where: { itemName_unit: { itemName, unit } },
      update: { driverRate: d, helperRate: h, driverRateDouble: dd, helperRateDouble: hd },
      create: { itemName, unit, driverRate: d, helperRate: h, driverRateDouble: dd, helperRateDouble: hd },
    });
  }
  for (const areaName of DOBLE_AREAS) {
    await prisma.doubleRateArea.upsert({
      where: { areaName }, update: {}, create: { areaName },
    });
  }
  console.log(`  rate items: ${RATES.length}, double-rate areas: ${DOBLE_AREAS.length}`);
}

async function seedUsers() {
  // Placeholder credentials for first login only. The Operations Head should
  // change this immediately from Settings, and no real password should ever
  // live in a file that is committed.
  const initialPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const hash = await bcrypt.hash(initialPassword, 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: hash, displayName: 'Jean Margaret Tengco', role: 'ADMIN' },
  });
  await prisma.user.upsert({
    where: { username: 'checker1' },
    update: {},
    create: { username: 'checker1', passwordHash: hash, displayName: 'Checker 1', role: 'CHECKER' },
  });
  console.log('  users: admin, checker1  (change these passwords on first login)');
}

async function seedPeriod() {
  await prisma.payrollPeriod.upsert({
    where: { startDate_endDate: { startDate: new Date('2026-07-16'), endDate: new Date('2026-07-31') } },
    update: {},
    create: { label: 'July 16–31, 2026', startDate: new Date('2026-07-16'), endDate: new Date('2026-07-31') },
  });
  console.log('  payroll period: July 16–31, 2026');
}

async function main() {
  console.log('Seeding Prime Depot payroll database…');
  await seedStatutory();
  await seedEmployees();
  await seedFleet();
  await seedRates();
  await seedUsers();
  await seedPeriod();
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
