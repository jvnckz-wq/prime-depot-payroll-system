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

export const CREW_POSITIONS = ['Driver', 'Pahinante'];

const POSITION_LABELS = { Pahinante: 'Delivery Helper' };
export const positionLabel = (p) => POSITION_LABELS[p] || p;

export const CREW_RATE_FALLBACK = {
  driverDaily: 280,
  helperDaily: 240,
  bonusHead: 100,
  bonusTrips: 5,
};

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
