export const FINAL_POSITIONS = [
  'Operations Head',
  'Assistant',
  'Communications Officer II',
  'Communications Officer I',
  'Junior Secretary',
  'Collection Officer',
  'Job Order',
  'Warehouse Officer',
  'Pahinante',
  'Checker',
  'Driver',
];

const both = (pairs) => new Set(pairs.flat());

const PIECE_RATE = both([['DRIVER', 'Driver'], ['PAHINANTE', 'Pahinante']]);
const DAILY_ATTENDANCE = both([['CHECKER', 'Checker'], ['WAREHOUSE_OFFICER', 'Warehouse Officer']]);
const NON_REGULAR = both([['JOB_ORDER', 'Job Order']]);

export const isPieceRatePosition = (position) => PIECE_RATE.has(position);
export const isDailyAttendancePosition = (position) => DAILY_ATTENDANCE.has(position);
export const isDailyPosition = (position) => isPieceRatePosition(position) || isDailyAttendancePosition(position);
export const isNonRegularPosition = (position) => NON_REGULAR.has(position);
export const isLegacyPosition = (position) => !!position && !FINAL_POSITIONS.includes(position);
