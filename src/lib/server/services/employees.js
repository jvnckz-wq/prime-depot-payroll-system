import { hasNoContributions, isDailyPosition, isNonRegularPosition, isPieceRatePosition } from '../../positions';
import { addressError, birthdateError, isUnpaidPosition, LIMITS, moneyError, mp2Error, personNameError, phMobileError, wholeNumberError } from '../../field-rules';

export const POSITION_LABEL = {
  OPERATIONS_HEAD: 'Operations Head',
  CHECKER: 'Checker',
  DRIVER: 'Driver',
  PAHINANTE: 'Pahinante',
  ADMINISTRATIVE_ASSISTANT: 'Assistant',
  COMMUNICATIONS_OFFICER_II: 'Communications Officer II',
  JUNIOR_SECRETARY: 'Junior Secretary',
  JOB_ORDER: 'Job Order',
  COMMUNICATIONS_OFFICER_I: 'Communications Officer I',
  COLLECTION_OFFICER: 'Collection Officer',
  WAREHOUSE_OFFICER: 'Warehouse Officer',
};

const POSITION_ENUM = {
  'Operations Head': 'OPERATIONS_HEAD',
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
  'Warehouse Officer': 'WAREHOUSE_OFFICER',
};

const VALID_WEEKDAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

const num = (d) => (d == null ? 0 : Number(d));

export function shapeEmployee(e) {
  const nonRegular = isNonRegularPosition(e.position);
  const noContrib = hasNoContributions(e.position);
  return {
    id: e.id,
    name: e.name,
    position: POSITION_LABEL[e.position] ?? e.position,
    rate: num(e.dailyRate),
    declaredSalary: noContrib ? 0 : num(e.declaredSalary),
    status: e.status === 'ACTIVE' ? 'Active' : 'Inactive',
    sssOn: noContrib ? false : e.sssEnrolled,
    phOn: noContrib ? false : e.philhealthEnrolled,
    piOn: noContrib ? false : e.pagibigEnrolled,
    mp2: noContrib ? 0 : num(e.mp2Amount),
    allowance: num(e.otherAllowance),
    leaveCredits: Number.isFinite(Number(e.leaveCredits)) ? Number(e.leaveCredits) : 5,
    address: e.address ?? '',
    contact: e.contactNumber ?? '',
    birthdate: e.birthdate ? e.birthdate.toISOString().slice(0, 10) : '',
    earlyShiftDays: nonRegular ? [] : (e.earlyShiftDays ?? []),
    earlyShiftTime: e.earlyShiftTime ?? '06:00',
    crew: isPieceRatePosition(e.position),
    daily: isDailyPosition(e.position),
    nonRegular,
    account: e.account ? { username: e.account.username, active: e.account.isActive } : null,
    idLocked: !!e.account || (e._count ? Object.values(e._count).some((n) => n > 0) : true),
  };
}

const MONEY_LABEL = { rate: 'Daily rate', declaredSalary: 'Declared salary', mp2: 'MP2 amount', allowance: 'Other allowances' };

export function buildEmployeeData(body, { partial = false } = {}) {
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('name')) {
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    const nameErr = personNameError(name, 'Full name');
    if (nameErr) return { error: nameErr };
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
      const raw = String(body[field] ?? '0');
      const skipContrib = field !== 'rate' && body.position !== undefined && hasNoContributions(body.position);
      const err = skipContrib ? '' : field === 'rate'
        ? moneyError(raw, { label: 'Daily rate', max: LIMITS.dailyRateMax, allowZero: isUnpaidPosition(body.position) })
        : field === 'mp2'
          ? mp2Error(raw)
          : moneyError(raw, { label: 'Declared monthly salary', max: LIMITS.declaredSalaryMax });
      if (err) return { error: err };
      data[column] = Number.isFinite(Number(raw)) ? Number(raw) : 0;
    }
  }

  if (has('allowance')) {
    const err = moneyError(String(body.allowance ?? '0'), { label: MONEY_LABEL.allowance, max: LIMITS.allowanceMax });
    if (err) return { error: err };
    data.otherAllowance = Number(body.allowance);
  } else if (!partial) {
    data.otherAllowance = 0;
  }

  if (has('leaveCredits')) {
    const err = wholeNumberError(String(body.leaveCredits ?? ''), { label: 'Leave credits', min: 0, max: LIMITS.leaveCreditsMax });
    if (err) return { error: err };
    data.leaveCredits = Number(body.leaveCredits);
  } else if (!partial) {
    data.leaveCredits = 5;
  }

  if (!partial || has('status')) {
    data.status = body.status === 'Inactive' ? 'INACTIVE' : 'ACTIVE';
  }

  if (!partial || has('sssOn')) data.sssEnrolled = !!body.sssOn;
  if (!partial || has('phOn')) data.philhealthEnrolled = !!body.phOn;
  if (!partial || has('piOn')) data.pagibigEnrolled = !!body.piOn;

  if (!partial || has('address')) {
    const err = addressError(body.address);
    if (err) return { error: err };
    data.address = String(body.address || '').replace(/\s+/g, ' ').trim() || null;
  }
  if (!partial || has('contact')) {
    const err = phMobileError(body.contact);
    if (err) return { error: err };
    data.contactNumber = String(body.contact || '').replace(/\s/g, '') || null;
  }
  if (!partial || has('birthdate')) {
    const err = birthdateError(body.birthdate);
    if (err) return { error: err };
    data.birthdate = body.birthdate ? new Date(body.birthdate + 'T00:00:00Z') : null;
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

  if (hasNoContributions(data.position)) {
    Object.assign(data, {
      declaredSalary: 0, mp2Amount: 0,
      sssEnrolled: false, philhealthEnrolled: false, pagibigEnrolled: false,
    });
  }
  if (isNonRegularPosition(data.position)) data.earlyShiftDays = [];

  return { data };
}