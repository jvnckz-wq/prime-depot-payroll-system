import { isDailyPosition, isNonRegularPosition, isPieceRatePosition } from '../../positions';

export const POSITION_LABEL = {
  OPERATIONS_HEAD: 'Operations Head',
  ADMINISTRATIVE_STAFF: 'Administrative Staff',
  SECRETARY_SPECIAL_SHIFT: 'Administrative Staff',
  CHECKER: 'Checker',
  DRIVER: 'Driver',
  PAHINANTE: 'Pahinante',
  ADMINISTRATIVE_ASSISTANT: 'Assistant',
  COMMUNICATIONS_OFFICER_II: 'Communications Officer II',
  JUNIOR_SECRETARY: 'Junior Secretary',
  JOB_ORDER: 'Job Order',
  TRAINEE: 'Trainee',
  COMMUNICATIONS_OFFICER_I: 'Communications Officer I',
  COLLECTION_OFFICER: 'Collection Officer',
  WAREHOUSE_OFFICER: 'Warehouse Officer',
};

const POSITION_ENUM = {
  'Operations Head': 'OPERATIONS_HEAD',
  'Administrative Staff': 'ADMINISTRATIVE_STAFF',
  Checker: 'CHECKER',
  Driver: 'DRIVER',
  Pahinante: 'PAHINANTE',
  Assistant: 'ADMINISTRATIVE_ASSISTANT',
  'Administrative Assistant': 'ADMINISTRATIVE_ASSISTANT',
  'Communications Officer II': 'COMMUNICATIONS_OFFICER_II',
  'Communications Officer I': 'COMMUNICATIONS_OFFICER_I',
  'Junior Secretary': 'JUNIOR_SECRETARY',
  'Collection Officer': 'COLLECTION_OFFICER',
  'Job Order': 'JOB_ORDER',
  Trainee: 'TRAINEE',
  'Warehouse Officer': 'WAREHOUSE_OFFICER',
};

const VALID_WEEKDAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

const num = (d) => (d == null ? 0 : Number(d));

export function shapeEmployee(e) {
  const nonRegular = isNonRegularPosition(e.position);
  return {
    id: e.id,
    name: e.name,
    position: POSITION_LABEL[e.position] ?? e.position,
    rate: num(e.dailyRate),
    declaredSalary: nonRegular ? 0 : num(e.declaredSalary),
    status: e.status === 'ACTIVE' ? 'Active' : 'Inactive',
    sssOn: nonRegular ? false : e.sssEnrolled,
    phOn: nonRegular ? false : e.philhealthEnrolled,
    piOn: nonRegular ? false : e.pagibigEnrolled,
    mp2: nonRegular ? 0 : num(e.mp2Amount),
    allowance: num(e.otherAllowance),
    leaveCredits: Number.isFinite(Number(e.leaveCredits)) ? Number(e.leaveCredits) : 5,
    address: e.address ?? '',
    contact: e.contactNumber ?? '',
    birthdate: e.birthdate ? e.birthdate.toISOString().slice(0, 10) : '',
    dateHired: e.dateHired ? e.dateHired.toISOString().slice(0, 10) : '',
    earlyShiftDays: nonRegular ? [] : (e.earlyShiftDays ?? []),
    earlyShiftTime: e.earlyShiftTime ?? '06:00',
    crew: isPieceRatePosition(e.position),
    daily: isDailyPosition(e.position),
    nonRegular,
    account: e.account ? { username: e.account.username, active: e.account.isActive } : null,
  };
}

const MONEY_LABEL = { rate: 'Daily rate', declaredSalary: 'Declared salary', mp2: 'MP2 amount', allowance: 'Other allowances' };

export function buildEmployeeData(body, { partial = false } = {}) {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'Name is required.' };
    data.name = name;
  }

  if (!partial || has('position')) {
    const position = POSITION_ENUM[body.position];
    if (!position) return { error: 'Please choose a valid position.' };
    data.position = position;
  }

  for (const [field, column] of [
    ['rate', 'dailyRate'],
    ['declaredSalary', 'declaredSalary'],
    ['mp2', 'mp2Amount'],
  ]) {
    if (!partial || has(field)) {
      const n = Number(body[field]);
      if (!Number.isFinite(n) || n < 0) {
        return { error: `${MONEY_LABEL[field]} must be a number that is zero or more.` };
      }
      data[column] = n;
    }
  }

  if (has('allowance')) {
    const n = Number(body.allowance);
    if (!Number.isFinite(n) || n < 0) {
      return { error: `${MONEY_LABEL.allowance} must be a number that is zero or more.` };
    }
    data.otherAllowance = n;
  } else if (!partial) {
    data.otherAllowance = 0;
  }

  if (has('leaveCredits')) {
    const n = Math.trunc(Number(body.leaveCredits));
    if (!Number.isFinite(n) || n < 0) {
      return { error: 'Leave credits must be a whole number that is zero or more.' };
    }
    data.leaveCredits = n;
  } else if (!partial) {
    data.leaveCredits = 5;
  }

  if (!partial || has('status')) {
    data.status = body.status === 'Inactive' ? 'INACTIVE' : 'ACTIVE';
  }

  if (!partial || has('sssOn')) data.sssEnrolled = !!body.sssOn;
  if (!partial || has('phOn')) data.philhealthEnrolled = !!body.phOn;
  if (!partial || has('piOn')) data.pagibigEnrolled = !!body.piOn;

  if (!partial || has('address')) data.address = (body.address || '').trim() || null;
  if (!partial || has('contact')) data.contactNumber = (body.contact || '').trim() || null;

  if (!partial || has('birthdate')) {
    data.birthdate = body.birthdate ? new Date(body.birthdate + 'T00:00:00Z') : null;
  }
  if (!partial || has('dateHired')) {
    data.dateHired = body.dateHired ? new Date(body.dateHired + 'T00:00:00Z') : null;
  }

  if (!partial || has('earlyShiftDays')) {
    const days = Array.isArray(body.earlyShiftDays) ? body.earlyShiftDays : [];
    if (days.some((d) => !VALID_WEEKDAYS.has(d))) {
      return { error: 'Early-shift days are invalid.' };
    }
    data.earlyShiftDays = days;
  }
  if (!partial || has('earlyShiftTime')) {
    data.earlyShiftTime = /^\d{2}:\d{2}$/.test(body.earlyShiftTime) ? body.earlyShiftTime : '06:00';
  }

  if (isNonRegularPosition(data.position)) {
    Object.assign(data, {
      declaredSalary: 0, mp2Amount: 0, earlyShiftDays: [],
      sssEnrolled: false, philhealthEnrolled: false, pagibigEnrolled: false,
    });
  }

  return { data };
}