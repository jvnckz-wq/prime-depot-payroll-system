'use client';
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  LayoutDashboard, Users, Clock, Truck, Wallet, Settings as SettingsIcon,
  FileText, LogOut, AlertTriangle, Plus, Search, Package, Fingerprint,
  ClipboardList, ShieldCheck, ArrowLeft, Pause, Play, Lock, X, Check,
  Printer, Edit2, Save, Trash2, Download, TrendingUp,
  UserPlus, BarChart3, Star, Eye, Repeat, MapPin
} from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

/* ============================= DESIGN TOKENS ============================= */
// Prime Depot red identity. The brand crimson (#B51318 — the actual shop color) is the
// system's primary accent, replacing the old amber. `amber` is kept as a NAMED token but
// repurposed as the warning/attention/palima tone so hierarchy survives (not everything is
// red). Blue is retired: `blue`/`blueBg` now alias neutral slate so any leftover callers stay
// legible without introducing a competing hue.
const T = {
  bg: '#F6F4F3', surface: '#FFFFFF', ink: '#1B2430', soft: '#5B6472',
  line: '#DED9D7', lineSoft: '#ECE7E5',
  // primary brand accent (was amber) — used for buttons, active nav, links, NET SALARY
  amber: '#B51318', amberBg: '#FBE9E8',
  brand: '#B51318', brandDark: '#8E0F14', brandBg: '#FBE9E8',
  // warning / attention / absent / palima bonus
  warn: '#B5701C', warnBg: '#FBF1E2',
  green: '#3E6350', greenBg: '#E7F0E9',
  // 'blue' retired -> neutral slate alias (kept so existing references remain valid)
  blue: '#5B6472', blueBg: '#EEEBE9',
  red: '#A6402F', redBg: '#F6E7E4',
  sidebar: '#8E0F14', sidebarLine: 'rgba(255,255,255,0.14)', sidebarSoft: '#E7B4B6',
};
const F_HEAD = "'IBM Plex Sans Condensed', sans-serif";
const F_BODY = "'IBM Plex Sans', sans-serif";
const F_MONO = "'IBM Plex Mono', monospace";
const FONTS = "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = () => Math.random().toString(36).slice(2, 9);

function exportXLSX(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

function flattenDeliveries(deliveries, filterCrewId) {
  const out = [];
  Object.entries(deliveries).forEach(([crewId, log]) => {
    log.items.filter(i => i.seq).forEach(i => out.push({ crewId, ...i, date: log.date }));
  });
  return filterCrewId ? out.filter(t => t.crewId === filterCrewId) : out;
}

// shared payroll math so the Payslip list, the individual slip, and Reports always agree
function computeStaffPayroll(e, loans = [], statutory) {
  const days = 11;
  const gross = e.rate * days;
  const otWeekday = 472.14, otWeekend = 113.75, allowance = 4400;
  const ot = otWeekday + otWeekend;
  const sss = e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) : 0;
  const phic = e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) : 0;
  const hdmf = e.piOn ? (computePagIBIG(e.declaredSalary, statutory.pagibig) + (e.mp2 || 0)) : 0;
  // What THIS cutoff would deduct across this employee's active, unpaused loans — a live
  // preview, same as the rest of this payslip. The actual ledger entry only gets written
  // when "Apply Cutoff Deductions" is clicked on the Staff Payroll page.
  const advance = loans.filter(l => l.person === e.name && !l.paused && loanBalance(l) > 0)
    .reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const tardiness = 0;
  const totalEarnings = gross + ot + allowance;
  const totalDeductions = sss + phic + hdmf + advance + tardiness;
  const net = totalEarnings - totalDeductions;
  return { days, gross, otWeekday, otWeekend, ot, allowance, sss, phic, hdmf, advance, tardiness, totalEarnings, totalDeductions, net };
}

// deterministic pseudo-random per employee, so charts are stable across renders
function seedRand(seed) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
// Position-sensitive string hash — a plain character-code sum would treat 'EMP-001' and
// 'EMP-010' as the same seed (same characters, different order), producing identical
// generated data for two different employees.
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}
function genAttendanceHistory(empId) {
  const seed = hashStr(empId) * 97 + 13;
  const rand = seedRand(seed);
  const cutoffs = ['Feb 16–28', 'Mar 1–15', 'Mar 16–31', 'Apr 1–15', 'Apr 16–30', 'May 1–15'];
  return cutoffs.map(c => {
    const absent = Math.floor(rand() * 2.4);
    const present = 13 - absent;
    const late = Math.floor(rand() * 50);
    const daysLate = late > 0 ? Math.max(1, Math.floor(late / 18)) : 0;
    const ot = Math.floor(rand() * 90);
    return { cutoff: c, present, absent, late, daysLate, ot };
  });
}

/* ============================= SEED DATA ============================= */
const STAFF_INIT = [
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

const CREWS = [
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
const ALL_HELPERS = [...new Set(CREWS.flatMap(c => c.helpers).filter(h => h !== '—'))].sort();

const RATES_INIT = [
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
const DOBLE_AREAS = [
  'Estrellang Langit', 'Balanoy', 'Bauan', 'Tulo Laurel', 'Gulod Bagalangit', 'Orense',
  'Laurel', 'Malagaklak Ligaya', 'Matala Gulugod', 'Panay', 'Malimatoc 2', 'Guitisan San Teodoro',
  'Yong Yong Malimatoc 2', 'Hulo Solo', 'Mainit', 'Kina Piolo Pascual', 'Nagiba',
  'Nangkaan San Teodoro', 'Sta Monica Nagiba', 'Pang Akle', 'Sampalucan',
];
function matchDobleArea(address) {
  if (!address || !address.trim()) return null;
  const a = address.trim().toLowerCase();
  return DOBLE_AREAS.find(area => a.includes(area.toLowerCase()) || area.toLowerCase().includes(a)) || null;
}

const DELIVERIES_INIT = {
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
const DRIVER_DAILY = 280, HELPER_DAILY = 480, BONUS_HEAD = 100, BONUS_TRIPS = 5;

// ---- Daily Time Record data (cutoff: May 1–15, 2026) ----------------------
// Real biometric figures for the 5 employees captured in the client's actual
// DTR screenshot (Ernesto, Castillo, Genova, Reyes, Bantoy). Everyone else
// gets a stable, employee-specific approximation — previously every employee
// showed the exact same 15 rows, which wasn't just wrong, it made the whole
// drill-down look faked.
const DTR_DATES = ['05-01', '05-02', '05-03', '05-04', '05-05', '05-06', '05-07', '05-08', '05-09', '05-10', '05-11', '05-12', '05-13', '05-14', '05-15'];
const DTR_DAYS = ['Fr', 'Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];

// [timeIn, timeOut, lateMins, otMins, absent]
const REAL_DTR = {
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

function buildDtrRows(empId) {
  const real = REAL_DTR[empId];
  if (real) {
    return real.map(([tIn, tOut, late, ot, absent], i) => ({ date: DTR_DATES[i], day: DTR_DAYS[i], in: tIn, out: tOut, late, ot, absent }));
  }
  // Deterministic per-employee approximation for staff without a captured screenshot —
  // stable across renders, but distinct from every other employee's pattern.
  const seed = hashStr(empId) * 53 + 7;
  const rand = seedRand(seed);
  return DTR_DATES.map((date, i) => {
    const day = DTR_DAYS[i];
    if (day === 'Su') return { date, day, in: '6:40', out: '12:00', late: 0, ot: 0, absent: false };
    if (rand() < 0.05) return { date, day, in: '—', out: '—', late: 0, ot: 0, absent: true };
    const late = rand() < 0.18 ? Math.floor(rand() * 20) + 1 : 0;
    const ot = rand() < 0.15 ? Math.floor(rand() * 60) + 15 : 0;
    const fmt = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    return { date, day, in: fmt(400 + late), out: fmt(1020 + ot), late, ot, absent: false };
  });
}

function summarizeDtr(empId) {
  const rows = buildDtrRows(empId);
  return {
    daysLate: rows.filter(r => r.late > 0).length,
    late: rows.reduce((s, r) => s + r.late, 0),
    ot: rows.reduce((s, r) => s + r.ot, 0),
    absent: rows.filter(r => r.absent).length,
  };
}

const IMPORT_HISTORY_INIT = [
  { date: 'May 16, 2026', file: 'biometric_may1-15.xls', count: 13, status: 'Success' },
  { date: 'May 1, 2026', file: 'biometric_apr16-30.xls', count: 13, status: 'Success' },
  { date: 'Apr 16, 2026', file: 'biometric_apr1-15.xls', count: 12, status: 'Success' },
];

const PAYROLL_TREND = [
  { mo: 'Mar 16–31', payroll: 82450 }, { mo: 'Apr 1–15', payroll: 78900 }, { mo: 'Apr 16–30', payroll: 85200 },
  { mo: 'May 1–15', payroll: 79600 }, { mo: 'May 16–31', payroll: 88300 }, { mo: 'Jun 1–15', payroll: 65738 },
];

// Current cutoff label — shared by the Dashboard snapshot and the Staff payslips.
const CUTOFF_LABEL = 'May 16–31, 2026';

// ---- Statutory deduction tables (admin-editable in Settings → Statutory Deductions) ----
// These aren't just reference text anymore — computeStaffPayroll actually looks values up
// from these tables, so editing them here changes real payslip numbers going forward.

// SSS: employee-share brackets by declared monthly salary (ported from the official SSS
// contribution schedule). The last row has ceiling:null — it's the "and up" catch-all.
const SSS_TABLE_INIT = [
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
const PHILHEALTH_INIT = { rate: 5, floor: 10000, ceiling: 100000 };
// Pag-IBIG (HDMF): % of salary by bracket, capped. Second bracket has ceiling:null ("and up").
const PAGIBIG_INIT = { brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }], cap: 200 };
// BIR TRAIN law withholding brackets — editable for reference; not yet wired into an actual
// withholding-tax deduction line, since all current staff fall under the exempt threshold.
const BIR_TABLE_INIT = [
  { over: 0, notOver: 250000, base: 0, rate: 0 },
  { over: 250000, notOver: 400000, base: 0, rate: 15 },
  { over: 400000, notOver: 800000, base: 22500, rate: 20 },
  { over: 800000, notOver: 2000000, base: 102500, rate: 25 },
  { over: 2000000, notOver: 8000000, base: 402500, rate: 30 },
  { over: 8000000, notOver: null, base: 2202500, rate: 35 },
];

function computeSSS(monthlySalary, table) {
  if (!monthlySalary || monthlySalary <= 0 || !table.length) return 0;
  const bracket = table.find(b => b.ceiling !== null && monthlySalary < b.ceiling) || table[table.length - 1];
  return bracket.share / 2; // semi-monthly cutoff
}
function computePhilHealth(monthlySalary, ph) {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  const base = Math.max(ph.floor, Math.min(ph.ceiling, monthlySalary));
  return base * (ph.rate / 100) / 2 / 2; // 50/50 er/ee split, then ÷2 for the cutoff
}
function computePagIBIG(monthlySalary, pi) {
  if (!monthlySalary || monthlySalary <= 0 || !pi.brackets.length) return 0;
  const bracket = pi.brackets.find(b => b.ceiling !== null && monthlySalary <= b.ceiling) || pi.brackets[pi.brackets.length - 1];
  const monthly = Math.min(monthlySalary * (bracket.eePct / 100), pi.cap);
  return monthly / 2;
}

const LOANS_INIT = [
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
function loanBalance(loan) {
  return loan.entries.reduce((b, e) => e.type === 'grant' ? b + e.amount : b - e.amount, 0);
}
// Same entries, but each annotated with the balance immediately after it — for a bank-statement-style display.
function loanLedger(loan) {
  let running = 0;
  return loan.entries.map(e => {
    running = e.type === 'grant' ? running + e.amount : running - e.amount;
    return { ...e, runningBalance: running };
  });
}
const todayLabel = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const CHECKERS_INIT = [{ id: 'CHK-01', name: 'General dispatch access (all trucks)', user: 'checker01' }];

/* ============================= ATOMS ============================= */
const Badge = ({ children, tone = 'neutral' }) => {
  const map = {
    green: [T.greenBg, T.green], amber: [T.amberBg, T.amber],
    red: [T.redBg, T.red], blue: [T.blueBg, T.blue],
    neutral: [T.lineSoft, T.soft],
  };
  const [bg, fg] = map[tone];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
      style={{ backgroundColor: bg, color: fg, fontFamily: F_HEAD, letterSpacing: '0.04em' }}>
      {children}
    </span>
  );
};

const Money = ({ value, size = 'text-sm', bold = false, tone }) => (
  <span className={`${size} tabular-nums`} style={{ fontFamily: F_MONO, fontWeight: bold ? 600 : 400, color: tone || T.ink }}>
    {peso(value)}
  </span>
);

const Panel = ({ children, className = '', style = {} }) => (
  <div className={`rounded-md border ${className}`} style={{ backgroundColor: T.surface, borderColor: T.line, ...style }}>
    {children}
  </div>
);

const Eyebrow = ({ children }) => (
  <div className="text-xs font-semibold uppercase mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.08em' }}>
    {children}
  </div>
);

const H1 = ({ children, sub, action }) => (
  <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 className="text-2xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{children}</h1>
      {sub && <p className="text-sm mt-1" style={{ fontFamily: F_BODY, color: T.soft }}>{sub}</p>}
    </div>
    {action}
  </div>
);

const Th = ({ children, right = false, colSpan }) => (
  <th colSpan={colSpan} className={`text-xs font-semibold uppercase px-3 py-2 ${right ? 'text-right' : 'text-left'}`}
    style={{ fontFamily: F_HEAD, color: T.soft, borderBottom: `1px solid ${T.line}`, letterSpacing: '0.04em' }}>
    {children}
  </th>
);
const Td = ({ children, right = false, mono = false, colSpan, style = {} }) => (
  <td colSpan={colSpan} className={`px-3 py-2 text-sm ${right ? 'text-right' : 'text-left'}`}
    style={{ fontFamily: mono ? F_MONO : F_BODY, color: T.ink, borderBottom: `1px solid ${T.lineSoft}`, ...style }}>
    {children}
  </td>
);

const StatCard = ({ label, value, tone = 'neutral', icon: Icon }) => {
  const fg = { green: T.green, amber: T.amber, red: T.red, blue: T.blue, neutral: T.ink }[tone];
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between mb-2">
        <Eyebrow>{label}</Eyebrow>
        {Icon && <Icon size={16} color={T.soft} />}
      </div>
      <div className="text-2xl font-bold" style={{ fontFamily: F_MONO, color: fg }}>{value}</div>
    </Panel>
  );
};

const BigStat = ({ value, label, tone = T.ink }) => (
  <div className="text-center px-2">
    <div className="text-3xl font-bold leading-none tabular-nums" style={{ fontFamily: F_MONO, color: tone }}>{value}</div>
    <div className="text-xs mt-2 whitespace-nowrap font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>{label}</div>
  </div>
);

const Av = ({ name = '?', size = 32, tone = T.ink }) => {
  const initials = name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-white font-semibold"
      style={{ width: size, height: size, backgroundColor: tone, fontFamily: F_HEAD, fontSize: size * 0.36 }}>
      {initials || '?'}
    </div>
  );
};

const EmptyState = ({ icon: Icon = Package, title, desc, action }) => (
  <div className="text-center py-12 px-6">
    <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: T.lineSoft }}>
      <Icon size={20} color={T.soft} />
    </div>
    <div className="text-sm font-semibold mb-1" style={{ fontFamily: F_BODY, color: T.ink }}>{title}</div>
    {desc && <div className="text-xs max-w-xs mx-auto mb-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{desc}</div>}
    {action}
  </div>
);

const ProgressBar = ({ pct, tone = T.green }) => (
  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.lineSoft, width: 100 }}>
    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: tone }} />
  </div>
);

