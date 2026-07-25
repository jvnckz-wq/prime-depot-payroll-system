// Shared employee mapping + validation. Lives here, not inside a route file, so
// that POST (register) and PATCH (edit) validate through exactly the same code.
// When a rule changes it changes once — the manifest/payslip lesson applied to
// employee writes.

// Database enum -> the label the UI already displays.
export const POSITION_LABEL = {
  OPERATIONS_HEAD: 'Operations Head',
  ADMINISTRATIVE_STAFF: 'Administrative Staff',
  // Deprecated: an old row still shows as ordinary administrative staff. The
  // early call time now lives on earlyShiftDays, not in the job title.
  SECRETARY_SPECIAL_SHIFT: 'Administrative Staff',
  CHECKER: 'Checker',
  DRIVER: 'Driver',
  PAHINANTE: 'Pahinante',
};

// The reverse: the label the form submits -> the database enum. Only positions
// offered when registering are listed; SECRETARY_SPECIAL_SHIFT is deprecated
// and never chosen for a new record, so editing such a row quietly migrates it
// to ADMINISTRATIVE_STAFF — which is correct, since that is what it now is.
const POSITION_ENUM = {
  'Operations Head': 'OPERATIONS_HEAD',
  'Administrative Staff': 'ADMINISTRATIVE_STAFF',
  Checker: 'CHECKER',
  Driver: 'DRIVER',
  Pahinante: 'PAHINANTE',
};

const VALID_WEEKDAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

// Prisma returns Decimal objects, which don't survive JSON.stringify as numbers.
const num = (d) => (d == null ? 0 : Number(d));

// One shape, used by GET, POST, and PATCH, so the client always receives an
// employee in exactly the form it already knows how to render.
export function shapeEmployee(e) {
  return {
    id: e.id,
    name: e.name,
    position: POSITION_LABEL[e.position] ?? e.position,
    rate: num(e.dailyRate),
    declaredSalary: num(e.declaredSalary),
    status: e.status === 'ACTIVE' ? 'Active' : 'Inactive',
    sssOn: e.sssEnrolled,
    phOn: e.philhealthEnrolled,
    piOn: e.pagibigEnrolled,
    mp2: num(e.mp2Amount),
    address: e.address ?? '',
    contact: e.contactNumber ?? '',
    birthdate: e.birthdate ? e.birthdate.toISOString().slice(0, 10) : '',
    dateHired: e.dateHired ? e.dateHired.toISOString().slice(0, 10) : '',
    earlyShiftDays: e.earlyShiftDays ?? [],
    earlyShiftTime: e.earlyShiftTime ?? '06:00',
    // Crew are paid through Truck Payroll, so the staff list treats them as
    // reference rows rather than editable staff-payroll records.
    crew: e.position === 'DRIVER' || e.position === 'PAHINANTE',
  };
}

// A friendlier label for the money-field error messages.
const MONEY_LABEL = { rate: 'Daily rate', declaredSalary: 'Declared salary', mp2: 'MP2 amount' };

// Turn the form's fields into a validated row of database columns. Never build
// the row by spreading the request body: that lets any caller set a column we
// never meant to expose. Every field is chosen by name, one at a time.
//
// partial = true means "only validate and include the keys that were actually
// sent" — what an edit needs. partial = false requires the full set.
//
// Returns { error } or { data }; the caller never sees a half-built object.
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

  // Money fields: real numbers, never negative.
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

  if (!partial || has('status')) {
    data.status = body.status === 'Inactive' ? 'INACTIVE' : 'ACTIVE';
  }

  if (!partial || has('sssOn')) data.sssEnrolled = !!body.sssOn;
  if (!partial || has('phOn')) data.philhealthEnrolled = !!body.phOn;
  if (!partial || has('piOn')) data.pagibigEnrolled = !!body.piOn;

  // Personal info is optional. A blank clears the field rather than storing "".
  if (!partial || has('address')) data.address = (body.address || '').trim() || null;
  if (!partial || has('contact')) data.contactNumber = (body.contact || '').trim() || null;

  // Dates arrive as 'YYYY-MM-DD' or blank. Pinned to UTC midnight so no
  // timezone can shift the stored day by one.
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

  return { data };
}
