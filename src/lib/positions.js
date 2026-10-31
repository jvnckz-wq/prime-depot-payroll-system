// Positions and what each one means for pay: piece-rate, daily, no contributions, no early shift.
export const FINAL_POSITIONS = [
  'Operations Head',
  'Assistant',
  'Communications Officer II',
  'Communications Officer I',
  'Junior Secretary',
  'Collection Officer',
  'Job Order',
  'Warehouse Officer',
  'Helper',
  'Checker',
  'Driver',
];

const both = (pairs) => new Set(pairs.flat());

// Each set holds both the database name and the label, so either form can be checked.
const PIECE_RATE = both([['DRIVER', 'Driver'], ['HELPER', 'Helper']]);
const DAILY_ATTENDANCE = both([['CHECKER', 'Checker'], ['WAREHOUSE_OFFICER', 'Warehouse Officer']]);
const NON_REGULAR = both([['JOB_ORDER', 'Job Order']]);

export const isPieceRatePosition = (position) => PIECE_RATE.has(position);
export const isDailyAttendancePosition = (position) => DAILY_ATTENDANCE.has(position);
export const isDailyPosition = (position) => isPieceRatePosition(position) || isDailyAttendancePosition(position);
export const isNonRegularPosition = (position) => NON_REGULAR.has(position);
// No government contributions for daily-paid positions (Driver, Helper, Checker, Warehouse Officer)
// or for Job Order.
export const hasNoContributions = (position) => isDailyPosition(position) || isNonRegularPosition(position);

// Operations Head and crew (Crew Payroll positions) never have an early shift.
export const hasNoEarlyShift = (position) => position === 'OPERATIONS_HEAD' || position === 'Operations Head' || isDailyPosition(position) || isNonRegularPosition(position);
