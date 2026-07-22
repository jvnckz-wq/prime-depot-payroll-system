import { LayoutDashboard, Users, Clock, Truck, Wallet, Settings as SettingsIcon, FileText, BarChart3 } from 'lucide-react';
import { computeStaffPayroll } from '../lib/payroll';

export const STAFF_INIT = [
  { id: 'EMP-001', name: 'Jean Margaret Tengco', position: 'Operations Head', rate: 800, declaredSalary: 20800, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 0 },
  { id: 'EMP-002', name: 'Girlie Ernesto', position: 'Administrative Staff', rate: 700, declaredSalary: 18200, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 500 },
  { id: 'EMP-003', name: 'April Rose Castillo', position: 'Administrative Staff', rate: 650, declaredSalary: 16900, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 0 },
  { id: 'EMP-004', name: 'Jaclyn Joyce Genova', position: 'Administrative Staff', rate: 650, declaredSalary: 16900, status: 'Active', sssOn: true, phOn: true, piOn: false, mp2: 0 },
  { id: 'EMP-005', name: 'Ma. Christine Reyes', position: 'Administrative Staff', rate: 650, declaredSalary: 16900, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 200 },
  { id: 'EMP-006', name: 'Paula Mae Nazarro', position: 'Administrative Staff', rate: 550, declaredSalary: 14300, status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0 },
  { id: 'EMP-007', name: 'Lea May Magsino', position: 'Administrative Staff', rate: 600, declaredSalary: 15600, status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0 },
  { id: 'EMP-008', name: 'Lovely Bantoy', position: 'Administrative Staff', rate: 600, declaredSalary: 15600, status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0 },
  { id: 'EMP-009', name: 'Ayessa Mae Mahaguay', position: 'Administrative Staff', rate: 600, declaredSalary: 15600, status: 'Active', sssOn: false, phOn: false, piOn: true, mp2: 200 },
  { id: 'EMP-010', name: 'Romelyn Villanueva', position: 'Administrative Staff', rate: 600, declaredSalary: 15600, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 0 },
  { id: 'EMP-011', name: 'Jessa Pintor', position: 'Administrative Staff', rate: 600, declaredSalary: 15600, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 0 },
  { id: 'EMP-012', name: 'Yesha Espinosa', position: 'Administrative Staff', rate: 600, declaredSalary: 15600, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 0 },
  { id: 'EMP-013', name: 'Krine', position: 'Secretary — Special 6:00 AM Shift', rate: 650, declaredSalary: 16900, status: 'Active', sssOn: true, phOn: true, piOn: true, mp2: 0 },
  { id: 'EMP-014', name: 'Jerome Ylagan', position: 'Administrative Staff', rate: 550, declaredSalary: 14300, status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0 },
];

export const CREWS = [
  { id: 'TRK-01', driver: 'Andro', helpers: ['Echo', 'Joven'], vehicle: 'White DT6', plate: 'NKJ3476' },
  { id: 'TRK-02', driver: 'Arnold', helpers: ['Elmer', 'Perlas'], vehicle: 'Blue MD', plate: 'CBS3797' },
  { id: 'TRK-03', driver: 'Bryan', helpers: ['Melvin', 'Joshua'], vehicle: 'White MD', plate: 'CCR3211' },
  { id: 'TRK-04', driver: 'Eric', helpers: ['John J.', 'Jhan Jhan'], vehicle: 'Green Elf', plate: 'DTC394' },
  { id: 'TRK-05', driver: 'Ruel', helpers: ['Gasi', '—'], vehicle: 'Blue MD', plate: 'CCB5159' },
  { id: 'TRK-06', driver: 'Ton-Ton', helpers: ['Tantan', '—'], vehicle: 'Violet MD', plate: 'CBN6617' },
  { id: 'TRK-07', driver: 'Wannie', helpers: ['Erwin', 'Victor'], vehicle: 'Blue MD', plate: 'CCR3265' },
  { id: 'TRK-08', driver: 'Ian', helpers: ['Aljun', 'Kenneth'], vehicle: 'Blue 4x4 MD', plate: 'CCK8810' },
  { id: 'TRK-09', driver: 'Christian', helpers: ['Jerico', '—'], vehicle: 'HOWO DT', plate: 'NHE5123' },
  { id: 'TRK-10', driver: 'Dennis', helpers: ['Roderick', '—'], vehicle: 'Yellow MD', plate: 'CCP1625' },
  { id: 'TRK-11', driver: 'Edmar', helpers: ['Aljun', 'Kenneth'], vehicle: 'White 4x4 MD', plate: 'CBR1765' },
  { id: 'TRK-12', driver: 'Romel', helpers: ['Joshua', '—'], vehicle: 'Boom Truck', plate: 'CCP2554' },
  { id: 'TRK-13', driver: 'Sonny', helpers: ['Tantan', '—'], vehicle: 'Barako Tricycle', plate: '0524DL' },
];