const Btn = ({ children, onClick, variant = 'dark', icon: Icon, size = 'md', disabled = false, full = false }) => {
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-2 text-sm' };
  const variants = {
    dark: { backgroundColor: T.ink, color: '#fff' },
    outline: { backgroundColor: 'transparent', color: T.ink, border: `1.5px solid ${T.line}` },
    amber: { backgroundColor: T.amber, color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: T.soft },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded font-semibold ${sizes[size]} ${full ? 'w-full justify-center' : ''}`}
      style={{ fontFamily: F_HEAD, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...variants[variant] }}>
      {Icon && <Icon size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
};

const Field = ({ label, children }) => (
  <div>
    {label && <Eyebrow>{label}</Eyebrow>}
    {children}
  </div>
);
const inputCls = "w-full px-3 py-2 rounded text-sm outline-none border";
const inputStyle = { fontFamily: F_BODY, borderColor: T.line, color: T.ink };

const Modal = ({ open, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(27,36,48,0.55)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full rounded-lg overflow-hidden flex flex-col" style={{ backgroundColor: T.surface, maxWidth: width, maxHeight: '88vh' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <span className="text-sm font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</span>
          <button onClick={onClose}><X size={16} color={T.soft} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

const Confirm = ({ open, onConfirm, onCancel, title, message, confirmLabel = 'Confirm', danger = false }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(27,36,48,0.55)' }}>
      <div className="w-full rounded-lg p-6" style={{ backgroundColor: T.surface, maxWidth: 360 }}>
        <div className="text-base font-bold mb-2" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</div>
        <div className="text-sm mb-5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{message}</div>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? 'amber' : 'dark'} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
};

const Toasts = ({ toasts }) => (
  <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2" style={{ maxWidth: 320 }}>
    {toasts.map(t => (
      <div key={t.id} className="px-4 py-3 rounded-md text-sm flex items-center gap-2 shadow-lg"
        style={{ fontFamily: F_BODY, backgroundColor: t.type === 'error' ? T.red : T.ink, color: '#fff' }}>
        {t.type === 'error' ? <X size={14} /> : <Check size={14} />} {t.msg}
      </div>
    ))}
  </div>
);

/* ============================= NAV ============================= */
const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'employees', label: 'Employees', icon: Users },
  { key: 'attendance', label: 'Attendance', icon: Clock },
  { key: 'truck', label: 'Truck Payroll', icon: Truck },
  { key: 'staff', label: 'Staff Payroll', icon: FileText },
  { key: 'loans', label: 'Loans', icon: Wallet },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

const Sidebar = ({ tab, setTab, onLogout }) => (
  <div className="hidden md:flex flex-col w-56 shrink-0 h-full" style={{ backgroundColor: T.sidebar }}>
    <div className="px-5 py-5" style={{ borderBottom: `1px solid ${T.sidebarLine}` }}>
      <div className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.08em' }}>Prime Depot</div>
      <div className="text-lg font-bold text-white" style={{ fontFamily: F_HEAD }}>Payroll System</div>
    </div>
    <div className="flex-1 py-3 overflow-y-auto">
      {ADMIN_NAV.map(item => {
        const active = tab === item.key;
        const Icon = item.icon;
        return (
          <button key={item.key} onClick={() => setTab(item.key)}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left"
            style={{
              fontFamily: F_BODY, fontWeight: active ? 600 : 400,
              color: active ? '#FFFFFF' : T.sidebarSoft,
              backgroundColor: active ? 'rgba(0,0,0,0.22)' : 'transparent',
              borderLeft: active ? '3px solid #FFFFFF' : '3px solid transparent',
            }}>
            <Icon size={16} />
            {item.label}
          </button>
        );
      })}
    </div>
    <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.sidebarLine}` }}>
      <button onClick={onLogout} className="w-full flex items-center gap-2 text-sm" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
        <LogOut size={15} /> Log out
      </button>
    </div>
  </div>
);

