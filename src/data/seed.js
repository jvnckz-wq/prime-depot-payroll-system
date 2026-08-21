// Job positions available at registration. The position alone decides which
// payroll module an employee belongs to — see isCrewPosition() in lib/payroll.
// There is deliberately no separate "employee type" field: two fields that mean
// the same thing can disagree, and then nobody knows which one to trust.
//
// "Secretary — Special 6:00 AM Shift" used to sit in this list. It was never a
// job: it was one administrative staff member reporting early on certain days.
// That now lives on the employee record as an early-shift schedule, so one
// person is one person regardless of what time they start.
export const POSITIONS = [
  'Operations Head',
  'Administrative Staff',
  'Administrative Assistant',
  'Communications Officer II',
  'Junior Secretary',
  'Job Order',
  'Trainee',
  'Checker',
  'Driver',
  'Pahinante',
];

// Positions paid by the piece-rate (pakyawan) module instead of staff payroll.
export const CREW_POSITIONS = ['Driver', 'Pahinante'];

// Display-only relabelling. The stored/canonical value stays "Pahinante" (that
// is what CREW_POSITIONS, the crew-earnings math, and every existing employee
// record use), but the client wants the English term shown in the UI. Map only
// at render time so no data or payroll logic changes.
const POSITION_LABELS = { Pahinante: 'Delivery Helper' };
export const positionLabel = (p) => POSITION_LABELS[p] || p;
// Named barangays/sitios that qualify for the DOBLE (double) piece-rate, taken
// directly from the "DOBLE" sheet in the client's real TRUCK_PAYROLL.xlsx.
export const DOBLE_AREAS = [
  'Estrellang Langit', 'Balanoy', 'Bauan', 'Tulo Laurel', 'Gulod Bagalangit', 'Orense',
  'Laurel', 'Malagaklak Ligaya', 'Matala Gulugod', 'Panay', 'Malimatoc 2', 'Guitisan San Teodoro',
  'Yong Yong Malimatoc 2', 'Hulo Solo', 'Mainit', 'Kina Piolo Pascual', 'Nagiba',
  'Nangkaan San Teodoro', 'Sta Monica Nagiba', 'Pang Akle', 'Sampalucan',
];
// Crew pakyawan rates — FALLBACK ONLY.
//
// The live values live in the database (the CrewRate table) and arrive with
// GET /api/rates, so the Operations Head can change a rate without a redeploy
// and so a payslip is never built from numbers that happened to be compiled
// into somebody's browser bundle. This object is what the views fall back to
// when that request fails: a delivery card showing stale-but-plausible rates is
// more useful than one showing ₱0, and it matches the seeded row exactly.
//
// Daily rates are PER PERSON. The ₱480 figure in the client's workbook covers
// two pahinante, so one pahinante is ₱240 — and a lone helper is still ₱240,
// not the whole ₱480. Storing the per-person number removes the need to
// remember that division anywhere else.
export const CREW_RATE_FALLBACK = {
  driverDaily: 280,
  helperDaily: 240,
  bonusHead: 100,
  bonusTrips: 5,
};
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