// Every real pahinante name across all crews — the pool a Checker can pick a
// substitute helper from when a crew's regular helper isn't working that day.
export const ALL_HELPERS = [...new Set(CREWS.flatMap(c => c.helpers).filter(h => h !== '—'))].sort();

export const RATES_INIT = [
  { cat: 'Aggregates (Elf)', unit: 'trip', s: [15, 70], d: [30, 140] },
  { cat: 'Aggregates (Mini Dump)', unit: 'trip', s: [20, 60], d: [40, 120] },
  { cat: 'CHB (Hollow Blocks)', unit: 'piece', s: [0.04, 0.12], d: [0.08, 0.24] },
  { cat: 'Cement / Adhesive / Boral / Skimcoat / Sand', unit: 'bag', s: [0.50, 0.75], d: [1.00, 1.50] },
  { cat: 'Steel / Wood / Plywood / Pipe / Roofing', unit: 'piece', s: [0.50, 0.50], d: [1.00, 1.00] },
  { cat: 'Tiles 60×60', unit: 'box', s: [1.00, 1.00], d: [2.00, 2.00] },
  { cat: 'Tiles 30×60', unit: 'box', s: [0.75, 1.00], d: [0.75, 2.00] },
  { cat: 'Tiles 40×40 & 30×30', unit: 'box', s: [0.50, 0.50], d: [1.00, 1.00] },
  { cat: 'Ceiling Panel', unit: 'box', s: [0.50, 0.50], d: [1.00, 1.00] },
];

// Named barangays/sitios that qualify for the DOBLE (double) piece-rate, taken
// directly from the "DOBLE" sheet in the client's real TRUCK_PAYROLL.xlsx.
export const DOBLE_AREAS = [
  'Estrellang Langit', 'Balanoy', 'Bauan', 'Tulo Laurel', 'Gulod Bagalangit', 'Orense',
  'Laurel', 'Malagaklak Ligaya', 'Matala Gulugod', 'Panay', 'Malimatoc 2', 'Guitisan San Teodoro',
  'Yong Yong Malimatoc 2', 'Hulo Solo', 'Mainit', 'Kina Piolo Pascual', 'Nagiba',
  'Nangkaan San Teodoro', 'Sta Monica Nagiba', 'Pang Akle', 'Sampalucan',
];

