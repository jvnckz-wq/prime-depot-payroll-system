import { FINAL_POSITIONS } from '../lib/positions.js';

export const POSITIONS = FINAL_POSITIONS;

const POSITION_LABELS = { Pahinante: 'Helper' };
export const positionLabel = (p) => POSITION_LABELS[p] || p;

export const CREW_RATE_FALLBACK = {
  driverDaily: 280,
  helperDaily: 240,
  bonusHead: 100,
  bonusTrips: 5,
  dailyContribution: null,
  minimumDailyWage: null,
};

export const SSS_TABLE_INIT = Array.from({ length: 61 }, (_, i) => ({
  ceiling: i === 60 ? null : 5250 + i * 500,
  share: 250 + i * 25,
}));

export const PHILHEALTH_INIT = { rate: 5, floor: 10000, ceiling: 100000 };

export const PAGIBIG_INIT = { brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }], cap: 200 };

export const BIR_TABLE_INIT = [
  { over: 0, notOver: 250000, base: 0, rate: 0 },
  { over: 250000, notOver: 400000, base: 0, rate: 15 },
  { over: 400000, notOver: 800000, base: 22500, rate: 20 },
  { over: 800000, notOver: 2000000, base: 102500, rate: 25 },
  { over: 2000000, notOver: 8000000, base: 402500, rate: 30 },
  { over: 8000000, notOver: null, base: 2202500, rate: 35 },
];