const TopBar = ({ title, role, cutoff }) => (
  <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${T.line}`, backgroundColor: T.surface }}>
    <div className="text-base font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</div>
    <div className="flex items-center gap-3">
      <Badge tone="blue">Cutoff {cutoff}</Badge>
      <Badge tone={role === 'admin' ? 'green' : 'amber'}>{role === 'admin' ? 'Operations Head' : 'Checker'}</Badge>
    </div>
  </div>
);

/* ============================= LOGIN ============================= */
const LoginView = ({ onLogin }) => {
  const [u, setU] = useState(''); const [p, setP] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.sidebar }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ backgroundColor: '#fff' }}>
            <Fingerprint size={24} color={T.brand} />
          </div>
          <div className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.1em' }}>Prime Depot Hardware & Construction Supply</div>
          <div className="text-2xl font-bold text-white mt-1" style={{ fontFamily: F_HEAD }}>Payroll System</div>
        </div>
        <Panel className="p-6" style={{ backgroundColor: T.surface, borderColor: T.line }}>
          <Eyebrow>Employee ID</Eyebrow>
          <input value={u} onChange={e => setU(e.target.value)} placeholder="e.g. EMP-001"
            className="w-full mb-4 px-3 py-2 rounded text-sm outline-none border" style={{ fontFamily: F_BODY, backgroundColor: T.surface, borderColor: T.line, color: T.ink }} />
          <Eyebrow>Password</Eyebrow>
          <div className="relative mb-6">
            <input value={p} onChange={e => setP(e.target.value)} type="password" placeholder="••••••••"
              className="w-full px-3 py-2 rounded text-sm outline-none border" style={{ fontFamily: F_BODY, backgroundColor: T.surface, borderColor: T.line, color: T.ink }} />
            <Lock size={14} className="absolute right-3 top-3" color={T.soft} />
          </div>
          <p className="text-xs mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
            No public sign-up. Accounts are created only by the Operations Head, from Settings → Account Access.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => onLogin('admin')} className="w-full py-2.5 rounded text-sm font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff' }}>
              Continue as Operations Head
            </button>
            <button onClick={() => onLogin('checker')} className="w-full py-2.5 rounded text-sm font-semibold border" style={{ fontFamily: F_HEAD, borderColor: T.line, color: T.ink }}>
              Continue as Checker
            </button>
          </div>
        </Panel>
        <p className="text-center text-xs mt-4" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>Frontend prototype — role buttons stand in for real authentication.</p>
      </div>
    </div>
  );
};

/* ============================= DASHBOARD ============================= */
const DashboardView = ({ deliveries, staff = [], loans = [], statutory, setTab }) => {
  const loggedToday = Object.keys(deliveries).length;
  const deliveriesLogged = useMemo(() => flattenDeliveries(deliveries).length, [deliveries]);

  // Net pay this cutoff — sum of every staff payslip's net, using the same shared math the
  // Staff Payroll page uses, so the headline number always agrees with the payslips.
  const netThisCutoff = useMemo(
    () => staff.reduce((s, e) => s + computeStaffPayroll(e, loans, statutory).net, 0),
    [staff, loans, statutory]
  );
  // Active loans & advances — total outstanding balance across every unpaid ledger.
  const activeLoans = useMemo(() => loans.reduce((s, l) => s + Math.max(0, loanBalance(l)), 0), [loans]);
  const activeLoanCount = loans.filter(l => loanBalance(l) > 0).length;

  // Per-cutoff attendance mix (Present / Late / Absent), aggregated across all staff.
  const attendanceData = useMemo(() => {
    const buckets = ['Apr 1–15', 'Apr 16–30', 'May 1–15', 'May 16–31'];
    return buckets.map((label, idx) => {
      let present = 0, late = 0, absent = 0;
      staff.forEach(e => {
        const h = genAttendanceHistory(e.id);
        const row = h[h.length - 4 + idx] || h[idx] || {};
        present += row.present || 0; late += row.daysLate || 0; absent += row.absent || 0;
      });
      return { label, Present: present, Late: late, Absent: absent };
    });
  }, [staff]);

  // Payslip snapshot — first rows of the current staff payroll, matching the mockup table.
  const snapshot = useMemo(
    () => staff.map(e => { const c = computeStaffPayroll(e, loans, statutory); return { name: e.name, gross: c.gross, net: c.net }; }),
    [staff, loans, statutory]
  );

  const go = (t) => setTab && setTab(t);

  return (
    <div className="p-6">
      <H1 sub="Snapshot of headcount, this cutoff's payroll, deliveries, and outstanding advances.">Dashboard Overview</H1>

      {/* Top row: 4 stat cards + Attention Needed, mirroring the approved layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <StatCard label="Total Employees" value={staff.length + CREWS.length * 3} icon={Users} />
          <StatCard label="Net Pay This Cutoff" value={peso(netThisCutoff)} tone="amber" icon={Wallet} />
          <StatCard label="Deliveries Logged" value={deliveriesLogged} tone="green" icon={Truck} />
          <StatCard label="Active Loans & Advances" value={peso(activeLoans)} tone="amber" icon={FileText} />
        </div>
        <Panel className="p-4">
          <Eyebrow>Attention Needed</Eyebrow>
          <button onClick={() => go('attendance')} className="w-full text-left mt-2 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.warnBg }}>
            <AlertTriangle size={16} color={T.warn} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>Biometric ID #47 is unmapped</div>
              <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>3 log entries this week aren't linked to a registered employee.</div>
            </div>
          </button>
          {activeLoanCount > 0 && (
            <button onClick={() => go('loans')} className="w-full text-left mt-3 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.brandBg }}>
              <FileText size={16} color={T.brand} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{activeLoanCount} loan{activeLoanCount > 1 ? 's' : ''} awaiting cutoff deduction</div>
                <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>Review balances before releasing this cutoff's payroll.</div>
              </div>
            </button>
          )}
        </Panel>
      </div>

      {/* Payroll snapshot table + two charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel className="overflow-hidden">
          <div className="px-4 pt-4 pb-2"><Eyebrow>{CUTOFF_LABEL} · Payroll Snapshot</Eyebrow></div>
          <div className="overflow-x-auto" style={{ maxHeight: 360 }}>
            <table className="w-full">
              <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                <tr><Th>Employee</Th><Th right>Gross</Th><Th right>Net Pay</Th></tr>
              </thead>
              <tbody>
                {snapshot.map((r, i) => (
                  <tr key={i}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Av name={r.name} size={26} tone={T.brand} />
                        <span className="font-semibold text-sm" style={{ fontFamily: F_BODY }}>{r.name}</span>
                      </div>
                    </Td>
                    <Td right mono>{peso(r.gross)}</Td>
                    <Td right mono style={{ color: r.net < 0 ? T.red : T.ink, fontWeight: 600 }}>{peso(r.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            <Eyebrow>Attendance</Eyebrow>
            <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Present / Late / Absent · last 4 cutoffs</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={attendanceData} margin={{ left: -20, right: 5, top: 5, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: T.soft }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: F_BODY }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: F_BODY }} iconType="circle" iconSize={8} />
                <Bar dataKey="Present" fill={T.green} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Late" fill={T.brand} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Absent" fill={T.warn} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-1">
              <Eyebrow>Bi-monthly Payroll Cost</Eyebrow>
              <TrendingUp size={14} color={T.soft} />
            </div>
            <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Net salary released · last 6 cutoffs</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={PAYROLL_TREND} margin={{ left: -20, right: 5, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} vertical={false} />
                <XAxis dataKey="mo" tick={{ fontSize: 11, fill: T.soft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: T.soft }} axisLine={false} tickLine={false} tickFormatter={v => `₱${v / 1000}k`} />
                <Tooltip formatter={v => [peso(v), 'Payroll']} contentStyle={{ borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: F_BODY }} />
                <Line type="monotone" dataKey="payroll" stroke={T.brand} strokeWidth={2.5} dot={{ r: 3, fill: T.brand }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </div>
  );
};

/* ============================= EMPLOYEES ============================= */
const BLANK_EMP = { name: '', position: 'Administrative Staff', rate: '', declaredSalary: '', status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0 };

const EmployeesView = ({ staff, setStaff, toast }) => {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_EMP);
  const [confirm, setConfirm] = useState(null);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const crewRows = useMemo(() => [
    ...CREWS.map(c => ({ id: c.id + '-D', name: c.driver, position: 'Driver', rate: 800, status: 'Active', crew: true })),
    ...CREWS.flatMap(c => c.helpers.filter(h => h !== '—').map((h, j) => ({ id: c.id + '-H' + j, name: h, position: 'Pahinante (Helper)', rate: 240, status: 'Active', crew: true }))),
  ], []);

  const rows = useMemo(() => [...staff, ...crewRows].filter(r => r.name.toLowerCase().includes(q.toLowerCase())), [staff, crewRows, q]);

  const openAdd = () => { setEditing(null); setForm(BLANK_EMP); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...r, rate: String(r.rate), declaredSalary: String(r.declaredSalary || '') }); setModal(true); };
  const save = () => {
    if (!form.name.trim()) { toast('Name is required.', 'error'); return; }
    const data = { ...form, rate: parseFloat(form.rate) || 0, declaredSalary: parseFloat(form.declaredSalary) || 0, mp2: parseFloat(form.mp2) || 0 };
    if (editing) {
      setStaff(list => list.map(s => s.id === editing.id ? { ...s, ...data } : s));
      toast('Employee updated.');
    } else {
      setStaff(list => [...list, { ...data, id: 'EMP-' + String(list.length + 1).padStart(3, '0') }]);
      toast('Employee registered.');
    }
    setModal(false);
  };
  const toggleStatus = (r) => {
    setStaff(list => list.map(s => s.id === r.id ? { ...s, status: s.status === 'Active' ? 'Inactive' : 'Active' } : s));
    toast(`${r.name} marked ${r.status === 'Active' ? 'inactive' : 'active'}.`);
    setConfirm(null);
  };

  return (
    <div className="p-6">
      <H1 sub="Core registration fields only. Address, birthday, and contact details are masked from printed payroll sheets."
        action={<Btn icon={UserPlus} onClick={openAdd}>Register Employee</Btn>}>Employees</H1>
      <div className="relative w-64 mb-3">
        <Search size={14} className="absolute left-3 top-2.5" color={T.soft} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
          className={`${inputCls} pl-8`} style={inputStyle} />
      </div>
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 520 }}>
          <table className="w-full">
            <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
              <tr><Th>Employee</Th><Th>Position</Th><Th right>Daily Rate</Th><Th>Status</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Av name={r.name} size={28} tone={r.crew ? T.brand : T.ink} />
                      <div>
                        <div className="font-semibold" style={{ fontFamily: F_BODY }}>{r.name}</div>
                        <div className="text-xs" style={{ color: T.soft, fontFamily: F_MONO }}>{r.id}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.position}</Td>
                  <Td right mono><Money value={r.rate} /></Td>
                  <Td><Badge tone={r.status === 'Active' ? 'green' : 'neutral'}>{r.status}</Badge></Td>
                  <Td>
                    {r.crew ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>Managed via Truck Payroll</span> : (
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(r)} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.brand }}><Edit2 size={11} /> Edit</button>
                        <button onClick={() => setConfirm(r)} className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.soft }}>{r.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Employee' : 'Register Employee'} width={480}>
        <div className="space-y-3">
          <Field label="Full name*"><input value={form.name} onChange={e => ff('name', e.target.value)} placeholder="Dela Cruz, Juan P." className={inputCls} style={inputStyle} /></Field>
          <Field label="Position">
            <select value={form.position} onChange={e => ff('position', e.target.value)} className={inputCls} style={inputStyle}>
              {['Operations Head', 'Administrative Staff', 'Secretary — Special 6:00 AM Shift', 'Checker'].map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily rate (₱)"><input type="number" value={form.rate} onChange={e => ff('rate', e.target.value)} className={inputCls} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={e => ff('status', e.target.value)} className={inputCls} style={inputStyle}>
                <option>Active</option><option>Inactive</option>
              </select>
            </Field>
          </div>
          <Field label="Declared monthly salary (₱)">
            <input type="number" value={form.declaredSalary} onChange={e => ff('declaredSalary', e.target.value)} placeholder="e.g. daily rate × 26" className={inputCls} style={inputStyle} />
          </Field>
          <div className="text-xs -mt-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Basis for SSS, PhilHealth, and Pag-IBIG lookups — see Settings → Statutory Deductions for the actual bracket tables.</div>
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Government Contributions</Eyebrow>
            {[['sssOn', 'SSS'], ['phOn', 'PhilHealth'], ['piOn', 'Pag-IBIG (HDMF)']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
                <input type="checkbox" checked={form[k]} onChange={e => ff(k, e.target.checked)} /> {l}
              </label>
            ))}
            <Field label="Pag-IBIG MP2 (₱/cutoff)"><input type="number" value={form.mp2} onChange={e => ff('mp2', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn icon={Save} onClick={save}>{editing ? 'Save changes' : 'Register'}</Btn>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} onCancel={() => setConfirm(null)} onConfirm={() => toggleStatus(confirm)}
        title={confirm?.status === 'Active' ? 'Deactivate employee?' : 'Reactivate employee?'}
        message={`${confirm?.name} will be marked ${confirm?.status === 'Active' ? 'inactive and excluded from payroll' : 'active'}.`}
        confirmLabel={confirm?.status === 'Active' ? 'Deactivate' : 'Reactivate'} danger={confirm?.status === 'Active'} />
    </div>
  );
};

/* ============================= ATTENDANCE ============================= */
const AttendanceView = ({ staff, toast }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('dtr');
  const [editCell, setEditCell] = useState(null);
  const [rows, setRows] = useState(() => (selectedId ? buildDtrRows(selectedId) : []));
  const [history, setHistory] = useState(IMPORT_HISTORY_INIT);
  const [importing, setImporting] = useState(false);

  // Reload the DTR whenever a different employee is opened — this is the fix for the
  // drill-down previously showing the exact same 15 rows no matter who you clicked.
  useEffect(() => {
    if (selectedId) { setRows(buildDtrRows(selectedId)); setEditCell(null); }
  }, [selectedId]);

  const commitCell = (idx, field, val) => {
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: val } : row));
    setEditCell(null);
  };
  const runImport = () => {
    setImporting(true);
    setTimeout(() => {
      setImporting(false);
      setHistory(h => [{ date: 'Jul 16, 2026', file: 'biometric_may16-31.xls', count: staff.length, status: 'Success' }, ...h]);
      toast(`Attendance imported for ${staff.length} employees.`);
    }, 900);
  };

  if (view === 'dtr' && selectedId) {
    const current = staff.find(s => s.id === selectedId) || staff[0];
    const totalDaysLate = rows.filter(r => r.late > 0).length;
    const totalLateMins = rows.reduce((s, r) => s + r.late, 0);
    const totalOtMins = rows.reduce((s, r) => s + r.ot, 0);
    const totalAbsent = rows.filter(r => r.absent).length;
    // Ground the trend chart's most recent bar in the real numbers above, instead of
    // an unrelated random figure for the same cutoff.
    const trend = genAttendanceHistory(selectedId);
    trend[5] = { cutoff: 'May 1–15', present: rows.length - totalAbsent, absent: totalAbsent, late: totalLateMins, daysLate: totalDaysLate, ot: totalOtMins };

    return (
      <div className="p-6">
        <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Attendance
        </button>

        <Panel className="p-5 mb-5">
          <div className="flex items-center gap-5 flex-wrap">
            <Av name={current.name} size={52} tone={T.brand} />
            <div className="flex-1" style={{ minWidth: 160 }}>
              <div className="text-lg font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{current.name}</div>
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{current.position} · {current.id} · Call time {current.position.includes('Special') ? '6:00 AM' : '6:40 AM'}</div>
            </div>
            <div className="flex gap-6 flex-wrap">
              <BigStat value={totalDaysLate} label="Days Late" />
              <BigStat value={`${totalLateMins}m`} label="Total Late" tone={T.red} />
              <BigStat value={`${totalOtMins}m`} label="Overtime" tone={T.green} />
              <BigStat value={totalAbsent} label="Absences" tone={T.amber} />
            </div>
          </div>
        </Panel>

        <Panel className="overflow-hidden mb-4">
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-1" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Daily Time Record — May 1 – 15, 2026</div>
            <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Click a time to edit</div>
          </div>
          <table className="w-full">
            <thead><tr><Th>Date</Th><Th>Time In</Th><Th>Time Out</Th><Th right>Late (mins)</Th><Th right>OT (mins)</Th></tr></thead>
            <tbody>
              {rows.map((a, i) => {
                const isLate = a.late > 0;
                const isAbsent = a.absent;
                const isOt = a.ot > 0;
                const isFullPaySunday = a.day === 'Su' && !isAbsent && !isLate && !isOt;
                const rowBg = isLate ? T.redBg : isAbsent ? T.amberBg : 'transparent';
                return (
                  <tr key={a.date} style={{ backgroundColor: rowBg }}>
                    <Td>
                      <span className="font-bold mr-2" style={{ fontFamily: F_MONO, color: T.ink }}>{a.date}</span>
                      <span className="text-xs" style={{ fontFamily: F_BODY, color: isLate ? T.red : isAbsent ? T.amber : T.soft }}>{a.day}</span>
                      {isAbsent && <span className="ml-2"><Badge tone="amber">ABSENT</Badge></span>}
                      {isFullPaySunday && <span className="ml-2"><Badge tone="blue">SUNDAY · FULL PAY</Badge></span>}
                    </Td>
                    <Td mono>
                      {editCell?.row === i && editCell?.field === 'in'
                        ? <input autoFocus defaultValue={a.in} onBlur={e => commitCell(i, 'in', e.target.value)} className="w-20 px-1.5 py-1 rounded border text-sm" style={{ fontFamily: F_MONO, borderColor: T.blue }} />
                        : <span onClick={() => !isAbsent && setEditCell({ row: i, field: 'in' })} className={isAbsent ? '' : 'cursor-pointer'} style={{ color: isAbsent ? T.soft : T.ink, borderBottom: isAbsent ? 'none' : `1px dashed ${T.line}` }}>{a.in}</span>}
                    </Td>
                    <Td mono>
                      {editCell?.row === i && editCell?.field === 'out'
                        ? <input autoFocus defaultValue={a.out} onBlur={e => commitCell(i, 'out', e.target.value)} className="w-20 px-1.5 py-1 rounded border text-sm" style={{ fontFamily: F_MONO, borderColor: T.blue }} />
                        : <span onClick={() => !isAbsent && setEditCell({ row: i, field: 'out' })} className={isAbsent ? '' : 'cursor-pointer'} style={{ color: isAbsent ? T.soft : T.ink, borderBottom: isAbsent ? 'none' : `1px dashed ${T.line}` }}>{a.out}</span>}
                    </Td>
                    <Td right mono><span style={{ fontWeight: isLate ? 700 : 400, color: isLate ? T.red : T.soft }}>{isLate ? a.late : '--'}</span></Td>
                    <Td right mono><span style={{ fontWeight: isOt ? 700 : 400, color: isOt ? T.green : T.soft }}>{isOt ? a.ot : '--'}</span></Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: T.bg }}>
                <Td colSpan={3}><b style={{ color: T.red, fontFamily: F_HEAD, letterSpacing: '0.03em' }}>TOTAL FOR THIS MONTH</b></Td>
                <Td right mono><b style={{ color: T.red }}>{totalLateMins}m</b></Td>
                <Td right mono><b style={{ color: T.green }}>{totalOtMins}m</b></Td>
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-2.5 flex flex-wrap gap-4 text-xs" style={{ borderTop: `1px solid ${T.line}`, fontFamily: F_BODY, color: T.soft }}>
            <span>Click Time-In / Time-Out to manually edit</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: T.red }} /> Late rows highlighted</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: T.green }} /> OT values in green</span>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between mb-1">
            <Eyebrow>Attendance History — {current.name}</Eyebrow>
            <BarChart3 size={14} color={T.soft} />
          </div>
          <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Days present/absent and tardiness, last 3 months (6 cutoffs)</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend} margin={{ left: -15, right: 10, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} vertical={false} />
              <XAxis dataKey="cutoff" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: F_BODY }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: F_BODY }} />
              <Bar yAxisId="left" dataKey="present" name="Days present" fill={T.green} radius={[3, 3, 0, 0]} barSize={14} />
              <Bar yAxisId="left" dataKey="absent" name="Days absent" fill={T.red} radius={[3, 3, 0, 0]} barSize={14} />
              <Line yAxisId="right" type="monotone" dataKey="late" name="Late (min)" stroke={T.amber} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6">
      <H1 sub="Military time, two columns only. Imported from the biometric .xls export each cutoff."
        action={<Btn variant="outline" icon={ClipboardList} onClick={runImport} disabled={importing}>{importing ? 'Importing…' : 'Import Biometric .xls'}</Btn>}>Attendance</H1>

      {importing && <div className="mb-4 flex items-center gap-2 p-3 rounded text-sm" style={{ backgroundColor: T.blueBg, color: T.blue, fontFamily: F_BODY }}><ClipboardList size={14} /> Reading attendance file…</div>}

      <div className="flex items-center gap-3 mb-4">
        <Badge tone="blue">May 01 – 15, 2026</Badge>
        <div className="flex gap-1 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft }}>
          {[['dtr', 'Employee DTR'], ['history', 'Import History']].map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: subTab === k ? T.surface : 'transparent', color: subTab === k ? T.ink : T.soft }}>{l}</button>
          ))}
        </div>
      </div>

      {subTab === 'dtr' && (
        <>
          <div className="mb-4 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.amberBg }}>
            <AlertTriangle size={16} color={T.amber} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>Pending / Unmapped — Biometric ID #47</div>
              <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>3 time entries came in under a User ID with no matching employee record. <button className="underline font-semibold">Register this employee</button> to bring the logs in.</div>
            </div>
          </div>
          <Panel className="overflow-hidden">
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th right>Days Late</Th><Th right>Late (mins)</Th><Th right>OT (mins)</Th><Th right>Absences</Th><Th>Action</Th></tr></thead>
              <tbody>
                {staff.map(s => {
                  const t = summarizeDtr(s.id);
                  return (
                    <tr key={s.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Av name={s.name} size={28} />
                          <div>
                            <div className="font-semibold" style={{ fontFamily: F_BODY }}>{s.name}</div>
                            <div className="text-xs" style={{ color: T.soft, fontFamily: F_MONO }}>{s.id}</div>
                          </div>
                        </div>
                      </Td>
                      <Td right mono><span style={{ color: t.daysLate > 0 ? T.red : T.soft, fontWeight: t.daysLate > 0 ? 700 : 400 }}>{t.daysLate || '—'}</span></Td>
                      <Td right mono><span style={{ color: t.late > 0 ? T.red : T.soft, fontWeight: t.late > 0 ? 700 : 400 }}>{t.late > 0 ? `${t.late}m` : '—'}</span></Td>
                      <Td right mono><span style={{ color: t.ot > 0 ? T.green : T.soft, fontWeight: t.ot > 0 ? 700 : 400 }}>{t.ot > 0 ? `${t.ot}m` : '—'}</span></Td>
                      <Td right mono><span style={{ color: t.absent > 0 ? T.amber : T.soft, fontWeight: t.absent > 0 ? 700 : 400 }}>{t.absent || '—'}</span></Td>
                      <Td><Btn size="sm" variant="outline" icon={Eye} onClick={() => { setSelectedId(s.id); setView('dtr'); }}>View DTR</Btn></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          {history.length === 0 ? <EmptyState icon={ClipboardList} title="No imports yet" desc="Upload an attendance .xls file to get started." /> : (
            <table className="w-full">
              <thead><tr><Th>Date</Th><Th>Filename</Th><Th right>Employees Imported</Th><Th>Status</Th></tr></thead>
              <tbody>{history.map((h, i) => (
                <tr key={i}><Td mono>{h.date}</Td><Td mono>{h.file}</Td><Td right mono>{h.count}</Td><Td><Badge tone={h.status === 'Success' ? 'green' : 'red'}>{h.status}</Badge></Td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
};

/* ============================= DELIVERY FORM (shared: admin + checker) ============================= */
// Truck/crew stays the entry point (matches "grouped by truck" payroll sheets), but the
// driver + pahinante for THIS delivery are editable — a Checker can swap in a substitute
// helper for the day without that truck's permanent roster changing.
const DeliveryForm = ({ crews, fixedCrewId, rates, onSubmit }) => {
  const [crewId, setCrewId] = useState(fixedCrewId || (crews[0] && crews[0].id) || '');
  const crew = crews.find(c => c.id === crewId) || crews[0];
  const defaultHelpers = (crew?.helpers || []).filter(h => h !== '—');

  const [address, setAddress] = useState('');
  const [customer, setCustomer] = useState('');
  const [dbl, setDbl] = useState(false);
  const [lineRows, setLineRows] = useState([{ item: rates[0].cat, qty: '' }]);
  const [helper1, setHelper1] = useState(defaultHelpers[0] || '');
  const [helper2, setHelper2] = useState(defaultHelpers[1] || '');

  // Reload the default crew whenever a different truck is picked (fixed or dropdown).
  useEffect(() => {
    const c = crews.find(x => x.id === crewId);
    const def = (c?.helpers || []).filter(h => h !== '—');
    setHelper1(def[0] || ''); setHelper2(def[1] || '');
  }, [crewId]);

  const addRow = () => setLineRows(r => [...r, { item: rates[0].cat, qty: '' }]);
  const removeRow = (i) => setLineRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i, patch) => setLineRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const computed = lineRows.map(row => {
    const rate = rates.find(r => r.cat === row.item) || rates[0];
    const [dR, hR] = dbl ? rate.d : rate.s;
    const q = parseFloat(row.qty) || 0;
    return { item: row.item, qty: q, unit: rate.unit, d: +(dR * q).toFixed(2), h: +(hR * q).toFixed(2) };
  });
  const totalD = computed.reduce((s, r) => s + r.d, 0), totalH = computed.reduce((s, r) => s + r.h, 0);

  const dobleMatch = matchDobleArea(address);
  const helpersUsed = [helper1, helper2].map(h => h.trim()).filter(Boolean);
  const isSwap = defaultHelpers.length > 0 && JSON.stringify(helpersUsed) !== JSON.stringify(defaultHelpers);

  const submit = () => {
    if (!address || computed.every(r => !r.qty)) return;
    onSubmit(crewId, address, customer, computed.map(r => ({ ...r, dbl })), helpersUsed);
    setAddress(''); setCustomer(''); setDbl(false); setLineRows([{ item: rates[0].cat, qty: '' }]);
    // Helpers are left as-is — the next delivery for this truck is usually the same crew.
  };

  return (
    <div>
      <div className="text-base font-bold mb-4" style={{ fontFamily: F_HEAD, color: T.ink }}>Trip details</div>

      {/* Driver + Plate number row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label={<>Driver <span style={{ color: T.brand }}>*</span></>}>
          {fixedCrewId ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded border" style={{ borderColor: T.line, backgroundColor: T.bg }}>
              <Av name={crew?.driver || '?'} size={26} tone={T.brand} />
              <span className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{crew?.driver}</span>
            </div>
          ) : (
            <select value={crewId} onChange={e => setCrewId(e.target.value)} className={inputCls} style={inputStyle}>
              {crews.map(c => <option key={c.id} value={c.id}>{c.driver} — {c.id} ({c.vehicle})</option>)}
            </select>
          )}
        </Field>
        <Field label="Plate number">
          <input readOnly value={crew?.plate || ''} placeholder="e.g. ABC-1234" className={inputCls} style={{ ...inputStyle, backgroundColor: T.bg, color: T.soft, fontFamily: F_MONO }} />
        </Field>
      </div>

      {/* Pahinante 1 + Pahinante 2 row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
        <Field label="Pahinante 1">
          <input list="helper-pool" value={helper1} onChange={e => setHelper1(e.target.value)} placeholder="None" className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Pahinante 2">
          <input list="helper-pool" value={helper2} onChange={e => setHelper2(e.target.value)} placeholder="None" className={inputCls} style={inputStyle} />
        </Field>
      </div>
      <datalist id="helper-pool">{ALL_HELPERS.map(h => <option key={h} value={h} />)}</datalist>
      {isSwap && (
        <div className="mt-2.5 mb-1 flex items-center gap-1.5 text-xs" style={{ fontFamily: F_BODY, color: T.warn }}>
          <Repeat size={12} /> Substitute for today — {crew?.id}'s regular crew is {defaultHelpers.join(' & ') || 'none'}.
        </div>
      )}

      {/* Address + customer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-1">
        <Field label="Delivery address">
          <input list="doble-areas" placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} style={inputStyle} />
          <datalist id="doble-areas">{DOBLE_AREAS.map(a => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Customer's name">
          <input placeholder="Customer's name" value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      {dobleMatch && !dbl && (
        <div className="mt-2 mb-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs" style={{ backgroundColor: T.warnBg }}>
          <span className="flex items-center gap-1.5" style={{ color: T.warn, fontFamily: F_BODY }}><MapPin size={12} /> "{dobleMatch}" is a double-rate area.</span>
          <button onClick={() => setDbl(true)} className="font-semibold underline shrink-0" style={{ color: T.warn, fontFamily: F_HEAD }}>Apply double rate</button>
        </div>
      )}
      {dobleMatch && dbl && (
        <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs" style={{ color: T.green, fontFamily: F_BODY }}><MapPin size={12} /> Double rate applied — matches known area "{dobleMatch}".</div>
      )}
      {!dobleMatch && dbl && address && (
        <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs" style={{ color: T.soft, fontFamily: F_BODY }}><AlertTriangle size={12} /> "{address}" isn't on the standard double-rate list — double check before saving.</div>
      )}

      {/* Items delivered */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <Eyebrow>Items Delivered</Eyebrow>
        <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border" style={{ fontFamily: F_HEAD, color: T.ink, borderColor: T.line, backgroundColor: T.surface }}><Plus size={13} /> Add item</button>
      </div>
      <div className="border rounded-md overflow-hidden mb-3" style={{ borderColor: T.line }}>
        <div className="overflow-x-auto">
          <div className="grid px-3 py-2.5 text-xs font-semibold uppercase" style={{ gridTemplateColumns: '2.2fr 68px 74px 74px 84px 26px', minWidth: 500, backgroundColor: T.bg, fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>
            <span>Item</span><span className="text-right">Qty</span><span className="text-right">Drv. Rate</span><span className="text-right">Pah. Rate</span><span className="text-right">Drv. Earn</span><span></span>
          </div>
          {lineRows.map((row, i) => {
            const rate = rates.find(r => r.cat === row.item) || rates[0];
            const [dR, hR] = dbl ? rate.d : rate.s;
            const q = parseFloat(row.qty) || 0;
            return (
              <div key={i} className="grid items-center px-3 py-2 gap-2" style={{ gridTemplateColumns: '2.2fr 68px 74px 74px 84px 26px', minWidth: 500, borderTop: `1px solid ${T.lineSoft}` }}>
                <select value={row.item} onChange={e => updateRow(i, { item: e.target.value })} className="px-2 py-1.5 rounded border text-xs" style={{ fontFamily: F_BODY, borderColor: T.line }}>
                  {rates.map(r => <option key={r.cat} value={r.cat}>{r.cat}</option>)}
                </select>
                <input type="number" placeholder="0" value={row.qty} onChange={e => updateRow(i, { qty: e.target.value })} className="px-2 py-1.5 rounded border text-xs text-right" style={{ fontFamily: F_MONO, borderColor: T.line }} />
                <span className="text-xs text-right" style={{ fontFamily: F_MONO, color: T.brand }}>{peso(dR)}</span>
                <span className="text-xs text-right" style={{ fontFamily: F_MONO, color: T.warn }}>{peso(hR)}</span>
                <span className="text-xs text-right font-semibold" style={{ fontFamily: F_MONO, color: T.green }}>{peso(dR * q)}</span>
                {lineRows.length > 1 ? <button onClick={() => removeRow(i)} className="justify-self-end"><Trash2 size={13} color={T.red} /></button> : <span />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mark as Double + trip total + save */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button onClick={() => setDbl(d => !d)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: dbl ? T.brand : T.lineSoft, color: dbl ? '#fff' : T.ink }}>
          {dbl ? <Check size={13} /> : <MapPin size={13} />} {dbl ? 'Marked as Double' : 'Mark as Double'}
        </button>
        <div className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>Trip total: <span style={{ color: T.green, fontWeight: 600 }}>{peso(totalD)} / {peso(totalH)}</span></div>
      </div>
      <Btn onClick={submit} icon={Check} disabled={!address} full>Save delivery</Btn>
    </div>
  );
};

/* ============================= TRUCK PAYROLL ============================= */
const TruckPayrollView = ({ deliveries, setDeliveries, rates, setRates, loans, setLoans, toast }) => {
  const [selected, setSelected] = useState(null);
  const [editingRates, setEditingRates] = useState(false);
  const [ratesDraft, setRatesDraft] = useState(rates);
  const [logOpen, setLogOpen] = useState(false);
  const [filterCrew, setFilterCrew] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);

  // Loans belonging to any driver/pahinante (matched by name), still owing and not paused —
  // truck crew are paid daily, so this applies today's deduction rather than a cutoff's.
  const crewPeople = new Set(CREWS.flatMap(c => [c.driver, ...c.helpers.filter(h => h !== '—')]));
  const dueLoans = loans.filter(l => crewPeople.has(l.person) && !l.paused && loanBalance(l) > 0);
  const dueTotal = dueLoans.reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const applyDeductions = () => {
    setLoans(prev => prev.map(l => {
      if (!dueLoans.some(d => d.id === l.id)) return l;
      const amt = Math.min(l.perCutoff, loanBalance(l));
      if (amt <= 0) return l;
      return { ...l, entries: [...l.entries, { date: todayLabel(), type: 'deduction', amount: amt, remark: `Daily deduction — ${todayLabel()}` }] };
    }));
    toast(`Applied ${peso(dueTotal)} in loan deductions across ${dueLoans.length} loan(s).`);
    setConfirmApply(false);
  };

  const logDelivery = (crewId, address, customer, items, helpers) => {
    setDeliveries(prev => {
      const existing = prev[crewId] || { date: 'Jul 16, 2026', items: [], kaltas: [] };
      const nums = existing.items.map(i => i.seq).filter(Boolean);
      const nextSeq = nums.length ? Math.max(...nums) + 1 : 1;
      const crewDef = (CREWS.find(c => c.id === crewId)?.helpers || []).filter(h => h !== '—');
      const usedHelpers = helpers !== undefined ? helpers : crewDef; // [] means the checker explicitly recorded no helper that trip
      const isSwap = JSON.stringify(usedHelpers) !== JSON.stringify(crewDef);
      const newItems = items.map((r, i) => ({ seq: i === 0 ? nextSeq : null, address: i === 0 ? address : '', customer: i === 0 ? customer : '', item: r.item, qty: r.qty, unit: r.unit, d: r.d, h: r.h, dbl: r.dbl, helpers: i === 0 ? usedHelpers : undefined, swap: i === 0 ? isSwap : undefined }));
      return { ...prev, [crewId]: { ...existing, items: [...existing.items, ...newItems] } };
    });
    toast('Delivery logged for ' + crewId + '.');
    setLogOpen(false);
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries, filterCrew), [deliveries, filterCrew]);

  if (selected) {
    const crew = CREWS.find(c => c.id === selected);
    const log = deliveries[selected];
    const subD = log ? log.items.reduce((s, i) => s + i.d, 0) : 0;
    const subH = log ? log.items.reduce((s, i) => s + i.h, 0) : 0;
    const kalD = log ? log.kaltas.reduce((s, k) => s + k.d, 0) : 0;
    const kalH = log ? log.kaltas.reduce((s, k) => s + k.h, 0) : 0;
    const tripCount = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
    const bonusEligible = tripCount >= BONUS_TRIPS;
    const activeHelpers = crew.helpers.filter(h => h !== '—').length;
    const bonusD = bonusEligible ? BONUS_HEAD : 0;
    const bonusH = bonusEligible ? BONUS_HEAD * activeHelpers : 0;
    const netD = DRIVER_DAILY + subD + bonusD - kalD, netH = HELPER_DAILY + subH + bonusH - kalH;
    // Per-person piece-rate breakdown — supplementary to the combined truck total above,
    // useful when a substitute helper worked one or more trips that day.
    const defaultHelperNames = crew.helpers.filter(h => h !== '—');
    const helperBreakdown = [];
    if (log) {
      const map = {};
      let currentHelpers = defaultHelperNames, currentTrip = null;
      log.items.forEach(it => {
        if (it.seq) { currentHelpers = (it.helpers && it.helpers.length) ? it.helpers : defaultHelperNames; currentTrip = it.seq; }
        if (currentHelpers.length) {
          const share = it.h / currentHelpers.length;
          currentHelpers.forEach(h => {
            if (!map[h]) map[h] = { trips: new Set(), earned: 0 };
            map[h].trips.add(currentTrip);
            map[h].earned += share;
          });
        }
      });
      Object.entries(map).forEach(([name, v]) => helperBreakdown.push({ name, trips: v.trips.size, earned: v.earned }));
    }
    // ---- Printable Truck Payslip: full itemized ledger, split Driver / Pahinante 1 / Pahinante 2 ----
    // Positional (by slot, not name) — a mid-day substitute still lands in the right column,
    // annotated inline, rather than needing its own column.
    const p1Name = defaultHelperNames[0] || null;
    const p2Name = defaultHelperNames[1] || null;
    const payslipRows = [];
    if (log) {
      let currentHelpers = defaultHelperNames, currentTrip = null;
      log.items.forEach(it => {
        if (it.seq) { currentHelpers = (it.helpers && it.helpers.length) ? it.helpers : defaultHelperNames; currentTrip = it.seq; }
        const n = currentHelpers.length;
        const share = n ? it.h / n : 0;
        const h1 = currentHelpers[0], h2 = currentHelpers[1];
        payslipRows.push({
          item: it.item, qty: it.qty, unit: it.unit, dbl: it.dbl, driverAmt: it.d,
          p1Amt: h1 ? share : 0, p1Who: h1 || null, p1Sub: !!(h1 && p1Name && h1 !== p1Name),
          p2Amt: h2 ? share : 0, p2Who: h2 || null, p2Sub: !!(h2 && p2Name && h2 !== p2Name),
        });
      });
    }
    const p1SubtotalPiece = payslipRows.reduce((s, r) => s + r.p1Amt, 0);
    const p2SubtotalPiece = payslipRows.reduce((s, r) => s + r.p2Amt, 0);
    const p1Daily = p1Name ? HELPER_DAILY / activeHelpers : 0;
    const p2Daily = p2Name ? HELPER_DAILY / activeHelpers : 0;
    const p1Bonus = bonusEligible && p1Name ? BONUS_HEAD : 0;
    const p2Bonus = bonusEligible && p2Name ? BONUS_HEAD : 0;
    // Kaltas: attribute to whichever named slot the entry mentions; otherwise split across active slots
    const kaltasRows = (log ? log.kaltas : []).map(k => {
      const matchesP1 = p1Name && k.who.toLowerCase().includes(p1Name.toLowerCase());
      const matchesP2 = p2Name && k.who.toLowerCase().includes(p2Name.toLowerCase());
      let p1 = 0, p2 = 0;
      if (matchesP1) p1 = k.h;
      else if (matchesP2) p2 = k.h;
      else {
        const slots = [p1Name, p2Name].filter(Boolean).length || 1;
        if (p1Name) p1 = k.h / slots;
        if (p2Name) p2 = k.h / slots;
      }
      return { who: k.who, d: k.d, p1, p2 };
    });
    const p1Kaltas = kaltasRows.reduce((s, k) => s + k.p1, 0);
    const p2Kaltas = kaltasRows.reduce((s, k) => s + k.p2, 0);
    const p1Net = p1Daily + p1SubtotalPiece + p1Bonus - p1Kaltas;
    const p2Net = p2Daily + p2SubtotalPiece + p2Bonus - p2Kaltas;
    return (
      <div className="p-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Truck Payroll
        </button>
        <Panel className="p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Eyebrow>Delivery Manifest — {crew.id}</Eyebrow>
              <div className="text-xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{crew.driver} + {crew.helpers.join(' & ')}</div>
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{crew.vehicle} · {log ? log.date : 'No date logged'} {bonusEligible && <span style={{ color: T.amber, fontWeight: 600 }}>· {tripCount} trips — palima bonus applies!</span>}</div>
            </div>
            <div className="flex items-center gap-2">
              <Btn variant="outline" size="sm" icon={Plus} onClick={() => setLogOpen(true)}>Log Delivery</Btn>
              <div className="px-3 py-1.5 rounded text-sm font-semibold tabular-nums" style={{ fontFamily: F_MONO, backgroundColor: T.ink, color: '#fff' }}>{crew.plate}</div>
            </div>
          </div>
        </Panel>
        {!log ? (
          <Panel><EmptyState icon={Package} title="No deliveries logged yet" desc="No Checker has logged a delivery for this truck yet today." action={<Btn icon={Plus} onClick={() => setLogOpen(true)}>Log a delivery</Btn>} /></Panel>
        ) : (
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr><Th>Seq.</Th><Th>Address</Th><Th>Customer</Th><Th>Crew</Th><Th>Item Category</Th><Th right>Qty</Th><Th>Unit</Th><Th right>Driver</Th><Th right>Pahinante</Th><Th>Double</Th></tr>
                </thead>
                <tbody>
                  {log.items.map((it, idx) => (
                    <tr key={idx}>
                      <Td mono>{it.seq || ''}</Td>
                      <Td>{it.address}</Td>
                      <Td>{it.customer}</Td>
                      <Td>{it.seq ? (
                        <span className="flex items-center gap-1.5">
                          {it.helpers?.length ? it.helpers.join(' & ') : '—'}
                          {it.swap && <Badge tone="amber">SUB</Badge>}
                        </span>
                      ) : ''}</Td>
                      <Td>{it.item}</Td>
                      <Td right mono>{it.qty}</Td>
                      <Td>{it.unit}</Td>
                      <Td right mono>{peso(it.d)}</Td>
                      <Td right mono>{peso(it.h)}</Td>
                      <Td>{it.dbl && <Badge tone="amber">DOUBLE</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3" style={{ borderTop: `1px dashed ${T.line}`, backgroundColor: T.bg }}>
              <div className="grid grid-cols-2 gap-x-8 max-w-md ml-auto text-sm" style={{ fontFamily: F_MONO }}>
                <span style={{ color: T.soft }}>Daily (fixed)</span><span className="text-right">{peso(DRIVER_DAILY)} / {peso(HELPER_DAILY)}</span>
                <span style={{ color: T.soft }}>Piece-rate subtotal</span><span className="text-right">{peso(subD)} / {peso(subH)}</span>
                {bonusEligible && <><span style={{ color: T.amber }}>Palima bonus ({tripCount} trips)</span><span className="text-right" style={{ color: T.amber }}>+{peso(bonusD)} / +{peso(bonusH)}</span></>}
                {log.kaltas.map((k, i) => (
                  <React.Fragment key={i}>
                    <span style={{ color: T.red }}>Kaltas — {k.who}</span><span className="text-right" style={{ color: T.red }}>-{peso(k.d)} / -{peso(k.h)}</span>
                  </React.Fragment>
                ))}
                <span className="font-bold pt-2" style={{ color: T.ink, borderTop: `1px solid ${T.line}` }}>NET SALARY</span>
                <span className="text-right font-bold pt-2" style={{ color: T.green, borderTop: `1px solid ${T.line}` }}>{peso(netD)} / {peso(netH)}</span>
              </div>
            </div>
          </Panel>
        )}
        {log && payslipRows.length > 0 && (
          <>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #truck-payslip, #truck-payslip * { visibility: visible; }
                #truck-payslip { position: absolute; left: 0; top: 0; width: 100%; }
                #truck-payslip .no-print { display: none !important; }
              }
            `}</style>
            <div id="truck-payslip" className="mt-4">
              <div className="flex items-center justify-between mb-2 no-print">
                <Eyebrow>Printable Payslip — {crew.id}</Eyebrow>
                <Btn variant="outline" size="sm" icon={Printer} onClick={() => window.print()}>Print Payslip</Btn>
              </div>
              <Panel className="overflow-hidden">
                <div className="px-6 py-5 flex items-center gap-3" style={{ backgroundColor: T.ink }}>
                  <div className="w-10 h-10 rounded flex items-center justify-center font-bold text-white shrink-0" style={{ backgroundColor: T.amber, fontFamily: F_HEAD }}>PD</div>
                  <div>
                    <div className="text-white font-bold text-sm" style={{ fontFamily: F_HEAD }}>PRIME DEPOT HARDWARE AND CONSTRUCTION SUPPLY</div>
                    <div className="text-xs" style={{ color: T.sidebarSoft, fontFamily: F_BODY }}>Mabini, Batangas City</div>
                  </div>
                </div>
                <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <div className="px-5 py-3" style={{ borderRight: `1px solid ${T.line}` }}><Eyebrow>Date</Eyebrow><div className="text-sm font-semibold" style={{ fontFamily: F_BODY }}>{log.date}</div></div>
                  <div className="px-5 py-3"><Eyebrow>Truck / Plate</Eyebrow><div className="text-sm font-semibold" style={{ fontFamily: F_BODY }}>{crew.id} · {crew.plate}</div></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Item</Th>
                        <Th right>Driver — {crew.driver}</Th>
                        <Th right>Pahinante 1{p1Name ? ` — ${p1Name}` : ''}</Th>
                        <Th right>Pahinante 2{p2Name ? ` — ${p2Name}` : ''}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslipRows.map((r, i) => (
                        <tr key={i}>
                          <Td>
                            {r.item} <span style={{ color: T.soft }}>({r.qty} {r.unit})</span>
                            {r.dbl && <span className="ml-1.5"><Badge tone="amber">DOUBLE</Badge></span>}
                          </Td>
                          <Td right mono>{peso(r.driverAmt)}</Td>
                          <Td right mono>
                            {r.p1Who ? peso(r.p1Amt) : '—'}
                            {r.p1Sub && <div className="text-xs" style={{ color: T.amber, fontFamily: F_BODY }}>({r.p1Who} subbed)</div>}
                          </Td>
                          <Td right mono>
                            {r.p2Who ? peso(r.p2Amt) : '—'}
                            {r.p2Sub && <div className="text-xs" style={{ color: T.amber, fontFamily: F_BODY }}>({r.p2Who} subbed)</div>}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: T.bg }}>
                        <Td><b>Piece-rate subtotal</b></Td>
                        <Td right mono><b>{peso(subD)}</b></Td>
                        <Td right mono><b>{p1Name ? peso(p1SubtotalPiece) : '—'}</b></Td>
                        <Td right mono><b>{p2Name ? peso(p2SubtotalPiece) : '—'}</b></Td>
                      </tr>
                      <tr>
                        <Td style={{ color: T.soft }}>Daily (fixed)</Td>
                        <Td right mono>{peso(DRIVER_DAILY)}</Td>
                        <Td right mono>{p1Name ? peso(p1Daily) : '—'}</Td>
                        <Td right mono>{p2Name ? peso(p2Daily) : '—'}</Td>
                      </tr>
                      {bonusEligible && (
                        <tr>
                          <Td style={{ color: T.amber }}>Palima bonus ({tripCount} trips)</Td>
                          <Td right mono style={{ color: T.amber }}>+{peso(bonusD)}</Td>
                          <Td right mono style={{ color: T.amber }}>{p1Name ? `+${peso(p1Bonus)}` : '—'}</Td>
                          <Td right mono style={{ color: T.amber }}>{p2Name ? `+${peso(p2Bonus)}` : '—'}</Td>
                        </tr>
                      )}
                      {kaltasRows.map((k, i) => (
                        <tr key={i}>
                          <Td style={{ color: T.red }}>Kaltas — {k.who}</Td>
                          <Td right mono style={{ color: T.red }}>{k.d ? `-${peso(k.d)}` : '—'}</Td>
                          <Td right mono style={{ color: T.red }}>{p1Name ? (k.p1 ? `-${peso(k.p1)}` : '—') : '—'}</Td>
                          <Td right mono style={{ color: T.red }}>{p2Name ? (k.p2 ? `-${peso(k.p2)}` : '—') : '—'}</Td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: T.ink }}>
                        <Td style={{ color: '#fff' }}><b>NET SALARY</b></Td>
                        <Td right mono style={{ color: T.amber }}><b>{peso(netD)}</b></Td>
                        <Td right mono style={{ color: T.amber }}><b>{p1Name ? peso(p1Net) : '—'}</b></Td>
                        <Td right mono style={{ color: T.amber }}><b>{p2Name ? peso(p2Net) : '—'}</b></Td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="grid grid-cols-3 gap-6 px-6 py-6">
                  {[crew.driver, p1Name || '—', p2Name || '—'].map((n, i) => (
                    <div key={i}>
                      <div className="h-px mb-1.5" style={{ backgroundColor: T.line }} />
                      <div className="text-xs text-center" style={{ fontFamily: F_BODY, color: T.soft }}>{n} — Signature / Date</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </>
        )}
        {log && helperBreakdown.length > 0 && (
          <Panel className="overflow-hidden mt-4">
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Pahinante earnings — today ({crew.id})</Eyebrow>
            </div>
            <table className="w-full">
              <thead><tr><Th>Pahinante</Th><Th right>Trips</Th><Th right>Piece-rate earned</Th></tr></thead>
              <tbody>
                {helperBreakdown.map((h, i) => (
                  <tr key={i}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Av name={h.name} size={22} tone={T.brand} />
                        <span className="font-semibold" style={{ fontFamily: F_BODY }}>{h.name}</span>
                        {!defaultHelperNames.includes(h.name) && <Badge tone="amber">Substitute</Badge>}
                      </div>
                    </Td>
                    <Td right mono>{h.trips}</Td>
                    <Td right mono>{peso(h.earned)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.lineSoft}` }}>
              Piece-rate portion only, split evenly across whoever worked each trip. The fixed daily rate and palima bonus above stay combined per truck.
            </div>
          </Panel>
        )}
        <Modal open={logOpen} onClose={() => setLogOpen(false)} title={`Log Delivery — ${crew.id}`} width={560}>
          <DeliveryForm crews={CREWS} fixedCrewId={selected} rates={rates} onSubmit={logDelivery} />
        </Modal>
      </div>
    );
  }

  return (
    <div className="p-6">
      <H1 sub="Grouped by truck: one driver + two pahinante share the delivery log for the day."
        action={<div className="flex items-center gap-2">
          <Btn variant="outline" icon={Wallet} disabled={dueLoans.length === 0} onClick={() => setConfirmApply(true)}>Apply Today's Deductions</Btn>
          <Btn icon={Plus} onClick={() => setLogOpen(true)}>Log Delivery</Btn>
        </div>}>Truck Payroll — Pakyawan</H1>

      <Panel className="overflow-hidden mb-5">
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>Piece-Rate Table</Eyebrow>
          {editingRates ? (
            <div className="flex gap-2">
              <Btn size="sm" icon={Save} onClick={() => { setRates(ratesDraft); setEditingRates(false); toast('Piece rates saved.'); }}>Save</Btn>
              <Btn size="sm" variant="outline" onClick={() => { setRatesDraft(rates); setEditingRates(false); }}>Cancel</Btn>
            </div>
          ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setRatesDraft(rates); setEditingRates(true); }}>Edit</Btn>}
        </div>
        <table className="w-full">
          <thead><tr><Th>Category</Th><Th>Unit</Th><Th right>Single — Drv</Th><Th right>Single — Hlp</Th><Th right>Double — Drv</Th><Th right>Double — Hlp</Th></tr></thead>
          <tbody>{(editingRates ? ratesDraft : rates).map((r, i) => (
            <tr key={i}>
              <Td>{editingRates ? <input value={r.cat} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, cat: e.target.value } : x))} className="px-2 py-1 rounded border text-xs w-full" style={{ borderColor: T.line, fontFamily: F_BODY }} /> : r.cat}</Td>
              <Td>{r.unit}</Td>
              {[0, 1].map(k => <Td right mono key={'s' + k}>{editingRates ? <input type="number" value={r.s[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, s: x.s.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.s[k])}</Td>)}
              {[0, 1].map(k => <Td right mono key={'d' + k}>{editingRates ? <input type="number" value={r.d[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, d: x.d.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.d[k])}</Td>)}
            </tr>
          ))}</tbody>
        </table>
        <div className="px-4 py-2.5 text-xs" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.line}` }}>
          Fixed daily — Driver {peso(DRIVER_DAILY)} · Pahinante (combined) {peso(HELPER_DAILY)} · 5-trip "palima" bonus ₱100/head
        </div>
      </Panel>

      <Eyebrow>Crews</Eyebrow>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2 mb-6">
        {CREWS.map(c => {
          const log = deliveries[c.id];
          const subD = log ? log.items.reduce((s, i) => s + i.d, 0) : 0;
          const subH = log ? log.items.reduce((s, i) => s + i.h, 0) : 0;
          const tripCount = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
          const bonusEligible = tripCount >= BONUS_TRIPS;
          return (
            <button key={c.id} onClick={() => setSelected(c.id)} className="text-left">
              <Panel className="p-4 h-full" style={{ borderLeftWidth: 3, borderLeftColor: log ? T.brand : T.line }}>
                <div className="flex items-center justify-between mb-2">
                  <Eyebrow>{c.id}</Eyebrow>
                  <span className="text-xs tabular-nums px-1.5 py-0.5 rounded" style={{ fontFamily: F_MONO, backgroundColor: T.lineSoft, color: T.soft }}>{c.plate}</span>
                </div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Av name={c.driver} size={24} tone={T.brand} />
                  <span className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{c.driver}</span>
                </div>
                <div className="text-xs mb-3 ml-8" style={{ fontFamily: F_BODY, color: T.soft }}>+ {c.helpers.join(' & ')} · {c.vehicle}</div>
                {log ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-1.5">
                      <Badge tone="blue">{tripCount} trips</Badge>
                      {bonusEligible && <Badge tone="amber">Bonus</Badge>}
                    </div>
                    <span style={{ fontFamily: F_MONO, color: T.green }}>{peso(DRIVER_DAILY + subD + (bonusEligible ? BONUS_HEAD : 0))}</span>
                  </div>
                ) : <Badge tone="neutral">No deliveries yet</Badge>}
              </Panel>
            </button>
          );
        })}
      </div>

      <Panel className="overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>All Deliveries ({allTrips.length})</Eyebrow>
          <select value={filterCrew} onChange={e => setFilterCrew(e.target.value)} className="px-2 py-1.5 rounded border text-xs" style={{ borderColor: T.line, fontFamily: F_BODY }}>
            <option value="">All crews</option>
            {CREWS.map(c => <option key={c.id} value={c.id}>{c.id} — {c.driver}</option>)}
          </select>
        </div>
        {allTrips.length === 0 ? <EmptyState title="No trips logged" desc="Deliveries will appear here once a Checker logs them." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><Th>Date</Th><Th>Crew</Th><Th>Pahinante</Th><Th>Address</Th><Th>Customer</Th><Th right>Driver Earn</Th></tr></thead>
              <tbody>{allTrips.map((t, i) => (
                <tr key={i}>
                  <Td mono>{t.date}</Td>
                  <Td>{t.crewId}</Td>
                  <Td>{t.helpers?.length ? <span className="flex items-center gap-1.5">{t.helpers.join(' & ')}{t.swap && <Badge tone="amber">SUB</Badge>}</span> : '—'}</Td>
                  <Td>{t.address}</Td>
                  <Td>{t.customer}</Td>
                  <Td right mono>{peso(t.d)}</Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Delivery" width={560}>
        <DeliveryForm crews={CREWS} rates={rates} onSubmit={logDelivery} />
      </Modal>

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply today's deductions?"
        message={`This will deduct ${peso(dueTotal)} total across ${dueLoans.length} active loan(s) for today, each logged with today's date on the Loans & Advances page. This can't be undone from here.`}
        confirmLabel="Apply Deductions" />
    </div>
  );
};

/* ============================= STAFF PAYROLL (list + printable payslip) ============================= */
const StaffPayrollView = ({ staff, loans, setLoans, statutory, toast }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('current');
  const [confirmApply, setConfirmApply] = useState(false);


  const rows = staff.map(e => ({ emp: e, calc: computeStaffPayroll(e, loans, statutory) }));
  const totalGross = rows.reduce((s, r) => s + r.calc.totalEarnings, 0);
  const totalNet = rows.reduce((s, r) => s + r.calc.net, 0);

  // Loans belonging to staff (matched by name) that still owe something and aren't paused —
  // these are the ones "Apply Cutoff Deductions" will actually touch.
  const dueLoans = loans.filter(l => staff.some(s => s.name === l.person) && !l.paused && loanBalance(l) > 0);
  const dueTotal = dueLoans.reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const applyDeductions = () => {
    setLoans(prev => prev.map(l => {
      if (!dueLoans.some(d => d.id === l.id)) return l;
      const amt = Math.min(l.perCutoff, loanBalance(l));
      if (amt <= 0) return l;
      return { ...l, entries: [...l.entries, { date: todayLabel(), type: 'deduction', amount: amt, remark: `Payroll deduction — ${CUTOFF_LABEL} cutoff` }] };
    }));
    toast(`Applied ${peso(dueTotal)} in loan deductions across ${dueLoans.length} loan(s).`);
    setConfirmApply(false);
  };

  if (view === 'slip' && selectedId) {
    const e = staff.find(s => s.id === selectedId);
    const calc = computeStaffPayroll(e, loans, statutory);
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>
            <ArrowLeft size={14} /> Back to Payroll
          </button>
          <Btn variant="outline" icon={Printer} onClick={() => window.print()}>Print</Btn>
        </div>

        <style>{`
          @media print {
            body * { visibility: hidden; }
            #staff-payslip, #staff-payslip * { visibility: visible; }
            #staff-payslip { position: absolute; left: 0; top: 0; width: 100%; }
            #staff-payslip .no-print { display: none !important; }
          }
        `}</style>

        <Panel id="staff-payslip" className="max-w-md overflow-hidden">
          {/* Centered brand letterhead — matches the approved payslip reference */}
          <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: `2px solid ${T.brand}` }}>
            <div className="font-bold" style={{ fontFamily: F_HEAD, color: T.brand, fontSize: 22, letterSpacing: '0.02em' }}>PRIME DEPOT HARDWARE</div>
            <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.ink, letterSpacing: '0.04em' }}>TILES, PAINTS &amp; CONSTRUCTION SUPPLY</div>
            <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft, letterSpacing: '0.08em' }}>BRGY. P. NIOGAN, MABINI, BATANGAS</div>
          </div>

          {/* Cut-off / Name / Position */}
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            {[['Salary Cut-Off:', CUTOFF_LABEL], ["Employee's Name:", e.name], ['Position:', e.position]].map(([l, v], i) => (
              <div key={i} className="flex gap-2 text-sm py-0.5" style={{ fontFamily: F_BODY }}>
                <span style={{ color: T.soft }}>{l}</span>
                <span className="font-bold" style={{ color: T.ink }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Basic rate / days present / gross */}
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            {[['Basic Rate (Daily):', peso(e.rate)], ['Days Present:', String(calc.days)], ['Gross Salary:', peso(calc.gross)]].map(([l, v], i) => (
              <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
                <span style={{ color: T.ink }}>{l}</span>
                <span className="tabular-nums" style={{ fontFamily: F_MONO, color: T.ink, fontWeight: i === 2 ? 700 : 400 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Additions */}
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm italic mb-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Additions</div>
            {[['Overtime Pay (Weekdays):', calc.otWeekday], ['Overtime Pay (Weekends):', calc.otWeekend], ['Other Allowances:', calc.allowance]].map(([l, v], i) => (
              <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
                <span style={{ color: T.ink }}>{l}</span>
                <Money value={v} />
              </div>
            ))}
          </div>

          {/* Deductions — labelled exactly as the client's payslip */}
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm italic mb-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Deductions</div>
            {[
              ['HDMF MP1 Contribution:', e.piOn ? computePagIBIG(e.declaredSalary, statutory.pagibig) : 0, false],
              ['HDMF MP2 Contribution:', e.piOn ? (e.mp2 || 0) : 0, false],
              ['PHIC Contribution:', calc.phic, false],
              ['SSS Contribution:', calc.sss, false],
              ['Loans:', 0, false],
              ['Adjustments: Advance Payment', calc.advance, false],
              ['Tardiness:', calc.tardiness, true],
            ].map(([l, v, danger], i) => (
              <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
                <span className={danger ? 'font-bold' : ''} style={{ color: danger ? T.brand : T.ink }}>{l}</span>
                <span className="tabular-nums" style={{ fontFamily: F_MONO, color: danger ? T.brand : T.ink, fontWeight: danger ? 700 : 400 }}>{peso(v)}</span>
              </div>
            ))}
          </div>

          {/* Net salary */}
          <div className="flex justify-between items-baseline px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span className="font-bold" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 16 }}>NET SALARY:</span>
            <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: T.brand, fontSize: 20 }}>{peso(calc.net)}</span>
          </div>
          <div className="px-6 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Remarks: 0 Day/s out 5 Days of Paid Leave used</span>
          </div>

          <div className="grid grid-cols-2 gap-8 px-6 py-6 no-print">
            {["Employee's signature / Date", 'Authorized by / Date'].map(l => (
              <div key={l}><div className="h-px mb-1.5" style={{ backgroundColor: T.line }} /><div className="text-xs text-center" style={{ fontFamily: F_BODY, color: T.soft }}>{l}</div></div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6">
      <H1 sub="Bi-monthly payroll, computed for each staff member from their current-cutoff attendance.">Staff Payroll</H1>

      <div className="flex gap-1 mb-4 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft, width: 'fit-content' }}>
        {[['current', 'Current Cutoff'], ['history', 'History']].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: subTab === k ? T.surface : 'transparent', color: subTab === k ? T.ink : T.soft }}>{l}</button>
        ))}
      </div>

      {subTab === 'current' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard label="Total Gross" value={peso(totalGross)} tone="blue" icon={Wallet} />
            <StatCard label="Total Net Pay" value={peso(totalNet)} tone="green" icon={Wallet} />
            <StatCard label="Employees Computed" value={staff.length} icon={Users} />
          </div>
          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Payslips — {CUTOFF_LABEL}</Eyebrow>
              <div className="flex items-center gap-2">
                <Badge tone="green">Computed from DTR</Badge>
                <Btn size="sm" variant="outline" icon={Wallet} disabled={dueLoans.length === 0} onClick={() => setConfirmApply(true)}>Apply Cutoff Deductions</Btn>
              </div>
            </div>
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th right>Days</Th><Th right>Gross</Th><Th right>OT</Th><Th right>Deductions</Th><Th right>Net Pay</Th><Th>Payslip</Th></tr></thead>
              <tbody>
                {rows.map(({ emp, calc }) => (
                  <tr key={emp.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Av name={emp.name} size={28} />
                        <span className="font-semibold" style={{ fontFamily: F_BODY }}>{emp.name}</span>
                      </div>
                    </Td>
                    <Td right mono>{calc.days}</Td>
                    <Td right mono>{peso(calc.gross)}</Td>
                    <Td right mono><span style={{ color: T.green, fontWeight: 600 }}>+{peso(calc.ot)}</span></Td>
                    <Td right mono><span style={{ color: T.red, fontWeight: 600 }}>-{peso(calc.totalDeductions)}</span></Td>
                    <Td right mono><b>{peso(calc.net)}</b></Td>
                    <Td><Btn size="sm" variant="outline" icon={Eye} onClick={() => { setSelectedId(emp.id); setView('slip'); }}>View</Btn></Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td colSpan={2}><b>Totals</b></Td>
                  <Td right mono>{peso(rows.reduce((s, r) => s + r.calc.gross, 0))}</Td>
                  <Td /><Td />
                  <Td right mono><b style={{ color: T.amber }}>{peso(totalNet)}</b></Td>
                  <Td />
                </tr>
              </tfoot>
            </table>
          </Panel>
        </>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          <table className="w-full">
            <thead><tr><Th>Cut-off Period</Th><Th right>Employees</Th><Th right>Total Gross</Th><Th right>Total Net</Th><Th>Status</Th></tr></thead>
            <tbody>
              {[['May 1–15, 2026', staff.length, totalGross, totalNet], ['Apr 16–30, 2026', staff.length, totalGross * 0.97, totalNet * 0.97], ['Apr 1–15, 2026', staff.length - 1, totalGross * 0.9, totalNet * 0.9]].map(([period, count, g, n], i) => (
                <tr key={i}>
                  <Td><b>{period}</b></Td><Td right mono>{count}</Td><Td right mono>{peso(g)}</Td><Td right mono>{peso(n)}</Td>
                  <Td><Badge tone="green">Finalized</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply cutoff deductions?"
        message={`This will deduct ${peso(dueTotal)} total across ${dueLoans.length} active loan(s) for the ${CUTOFF_LABEL} cutoff, each logged with today's date on the Loans & Advances page. This can't be undone from here.`}
        confirmLabel="Apply Deductions" />
    </div>
  );
};

/* ============================= LOANS ============================= */
const BLANK_LOAN = { person: '', role: '', type: 'Cash Advance (Bali)', principal: '', perCutoff: '', date: '' };

const LoansView = ({ staff, loans, setLoans, toast }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK_LOAN);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const people = useMemo(() => [...staff.map(s => s.name), ...CREWS.map(c => c.driver), ...CREWS.flatMap(c => c.helpers.filter(h => h !== '—'))], [staff]);

  const addLoan = () => {
    if (!form.person || !form.principal) { toast('Person and amount are required.', 'error'); return; }
    const principal = parseFloat(form.principal) || 0;
    const grantDate = form.date ? new Date(form.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : todayLabel();
    setLoans(l => [...l, { id: 'LN-' + uid(), person: form.person, role: form.role || '—', type: form.type, principal, perCutoff: parseFloat(form.perCutoff) || principal, paused: false, entries: [{ date: grantDate, type: 'grant', amount: principal, remark: 'Granted' }] }]);
    toast('Loan / advance added.');
    setModal(false); setForm(BLANK_LOAN);
  };
  const togglePause = (id) => setLoans(l => l.map(x => x.id === id ? { ...x, paused: !x.paused } : x));
  const markPaid = (id) => {
    setLoans(l => l.map(x => {
      if (x.id !== id) return x;
      const remaining = loanBalance(x);
      if (remaining <= 0) return x;
      return { ...x, entries: [...x.entries, { date: todayLabel(), type: 'deduction', amount: remaining, remark: 'Marked fully paid — remaining balance cleared' }] };
    }));
    toast('Loan marked as fully paid.');
  };

  return (
    <div className="p-6">
      <H1 sub="Staggered loans and daily advances (bali, allowances) — tracked separately from statutory micro-deductions."
        action={<Btn icon={Plus} onClick={() => setModal(true)}>Add Loan / Advance</Btn>}>Loans & Advances</H1>
      <div className="space-y-4">
        {loans.map(l => {
          const balance = loanBalance(l);
          const pct = l.principal > 0 ? ((l.principal - balance) / l.principal) * 100 : 100;
          const paid = balance <= 0;
          const ledger = loanLedger(l);
          return (
            <Panel key={l.id} className="p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Av name={l.person} size={32} tone={T.brand} />
                  <div>
                    <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>{l.person} <span className="font-normal text-xs" style={{ color: T.soft }}>· {l.type}</span></div>
                    <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>{l.role} · ₱{l.perCutoff} per cutoff</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <Eyebrow>Balance / Principal</Eyebrow>
                    <div className="flex items-center gap-2">
                      <Money value={balance} bold size="text-base" tone={paid ? T.green : T.ink} />
                      <span className="text-xs" style={{ fontFamily: F_MONO, color: T.soft }}>/ {peso(l.principal)}</span>
                    </div>
                    <div className="mt-1"><ProgressBar pct={pct} tone={paid ? T.green : T.brand} /></div>
                  </div>
                  {!paid && (
                    <div className="flex gap-2">
                      <button onClick={() => togglePause(l.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                        style={{ fontFamily: F_HEAD, backgroundColor: l.paused ? T.greenBg : T.amberBg, color: l.paused ? T.green : T.amber }}>
                        {l.paused ? <Play size={12} /> : <Pause size={12} />} {l.paused ? 'Resume' : 'Pause'}
                      </button>
                      <button onClick={() => markPaid(l.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: T.lineSoft, color: T.ink }}>
                        <Check size={12} /> Mark Paid
                      </button>
                    </div>
                  )}
                  {paid && <Badge tone="green">Fully Paid</Badge>}
                </div>
              </div>
              <table className="w-full">
                <thead><tr><Th>Date</Th><Th>Type</Th><Th>Remarks</Th><Th right>Amount</Th><Th right>Balance After</Th></tr></thead>
                <tbody>{ledger.map((en, i) => (
                  <tr key={i}>
                    <Td mono>{en.date}</Td>
                    <Td><Badge tone={en.type === 'grant' ? 'blue' : 'red'}>{en.type === 'grant' ? 'Given' : 'Deducted'}</Badge></Td>
                    <Td>{en.remark}</Td>
                    <Td right mono style={{ color: en.type === 'grant' ? T.blue : T.red, fontWeight: 600 }}>{en.type === 'grant' ? '+' : '-'}{peso(en.amount)}</Td>
                    <Td right mono>{peso(en.runningBalance)}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </Panel>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Loan / Advance">
        <div className="space-y-3">
          <Field label="Person*">
            <input list="people-list" value={form.person} onChange={e => ff('person', e.target.value)} placeholder="Start typing a name…" className={inputCls} style={inputStyle} />
            <datalist id="people-list">{people.map((p, i) => <option key={p + '-' + i} value={p} />)}</datalist>
          </Field>
          <Field label="Role / Assignment"><input value={form.role} onChange={e => ff('role', e.target.value)} placeholder="e.g. Driver · TRK-04" className={inputCls} style={inputStyle} /></Field>
          <Field label="Type">
            <select value={form.type} onChange={e => ff('type', e.target.value)} className={inputCls} style={inputStyle}>
              {['Cash Advance (Bali)', 'Cash Advance', 'School Allowance', 'SSS Salary Loan', 'Pag-IBIG Multi-Purpose Loan', 'Company Cash Advance'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal (₱)*"><input type="number" value={form.principal} onChange={e => ff('principal', e.target.value)} className={inputCls} style={inputStyle} /></Field>
            <Field label="Per-cutoff deduction (₱)"><input type="number" value={form.perCutoff} onChange={e => ff('perCutoff', e.target.value)} placeholder="Blank = full amount" className={inputCls} style={inputStyle} /></Field>
          </div>
          <Field label="Date granted"><input type="date" value={form.date} onChange={e => ff('date', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn icon={Save} onClick={addLoan}>Add</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ============================= REPORTS ============================= */
const ReportsView = ({ staff, deliveries, loans, statutory }) => {
  const [tab, setTab] = useState('register');

  const registerRows = staff.map(e => {
    const gross = e.rate * 11;
    const sss = e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) : 0;
    const ph = e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) : 0;
    const hdmf = e.piOn ? (computePagIBIG(e.declaredSalary, statutory.pagibig) + (e.mp2 || 0)) : 0;
    return { emp: e, gross, sss, ph, hdmf, net: gross - sss - ph - hdmf };
  });
  const T13 = staff.map(e => ({ name: e.name, months: 12, basic: e.rate * 22 * 12, pay: Math.round(e.rate * 22 * 12 / 12 * 100) / 100 }));
  const driverStats = CREWS.map(c => {
    const log = deliveries[c.id];
    const trips = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
    const earn = log ? DRIVER_DAILY + log.items.reduce((s, i) => s + i.d, 0) + (trips >= BONUS_TRIPS ? BONUS_HEAD : 0) : 0;
    return { crew: c, trips, earn, bonus: trips >= BONUS_TRIPS };
  });

  const exportRegister = () => exportXLSX('Payroll-Register.xlsx', [{ name: 'Register', rows: registerRows.map(r => ({ Employee: r.emp.name, Gross: r.gross, SSS: r.sss, PhilHealth: r.ph, 'Pag-IBIG': r.hdmf, Net: r.net })) }]);
  const exportRemit = () => exportXLSX('Gov-Remittance.xlsx', [{ name: 'Remittance', rows: registerRows.map(r => ({ Employee: r.emp.name, SSS: r.sss, PhilHealth: r.ph, 'Pag-IBIG': r.hdmf, Total: r.sss + r.ph + r.hdmf })) }]);
  const export13 = () => exportXLSX('13th-Month-Pay.xlsx', [{ name: '13th Month', rows: T13.map(r => ({ Employee: r.name, 'Months Worked': r.months, 'Total Basic': r.basic, '13th Month Pay': r.pay })) }]);
  const exportDriver = () => exportXLSX('Driver-Earnings.xlsx', [{ name: 'Drivers', rows: driverStats.map(d => ({ Driver: d.crew.driver, Truck: d.crew.id, Trips: d.trips, 'Total Earned': d.earn })) }]);

  const tabs = [['register', 'Payroll Register'], ['remittance', "Gov't Remittance"], ['13th', '13th Month Pay'], ['drivers', 'Driver & Delivery'], ['bir', 'BIR Reference']];

  return (
    <div className="p-6">
      <H1 sub="Payroll, government compliance, and delivery earnings reports.">Reports</H1>
      <div className="flex gap-1 mb-4 flex-wrap rounded-md p-0.5" style={{ backgroundColor: T.lineSoft, width: 'fit-content' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: tab === k ? T.surface : 'transparent', color: tab === k ? T.ink : T.soft }}>{l}</button>
        ))}
      </div>

      {tab === 'register' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Payroll Register — May 16–31, 2026</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportRegister}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>Gross</Th><Th right>SSS</Th><Th right>PhilHealth</Th><Th right>Pag-IBIG</Th><Th right>Net Pay</Th></tr></thead>
            <tbody>{registerRows.map((r, i) => <tr key={i}><Td>{r.emp.name}</Td><Td right mono>{peso(r.gross)}</Td><Td right mono>{peso(r.sss)}</Td><Td right mono>{peso(r.ph)}</Td><Td right mono>{peso(r.hdmf)}</Td><Td right mono>{peso(r.net)}</Td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {tab === 'remittance' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Government Remittance — Employee Share</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportRemit}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>SSS</Th><Th right>PhilHealth</Th><Th right>Pag-IBIG</Th><Th right>Total Withheld</Th></tr></thead>
            <tbody>{registerRows.map((r, i) => <tr key={i}><Td>{r.emp.name}</Td><Td right mono>{peso(r.sss)}</Td><Td right mono>{peso(r.ph)}</Td><Td right mono>{peso(r.hdmf)}</Td><Td right mono>{peso(r.sss + r.ph + r.hdmf)}</Td></tr>)}</tbody>
          </table>
          <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.line}` }}><AlertTriangle size={12} /> Estimated employee-share figures for this prototype. Add employer counterpart before remitting.</div>
        </Panel>
      )}
      {tab === '13th' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>13th Month Pay — FY 2026 (Basic ÷ 12)</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={export13}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>Months Worked</Th><Th right>Total Basic</Th><Th right>13th Month Pay</Th></tr></thead>
            <tbody>{T13.map((r, i) => <tr key={i}><Td>{r.name}</Td><Td right mono>{r.months}</Td><Td right mono>{peso(r.basic)}</Td><Td right mono>{peso(r.pay)}</Td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {tab === 'drivers' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Driver & Delivery Earnings</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportDriver}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Driver</Th><Th>Truck</Th><Th right>Trips</Th><Th>Bonus</Th><Th right>Total Earned</Th></tr></thead>
            <tbody>{driverStats.map((d, i) => <tr key={i}><Td>{d.crew.driver}</Td><Td mono>{d.crew.id}</Td><Td right mono>{d.trips}</Td><Td>{d.bonus && <Badge tone="amber">Palima</Badge>}</Td><Td right mono>{peso(d.earn)}</Td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {tab === 'bir' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}><Eyebrow>BIR TRAIN Law — Withholding Tax Reference</Eyebrow></div>
          <table className="w-full">
            <thead><tr><Th>Over</Th><Th>Not Over</Th><Th right>Base Tax</Th><Th right>Rate on Excess</Th></tr></thead>
            <tbody>{statutory.bir.map((r, i) => <tr key={i}><Td mono>{peso(r.over)}</Td><Td mono>{r.notOver === null ? 'Above' : peso(r.notOver)}</Td><Td right mono>{peso(r.base)}</Td><Td right mono>{r.rate}%</Td></tr>)}</tbody>
          </table>
          <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.green, borderTop: `1px solid ${T.line}`, backgroundColor: T.greenBg }}><Check size={12} /> All current employees fall below the taxable threshold — ₱0 withholding tax.</div>
        </Panel>
      )}
    </div>
  );
};

/* ============================= SETTINGS ============================= */
const SettingsView = ({ checkers, setCheckers, sssTable, setSssTable, philhealthRates, setPhilhealthRates, pagibigRates, setPagibigRates, birTable, setBirTable, toast }) => {
  const [tab, setTab] = useState('statutory');
  const [editSss, setEditSss] = useState(false);
  const [sssDraft, setSssDraft] = useState(sssTable);
  const [editPh, setEditPh] = useState(false);
  const [phDraft, setPhDraft] = useState(philhealthRates);
  const [editPi, setEditPi] = useState(false);
  const [piDraft, setPiDraft] = useState(pagibigRates);
  const [editBir, setEditBir] = useState(false);
  const [birDraft, setBirDraft] = useState(birTable);
  const [testSalary, setTestSalary] = useState('16900');

  const testResult = useMemo(() => {
    const sal = parseFloat(testSalary) || 0;
    return { sss: computeSSS(sal, sssTable), ph: computePhilHealth(sal, philhealthRates), pi: computePagIBIG(sal, pagibigRates) };
  }, [testSalary, sssTable, philhealthRates, pagibigRates]);

  return (
    <div className="p-6">
      <H1 sub="Admin-editable rates. Editing these changes real payslip numbers going forward — past payslips already computed are unaffected.">Settings</H1>
      <div className="flex gap-1 mb-4 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft, width: 'fit-content' }}>
        {[['statutory', 'Statutory Deductions'], ['accounts', 'Account Access']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: tab === k ? T.surface : 'transparent', color: tab === k ? T.ink : T.soft }}>{l}</button>
        ))}
      </div>

      {tab === 'statutory' && (
        <div className="space-y-4">
          <Panel className="p-4">
            <Eyebrow>Try a declared salary</Eyebrow>
            <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Check what the tables below actually produce, before saving changes to a live payslip.</div>
            <div className="flex items-end gap-4 flex-wrap">
              <div style={{ width: 180 }}><Field label="Declared monthly salary (₱)"><input type="number" value={testSalary} onChange={e => setTestSalary(e.target.value)} className={inputCls} style={inputStyle} /></Field></div>
              <div className="flex gap-6">
                <div><Eyebrow>SSS / cutoff</Eyebrow><Money value={testResult.sss} bold size="text-base" /></div>
                <div><Eyebrow>PhilHealth / cutoff</Eyebrow><Money value={testResult.ph} bold size="text-base" /></div>
                <div><Eyebrow>Pag-IBIG / cutoff</Eyebrow><Money value={testResult.pi} bold size="text-base" /></div>
              </div>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>SSS Contribution Table — employee share by declared monthly salary</Eyebrow>
              {editSss ? (
                <div className="flex gap-2">
                  <Btn size="sm" icon={Save} onClick={() => { setSssTable(sssDraft); setEditSss(false); toast('SSS table saved.'); }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setSssDraft(sssTable); setEditSss(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setSssDraft(sssTable); setEditSss(true); }}>Edit</Btn>}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              <table className="w-full">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}><tr><Th>Salary below (₱)</Th><Th right>Employee share / month (₱)</Th><Th right>Per cutoff (₱)</Th>{editSss && <Th></Th>}</tr></thead>
                <tbody>{(editSss ? sssDraft : sssTable).map((r, i) => (
                  <tr key={i}>
                    <Td>{editSss
                      ? (r.ceiling === null ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>and up</span>
                        : <input type="number" value={r.ceiling} onChange={e => setSssDraft(p => p.map((x, j) => j === i ? { ...x, ceiling: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-24" style={{ borderColor: T.line, fontFamily: F_MONO }} />)
                      : (r.ceiling === null ? 'and up' : peso(r.ceiling))}
                    </Td>
                    <Td right mono>{editSss
                      ? <input type="number" value={r.share} onChange={e => setSssDraft(p => p.map((x, j) => j === i ? { ...x, share: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-24 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                      : peso(r.share)}
                    </Td>
                    <Td right mono>{peso((editSss ? r.share : r.share) / 2)}</Td>
                    {editSss && <Td><button onClick={() => setSssDraft(p => p.filter((_, j) => j !== i))}><Trash2 size={13} color={T.red} /></button></Td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {editSss && <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
              <button onClick={() => setSssDraft(p => [...p.slice(0, -1), { ceiling: (p[p.length - 2]?.ceiling || 0) + 500, share: p[p.length - 1].share }, p[p.length - 1]])} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.blue }}><Plus size={12} /> Add bracket</button>
            </div>}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>PhilHealth — % of declared salary, split 50/50 employer/employee</Eyebrow>
              {editPh ? (
                <div className="flex gap-2">
                  <Btn size="sm" icon={Save} onClick={() => { setPhilhealthRates(phDraft); setEditPh(false); toast('PhilHealth rate saved.'); }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setPhDraft(philhealthRates); setEditPh(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setPhDraft(philhealthRates); setEditPh(true); }}>Edit</Btn>}
            </div>
            <div className="grid grid-cols-3 gap-4 p-4">
              {[['rate', 'Premium rate (%)'], ['floor', 'Salary floor (₱)'], ['ceiling', 'Salary ceiling (₱)']].map(([k, l]) => (
                <Field key={k} label={l}>
                  {editPh ? <input type="number" value={phDraft[k]} onChange={e => setPhDraft(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))} className={inputCls} style={inputStyle} />
                    : <div className="text-sm font-semibold" style={{ fontFamily: F_MONO, color: T.ink }}>{k === 'rate' ? `${philhealthRates[k]}%` : peso(philhealthRates[k])}</div>}
                </Field>
              ))}
            </div>
          </Panel>

          <div className="grid md:grid-cols-2 gap-4">
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>Pag-IBIG (HDMF)</Eyebrow>
                {editPi ? (
                  <div className="flex gap-2">
                    <Btn size="sm" icon={Save} onClick={() => { setPagibigRates(piDraft); setEditPi(false); toast('Pag-IBIG rates saved.'); }}>Save</Btn>
                    <Btn size="sm" variant="outline" onClick={() => { setPiDraft(pagibigRates); setEditPi(false); }}>Cancel</Btn>
                  </div>
                ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setPiDraft(pagibigRates); setEditPi(true); }}>Edit</Btn>}
              </div>
              <table className="w-full">
                <thead><tr><Th>Salary up to (₱)</Th><Th right>Employee %</Th></tr></thead>
                <tbody>{(editPi ? piDraft.brackets : pagibigRates.brackets).map((b, i) => (
                  <tr key={i}>
                    <Td>{editPi
                      ? (b.ceiling === null ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>and up</span>
                        : <input type="number" value={b.ceiling} onChange={e => setPiDraft(p => ({ ...p, brackets: p.brackets.map((x, j) => j === i ? { ...x, ceiling: parseFloat(e.target.value) || 0 } : x) }))} className="px-2 py-1 rounded border text-xs w-24" style={{ borderColor: T.line, fontFamily: F_MONO }} />)
                      : (b.ceiling === null ? 'and up' : peso(b.ceiling))}
                    </Td>
                    <Td right mono>{editPi
                      ? <input type="number" value={b.eePct} onChange={e => setPiDraft(p => ({ ...p, brackets: p.brackets.map((x, j) => j === i ? { ...x, eePct: parseFloat(e.target.value) || 0 } : x) }))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                      : `${b.eePct}%`}
                    </Td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${T.line}` }}>
                <span className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.soft }}>Monthly cap (₱)</span>
                {editPi ? <input type="number" value={piDraft.cap} onChange={e => setPiDraft(p => ({ ...p, cap: parseFloat(e.target.value) || 0 }))} className="px-2 py-1 rounded border text-xs w-24 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                  : <span className="text-sm font-semibold" style={{ fontFamily: F_MONO }}>{peso(pagibigRates.cap)}</span>}
              </div>
            </Panel>
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>BIR Withholding Tax Brackets</Eyebrow>
                {editBir ? (
                  <div className="flex gap-2">
                    <Btn size="sm" icon={Save} onClick={() => { setBirTable(birDraft); setEditBir(false); toast('BIR table saved.'); }}>Save</Btn>
                    <Btn size="sm" variant="outline" onClick={() => { setBirDraft(birTable); setEditBir(false); }}>Cancel</Btn>
                  </div>
                ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setBirDraft(birTable); setEditBir(true); }}>Edit</Btn>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><Th>Over</Th><Th>Not over</Th><Th right>Base</Th><Th right>Rate %</Th>{editBir && <Th></Th>}</tr></thead>
                  <tbody>{(editBir ? birDraft : birTable).map((r, i) => (
                    <tr key={i}>
                      <Td mono>{editBir ? <input type="number" value={r.over} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, over: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-20" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.over)}</Td>
                      <Td mono>{editBir
                        ? (r.notOver === null ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>above</span> : <input type="number" value={r.notOver} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, notOver: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-20" style={{ borderColor: T.line, fontFamily: F_MONO }} />)
                        : (r.notOver === null ? 'Above' : peso(r.notOver))}
                      </Td>
                      <Td right mono>{editBir ? <input type="number" value={r.base} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, base: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-20 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.base)}</Td>
                      <Td right mono>{editBir ? <input type="number" value={r.rate} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-14 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : `${r.rate}%`}</Td>
                      {editBir && <Td><button onClick={() => setBirDraft(p => p.filter((_, j) => j !== i))}><Trash2 size={13} color={T.red} /></button></Td>}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {editBir && <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
                <button onClick={() => setBirDraft(p => [...p.slice(0, -1), { over: p[p.length - 1].over, notOver: p[p.length - 1].over + 100000, base: p[p.length - 1].base, rate: p[p.length - 1].rate }, p[p.length - 1]])} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.blue }}><Plus size={12} /> Add bracket</button>
              </div>}
              <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.green, borderTop: `1px solid ${T.line}`, backgroundColor: T.greenBg }}><Check size={12} /> Reference only — not yet wired into an actual withholding deduction. All current employees fall below the exempt threshold anyway.</div>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'accounts' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>Checker Accounts</Eyebrow>
            <Btn size="sm" icon={Plus} onClick={() => setCheckers(c => [...c, { id: 'CHK-0' + (c.length + 1), name: 'New checker', user: 'checker.new' }])}>Create Checker Account</Btn>
          </div>
          <Panel className="overflow-hidden">
            <table className="w-full">
              <thead><tr><Th>ID</Th><Th>Assignment</Th><Th>Username</Th><Th>Access</Th></tr></thead>
              <tbody>{checkers.map(c => <tr key={c.id}><Td mono>{c.id}</Td><Td>{c.name}</Td><Td mono>{c.user}</Td><Td><Badge tone="amber">Delivery entry only</Badge></Td></tr>)}</tbody>
            </table>
          </Panel>
          <p className="text-xs mt-3" style={{ fontFamily: F_BODY, color: T.soft }}>
            Checkers cannot view salaries, personal details, or other admin pages — the backend enforces this with route-level 403s, not just hidden UI. They can log a delivery for any truck.
          </p>
        </div>
      )}
    </div>
  );
};

/* ============================= CHECKER VIEW (top-nav, all trucks) ============================= */
const CheckerView = ({ deliveries, setDeliveries, rates, onLogout, toast }) => {
  const [page, setPage] = useState('log');

  const logDelivery = (cId, address, customer, items, helpers) => {
    setDeliveries(prev => {
      const existing = prev[cId] || { date: 'Jul 16, 2026', items: [], kaltas: [] };
      const nums = existing.items.map(i => i.seq).filter(Boolean);
      const nextSeq = nums.length ? Math.max(...nums) + 1 : 1;
      const crewDef = (CREWS.find(c => c.id === cId)?.helpers || []).filter(h => h !== '—');
      const usedHelpers = helpers !== undefined ? helpers : crewDef; // [] means the checker explicitly recorded no helper that trip
      const isSwap = JSON.stringify(usedHelpers) !== JSON.stringify(crewDef);
      const newItems = items.map((r, i) => ({ seq: i === 0 ? nextSeq : null, address: i === 0 ? address : '', customer: i === 0 ? customer : '', item: r.item, qty: r.qty, unit: r.unit, d: r.d, h: r.h, dbl: r.dbl, helpers: i === 0 ? usedHelpers : undefined, swap: i === 0 ? isSwap : undefined }));
      return { ...prev, [cId]: { ...existing, items: [...existing.items, ...newItems] } };
    });
    const crew = CREWS.find(c => c.id === cId);
    toast(`Delivery logged for ${crew.driver}'s truck (${cId}).`);
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries), [deliveries]);
  const trucksActive = new Set(allTrips.map(t => t.crewId)).size;
  const bonusTrucks = CREWS.filter(c => {
    const log = deliveries[c.id];
    const tc = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
    return tc >= BONUS_TRIPS;
  }).length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg }}>
      <style>{FONTS}</style>
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-5 py-3" style={{ backgroundColor: T.sidebar }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-white text-xs shrink-0" style={{ backgroundColor: T.amber, fontFamily: F_HEAD }}>PD</div>
          <div>
            <div className="text-xs uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.08em' }}>Prime Depot — Checker</div>
            <div className="text-sm font-bold text-white" style={{ fontFamily: F_HEAD }}>Delivery Dispatch — All Trucks</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[['log', 'Delivery Log'], ['account', 'Account']].map(([k, l]) => (
            <button key={k} onClick={() => setPage(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: page === k ? 'rgba(255,255,255,0.1)' : 'transparent', color: page === k ? '#fff' : T.sidebarSoft }}>{l}</button>
          ))}
          <Av name="Checker" size={28} tone={T.amber} />
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}><LogOut size={15} /></button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3.5 sm:p-5">
        {page === 'log' && (
          <>
            <div className="mb-4 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.blueBg }}>
              <ShieldCheck size={16} color={T.blue} className="mt-0.5 shrink-0" />
              <div className="text-xs" style={{ fontFamily: F_BODY, color: T.ink }}>You can log a delivery for any truck, and swap in a substitute pahinante for the day if a regular helper is out. Salaries, personal details, and other admin pages are not visible from here.</div>
            </div>

            <Panel className="p-4 mb-4">
              <div className="flex flex-wrap justify-around gap-3">
                <BigStat value={allTrips.length} label="Deliveries Logged" />
                <BigStat value={trucksActive} label="Trucks Active" tone={T.blue} />
                <BigStat value={bonusTrucks} label="Trucks at Bonus" tone={T.amber} />
              </div>
            </Panel>

            <Panel className="p-4 mb-4">
              <Eyebrow>New Delivery</Eyebrow>
              <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Pick the truck this delivery is for — you can log for any crew, and swap a helper if needed.</div>
              <DeliveryForm crews={CREWS} rates={rates} onSubmit={logDelivery} />
            </Panel>

            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>Delivery History ({allTrips.length})</Eyebrow>
              </div>
              {allTrips.length === 0 ? (
                <EmptyState icon={Truck} title="No entries yet" desc="Log the first delivery above for any truck." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><Th>Date</Th><Th>Truck</Th><Th>Driver</Th><Th>Pahinante</Th><Th>Address</Th><Th right>Driver Earn</Th><Th>Trip</Th></tr></thead>
                    <tbody>{allTrips.slice().reverse().map((t, i) => {
                      const crew = CREWS.find(c => c.id === t.crewId);
                      const isBonusTrip = t.seq >= BONUS_TRIPS;
                      return (
                        <tr key={i} style={{ backgroundColor: isBonusTrip ? '#FBF0DE' : 'transparent' }}>
                          <Td mono>{t.date}</Td>
                          <Td mono>{t.crewId}</Td>
                          <Td>{crew?.driver || '—'}</Td>
                          <Td>{t.helpers?.length ? <span className="flex items-center gap-1.5">{t.helpers.join(' & ')}{t.swap && <Badge tone="amber">SUB</Badge>}</span> : '—'}</Td>
                          <Td>{t.address}</Td>
                          <Td right mono>{peso(t.d)}</Td>
                          <Td>
                            {t.seq && (
                              <span className="flex items-center gap-1">
                                #{t.seq}{isBonusTrip && <Star size={11} color={T.amber} fill={T.amber} />}
                              </span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
        {page === 'account' && (
          <Panel className="p-5 max-w-md">
            <Eyebrow>Profile</Eyebrow>
            <div className="text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>Checker account — general dispatch access (all trucks).</div>
            <div className="space-y-3">
              <Field label="Username"><input defaultValue="checker01" className={inputCls} style={inputStyle} readOnly /></Field>
              <Field label="New password"><input type="password" placeholder="Leave blank to keep current" className={inputCls} style={inputStyle} /></Field>
            </div>
            <div className="mt-4"><Btn icon={Save} onClick={() => toast('Account settings saved.')} full>Save changes</Btn></div>
          </Panel>
        )}
      </div>
    </div>
  );
};


/* ============================= APP ============================= */
export default function PrimeDepotPayroll() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [staff, setStaff] = useState(STAFF_INIT);
  const [deliveries, setDeliveries] = useState(DELIVERIES_INIT);
  const [rates, setRates] = useState(RATES_INIT);
  const [loans, setLoans] = useState(LOANS_INIT);
  const [checkers, setCheckers] = useState(CHECKERS_INIT);
  const [sssTable, setSssTable] = useState(SSS_TABLE_INIT);
  const [philhealthRates, setPhilhealthRates] = useState(PHILHEALTH_INIT);
  const [pagibigRates, setPagibigRates] = useState(PAGIBIG_INIT);
  const [birTable, setBirTable] = useState(BIR_TABLE_INIT);
  const statutory = { sss: sssTable, philhealth: philhealthRates, pagibig: pagibigRates, bir: birTable };
  const [toasts, setToasts] = useState([]);

  const toast = (msg, type = 'success') => {
    const id = uid();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };

  if (!role) return <LoginView onLogin={setRole} />;
  if (role === 'checker') return <>
    <Toasts toasts={toasts} />
    <CheckerView deliveries={deliveries} setDeliveries={setDeliveries} rates={rates} onLogout={() => setRole(null)} toast={toast} />
  </>;

  const titles = {
    dashboard: 'Overview', employees: 'Employees', attendance: 'Attendance', truck: 'Truck Payroll',
    staff: 'Staff Payroll', loans: 'Loans & Advances', reports: 'Reports', settings: 'Settings',
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: T.bg, fontFamily: F_BODY }}>
      <style>{FONTS}</style>
      <Toasts toasts={toasts} />
      <Sidebar tab={tab} setTab={setTab} onLogout={() => setRole(null)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title={titles[tab]} role={role} cutoff="May 01–15" />
        <div className="flex-1 overflow-y-auto">
          {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} loans={loans} statutory={statutory} setTab={setTab} />}
          {tab === 'employees' && <EmployeesView staff={staff} setStaff={setStaff} toast={toast} />}
          {tab === 'attendance' && <AttendanceView staff={staff} toast={toast} />}
          {tab === 'truck' && <TruckPayrollView deliveries={deliveries} setDeliveries={setDeliveries} rates={rates} setRates={setRates} loans={loans} setLoans={setLoans} toast={toast} />}
          {tab === 'staff' && <StaffPayrollView staff={staff} loans={loans} setLoans={setLoans} statutory={statutory} toast={toast} />}
          {tab === 'loans' && <LoansView staff={staff} loans={loans} setLoans={setLoans} toast={toast} />}
          {tab === 'reports' && <ReportsView staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} />}
          {tab === 'settings' && <SettingsView checkers={checkers} setCheckers={setCheckers} sssTable={sssTable} setSssTable={setSssTable} philhealthRates={philhealthRates} setPhilhealthRates={setPhilhealthRates} pagibigRates={pagibigRates} setPagibigRates={setPagibigRates} birTable={birTable} setBirTable={setBirTable} toast={toast} />}
        </div>
      </div>
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around py-2 z-10" style={{ backgroundColor: T.sidebar }}>
        {ADMIN_NAV.slice(0, 5).map(item => {
          const Icon = item.icon;
          return <button key={item.key} onClick={() => setTab(item.key)} className="p-2"><Icon size={18} color={tab === item.key ? '#fff' : T.sidebarSoft} /></button>;
        })}
      </div>
    </div>
  );
}