export const DELIVERIES_INIT = {
  'TRK-01': { date: 'Jul 14, 2026', items: [
    { seq: 1, address: 'Balagbag', customer: 'Nilo Canson', item: 'Aggregates', qty: 0.5, unit: 'mini dump', d: 10, h: 30, dbl: false },
    { seq: null, address: '', customer: '', item: 'CHB', qty: 150, unit: 'piece', d: 6, h: 18, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 15, unit: 'bag', d: 7.5, h: 11.25, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 17, unit: 'piece', d: 8.5, h: 8.5, dbl: false },
    { seq: null, address: '', customer: '', item: 'Tiles 60×60', qty: 9, unit: 'box', d: 9, h: 9, dbl: false },
    { seq: 2, address: 'Boomtown', customer: 'Trebor Salayog', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 40, h: 120, dbl: true },
    { seq: null, address: 'San Francisco', customer: 'Bryan Panopio', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 60, unit: 'piece', d: 30, h: 30, dbl: false },
    { seq: null, address: 'Central', customer: 'Oliver Villanueva', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 24, unit: 'piece', d: 12, h: 12, dbl: false },
    { seq: 3, address: 'Sto. Niño', customer: 'Venus Dapoc', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 30, unit: 'bag', d: 15, h: 22.5, dbl: false },
    { seq: 4, address: 'Balagbag', customer: 'Jun Del Espiritu', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 70, unit: 'bag', d: 35, h: 52.5, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 20, unit: 'piece', d: 10, h: 10, dbl: false },
    { seq: 5, address: 'Malimatoc II', customer: 'Pabling Maranan', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 40, h: 120, dbl: true },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 14, unit: 'piece', d: 7, h: 7, dbl: false },
    { seq: 6, address: 'Mailayin', customer: 'Lorelie Bautista', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 20, unit: 'bag', d: 10, h: 15, dbl: false },
  ], kaltas: [] },
  'TRK-02': { date: 'Jul 14, 2026', items: [
    { seq: 1, address: 'Bagalangit', customer: 'Nick Maliglig', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 80, unit: 'piece', d: 40, h: 40, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 15, unit: 'bag', d: 7.5, h: 11.25, dbl: false },
    { seq: 2, address: 'Balagbag', customer: 'Jeffrey Bunquin', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: 'San Teodoro', customer: 'Dive Solana', item: 'CHB', qty: 100, unit: 'piece', d: 4, h: 12, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 3, unit: 'bag', d: 1.5, h: 2.25, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 21, unit: 'piece', d: 10.5, h: 10.5, dbl: false },
    { seq: null, address: '', customer: 'Altamare Dive and Leisure', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 6, unit: 'piece', d: 3, h: 3, dbl: false },
    { seq: 3, address: 'Bypass', customer: 'Doming Dalisay', item: 'Aggregates', qty: 0.5, unit: 'mini dump', d: 20, h: 60, dbl: true },
    { seq: null, address: '', customer: '', item: 'CHB', qty: 250, unit: 'piece', d: 20, h: 60, dbl: true },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 20, unit: 'piece', d: 10, h: 10, dbl: false },
    { seq: 4, address: 'San Teodoro', customer: 'Michelle Villo', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 10, unit: 'piece', d: 5, h: 5, dbl: false },
    { seq: null, address: 'Baletian', customer: 'Sheila Roxas', item: 'Ceiling Panel', qty: 1, unit: 'box', d: 0.5, h: 0.5, dbl: false },
    { seq: 5, address: 'San Jose', customer: 'Arch. Akira', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
  ], kaltas: [{ who: 'Elmer (helper)', d: 100, h: 100 }] },
  'TRK-03': { date: 'Jul 14, 2026', items: [
    { seq: 1, address: 'San Pascual', customer: 'Esming Permijo', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 40, h: 120, dbl: true },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 30, unit: 'bag', d: 15, h: 22.5, dbl: false },
    { seq: 2, address: 'Bangka-Talaga', customer: 'Catalino Binay', item: 'CHB', qty: 200, unit: 'piece', d: 8, h: 24, dbl: false },
    { seq: null, address: '', customer: 'Rizalino Abante', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 6, unit: 'piece', d: 3, h: 3, dbl: false },
    { seq: null, address: '', customer: 'Maricris Cuasay', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 7, unit: 'piece', d: 3.5, h: 3.5, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 2, unit: 'bag', d: 1, h: 1.5, dbl: false },
    { seq: null, address: '', customer: 'Segundo Albania', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 1, unit: 'piece', d: 0.5, h: 0.5, dbl: false },
    { seq: null, address: '', customer: 'Dhess Balog', item: 'CHB', qty: 30, unit: 'piece', d: 1.2, h: 3.6, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 3, unit: 'bag', d: 1.5, h: 2.25, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 15, unit: 'piece', d: 7.5, h: 7.5, dbl: false },
    { seq: 3, address: 'Malimatoc II', customer: 'Pabling Maranan', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 40, h: 120, dbl: true },
    { seq: null, address: 'Sto. Tomas', customer: 'Nene Aspi', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 6, unit: 'bag', d: 3, h: 4.5, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 34, unit: 'piece', d: 17, h: 17, dbl: false },
    { seq: null, address: '', customer: '', item: 'Tiles 60×60', qty: 2, unit: 'box', d: 2, h: 2, dbl: false },
    { seq: 4, address: 'Panay', customer: 'Tyron Delizo', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 40, h: 120, dbl: true },
    { seq: null, address: 'Pasabay', customer: 'Mark Castillo', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 100, unit: 'piece', d: 50, h: 50, dbl: false },
    { seq: 5, address: 'Mainaga', customer: 'Aljun De La Vega', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
  ], kaltas: [] },
  'TRK-05': { date: 'Jul 14, 2026', items: [
    { seq: 1, address: 'San Jose', customer: 'Mark Castillo', item: 'Aggregates', qty: 0.5, unit: 'mini dump', d: 10, h: 30, dbl: false },
    { seq: null, address: '', customer: '', item: 'CHB', qty: 270, unit: 'piece', d: 10.8, h: 32.4, dbl: false },
    { seq: 2, address: 'San Jose', customer: 'Mark Castillo', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 20, unit: 'bag', d: 10, h: 15, dbl: false },
    { seq: 3, address: 'Bangka-Talaga', customer: 'Catalino Binay', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 100, unit: 'bag', d: 50, h: 75, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 1, unit: 'piece', d: 0.5, h: 0.5, dbl: false },
    { seq: null, address: '', customer: 'Bryan Casa', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 10, unit: 'bag', d: 5, h: 7.5, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 11, unit: 'piece', d: 5.5, h: 5.5, dbl: false },
    { seq: 4, address: 'Bagalangit', customer: 'Nick Maliglig', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 140, unit: 'piece', d: 70, h: 70, dbl: false },
    { seq: 5, address: 'Sta. Ana', customer: 'Anabel Matira', item: 'CHB', qty: 400, unit: 'piece', d: 16, h: 48, dbl: false },
    { seq: null, address: 'Sampaguita', customer: 'Lily Banta', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 20, unit: 'piece', d: 10, h: 10, dbl: false },
    { seq: 6, address: 'Pulang Lupa', customer: 'Willie Magsino', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 5, unit: 'piece', d: 2.5, h: 2.5, dbl: false },
    { seq: null, address: 'Talaga East', customer: 'Myrna Espiritu', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 3, unit: 'piece', d: 1.5, h: 1.5, dbl: false },
  ], kaltas: [{ who: 'No-name receipt penalty', d: 10, h: 20 }] },
  'TRK-10': { date: 'Jun 12, 2026', items: [
    { seq: 1, address: 'Bangka-Talaga', customer: 'Porfing Evangelista', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 3, unit: 'piece', d: 1.5, h: 1.5, dbl: false },
    { seq: null, address: 'Mulo', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 10, unit: 'bag', d: 5, h: 7.5, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 15, unit: 'piece', d: 7.5, h: 7.5, dbl: false },
    { seq: 2, address: 'Mainit', customer: 'Derek Flores', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 40, h: 120, dbl: true },
    { seq: null, address: 'Talaga East', customer: 'Nilo Espiritu', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 31, unit: 'piece', d: 15.5, h: 15.5, dbl: false },
    { seq: 3, address: 'San Teodoro', customer: 'Naty Marciano', item: 'Aggregates', qty: 1, unit: 'mini dump', d: 20, h: 60, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 20, unit: 'bag', d: 10, h: 15, dbl: false },
    { seq: 4, address: 'Bagalangit', customer: 'Stefhanie Mendez', item: 'Aggregates', qty: 0.75, unit: 'mini dump', d: 15, h: 45, dbl: false },
    { seq: null, address: '', customer: '', item: 'CHB', qty: 200, unit: 'piece', d: 8, h: 24, dbl: false },
    { seq: null, address: '', customer: '', item: 'Cement / Adhesive / Boral / Skimcoat / Sand', qty: 15, unit: 'bag', d: 7.5, h: 11.25, dbl: false },
    { seq: null, address: '', customer: '', item: 'Steel / Wood / Plywood / Pipe / Roofing', qty: 40, unit: 'piece', d: 20, h: 20, dbl: false },
  ], kaltas: [] },
};
export const DRIVER_DAILY = 280, HELPER_DAILY = 480, BONUS_HEAD = 100, BONUS_TRIPS = 5;

// ---- Daily Time Record data (cutoff: May 1–15, 2026) ----------------------
// Real biometric figures for the 5 employees captured in the client's actual
// DTR screenshot (Ernesto, Castillo, Genova, Reyes, Bantoy). Everyone else
// gets a stable, employee-specific approximation — previously every employee
// showed the exact same 15 rows, which wasn't just wrong, it made the whole
// drill-down look faked.
export const DTR_DATES = ['05-01', '05-02', '05-03', '05-04', '05-05', '05-06', '05-07', '05-08', '05-09', '05-10', '05-11', '05-12', '05-13', '05-14', '05-15'];
export const DTR_DAYS = ['Fr', 'Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];

// [timeIn, timeOut, lateMins, otMins, absent]
export const REAL_DTR = {
  'EMP-002': [ // Ernesto, Girlie A.
    ['6:40', '21:12', 0, 252, false], ['6:44', '17:00', 4, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:00', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:45', 0, 45, false],
    ['6:52', '12:00', 12, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['7:09', '17:00', 29, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '12:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
  ],
  'EMP-003': [ // Castillo, April Rose H.
    ['6:40', '17:05', 0, 5, false], ['6:43', '17:00', 3, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '18:30', 0, 90, false], ['6:40', '17:30', 0, 30, false],
    ['6:40', '12:00', 0, 0, false], ['—', '—', 0, 0, true], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '12:00', 0, 0, false], ['6:52', '17:00', 12, 0, false],
  ],
  'EMP-004': [ // Genova, Jaclyn Joyce C.
    ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:15', 0, 15, false],
    ['6:40', '12:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['—', '—', 0, 0, true],
    ['6:40', '17:00', 0, 0, false], ['6:55', '17:00', 15, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '12:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
  ],
  'EMP-005': [ // Reyes, Ma. Christine B.
    ['6:00', '17:00', 0, 0, false], ['6:00', '17:00', 0, 0, false], ['6:00', '18:00', 0, 60, false],
    ['6:00', '17:00', 0, 0, false], ['6:00', '17:00', 0, 0, false], ['6:00', '17:30', 0, 30, false],
    ['6:00', '12:00', 0, 0, false], ['6:00', '17:00', 0, 0, false], ['6:00', '17:00', 0, 0, false],
    ['6:00', '17:00', 0, 0, false], ['6:00', '17:00', 0, 0, false], ['6:00', '17:00', 0, 0, false],
    ['6:00', '17:00', 0, 0, false], ['6:00', '12:00', 0, 0, false], ['6:02', '17:00', 2, 0, false],
  ],
  'EMP-008': [ // Bantoy, Lovely Joy A.
    ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '12:00', 0, 0, false], ['—', '—', 0, 0, true], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
    ['6:40', '17:00', 0, 0, false], ['6:40', '12:00', 0, 0, false], ['6:40', '17:00', 0, 0, false],
  ],
};


export const IMPORT_HISTORY_INIT = [
  { date: 'May 16, 2026', file: 'biometric_may1-15.xls', count: 13, status: 'Success' },
  { date: 'May 1, 2026', file: 'biometric_apr16-30.xls', count: 13, status: 'Success' },
  { date: 'Apr 16, 2026', file: 'biometric_apr1-15.xls', count: 12, status: 'Success' },
];

export const PAYROLL_TREND = [
  { mo: 'Mar 16–31', payroll: 82450 }, { mo: 'Apr 1–15', payroll: 78900 }, { mo: 'Apr 16–30', payroll: 85200 },
  { mo: 'May 1–15', payroll: 79600 }, { mo: 'May 16–31', payroll: 88300 }, { mo: 'Jun 1–15', payroll: 65738 },
];

// Current cutoff label — shared by the Dashboard snapshot and the Staff payslips.
export const CUTOFF_LABEL = 'May 16–31, 2026';

// ---- Statutory deduction tables (admin-editable in Settings → Statutory Deductions) ----
// These aren't just reference text anymore — computeStaffPayroll actually looks values up
// from these tables, so editing them here changes real payslip numbers going forward.

// SSS: employee-share brackets by declared monthly salary (ported from the official SSS
// contribution schedule). The last row has ceiling:null — it's the "and up" catch-all.
export const SSS_TABLE_INIT = [
  { ceiling: 4250, share: 135 }, { ceiling: 4750, share: 157.5 }, { ceiling: 5250, share: 180 },
  { ceiling: 5750, share: 202.5 }, { ceiling: 6250, share: 225 }, { ceiling: 6750, share: 247.5 },
  { ceiling: 7250, share: 270 }, { ceiling: 7750, share: 292.5 }, { ceiling: 8250, share: 315 },
  { ceiling: 8750, share: 337.5 }, { ceiling: 9250, share: 360 }, { ceiling: 9750, share: 382.5 },
  { ceiling: 10250, share: 405 }, { ceiling: 10750, share: 427.5 }, { ceiling: 11250, share: 450 },
  { ceiling: 11750, share: 472.5 }, { ceiling: 12250, share: 495 }, { ceiling: 12750, share: 517.5 },
  { ceiling: 13250, share: 540 }, { ceiling: 13750, share: 562.5 }, { ceiling: 14250, share: 585 },
  { ceiling: 14750, share: 607.5 }, { ceiling: 15250, share: 630 }, { ceiling: 15750, share: 652.5 },
  { ceiling: 16250, share: 675 }, { ceiling: 16750, share: 697.5 }, { ceiling: 17250, share: 720 },
  { ceiling: 17750, share: 742.5 }, { ceiling: 18250, share: 765 }, { ceiling: 18750, share: 787.5 },
  { ceiling: 19250, share: 810 }, { ceiling: 19750, share: 832.5 }, { ceiling: 20250, share: 855 },
  { ceiling: null, share: 900 },
];
// PhilHealth: flat % of declared salary (clamped to floor/ceiling), split 50/50 employer/employee.
export const PHILHEALTH_INIT = { rate: 5, floor: 10000, ceiling: 100000 };
// Pag-IBIG (HDMF): % of salary by bracket, capped. Second bracket has ceiling:null ("and up").
export const PAGIBIG_INIT = { brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }], cap: 200 };
// BIR TRAIN law withholding brackets — editable for reference; not yet wired into an actual
// withholding-tax deduction line, since all current staff fall under the exempt threshold.
export const BIR_TABLE_INIT = [
  { over: 0, notOver: 250000, base: 0, rate: 0 },
  { over: 250000, notOver: 400000, base: 0, rate: 15 },
  { over: 400000, notOver: 800000, base: 22500, rate: 20 },
  { over: 800000, notOver: 2000000, base: 102500, rate: 25 },
  { over: 2000000, notOver: 8000000, base: 402500, rate: 30 },
  { over: 8000000, notOver: null, base: 2202500, rate: 35 },
];


export const LOANS_INIT = [
  { id: 'LN-1', person: 'Arnold', role: 'Driver · TRK-02', type: 'Cash Advance (Bali)', principal: 1000, perCutoff: 100, paused: false,
    entries: [
      { date: 'Jun 20, 2026', type: 'grant', amount: 1000, remark: 'Granted' },
      { date: 'Jul 08, 2026', type: 'deduction', amount: 100, remark: 'Bali' },
      { date: 'Jul 10, 2026', type: 'deduction', amount: 150, remark: 'Wifi' },
      { date: 'Jul 13, 2026', type: 'deduction', amount: 100, remark: 'Gasul' },
    ] },
  { id: 'LN-2', person: 'Elmer', role: 'Pahinante · TRK-02', type: 'Cash Advance', principal: 500, perCutoff: 100, paused: false,
    entries: [
      { date: 'Jul 05, 2026', type: 'grant', amount: 500, remark: 'Granted' },
      { date: 'Jul 14, 2026', type: 'deduction', amount: 100, remark: 'Daily micro-deduction' },
    ] },
  { id: 'LN-3', person: 'Ruel', role: 'Driver · TRK-05', type: 'School Allowance', principal: 1000, perCutoff: 150, paused: true,
    entries: [
      { date: 'Jun 20, 2026', type: 'grant', amount: 1000, remark: 'Granted' },
      { date: 'Jul 02, 2026', type: 'deduction', amount: 300, remark: 'Running deduction' },
    ] },
];
// The running balance IS the ledger — computed from entries, never stored separately, so it
// can't quietly drift out of sync the way a hand-maintained "balance" field could.

export const CHECKERS_INIT = [{ id: 'CHK-01', name: 'General dispatch access (all trucks)', user: 'checker01' }];

/* ============================= ATOMS ============================= */

export const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'employees', label: 'Employees', icon: Users },
  { key: 'attendance', label: 'Attendance', icon: Clock },
  { key: 'truck', label: 'Truck Payroll', icon: Truck },
  { key: 'staff', label: 'Staff Payroll', icon: FileText },
  { key: 'loans', label: 'Loans', icon: Wallet },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];
