// Form validation rules shared by the browser and the API.
const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ';
const NAME_RE = new RegExp(`^[${LETTER}][${LETTER} .'-]*$`);
const ADDRESS_RE = new RegExp(`^[${LETTER}0-9 .,#/'-]+$`);
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

export const LIMITS = {
  dailyRateMax: 10000,
  declaredSalaryMax: 200000,
  leaveCreditsMax: 60,
  mp2Min: 500,
  mp2Max: 50000,
  allowanceMax: 50000,
  minAge: 18,
  maxAge: 80,
};

const peso = (n) => `₱${Number(n).toLocaleString('en-PH')}`;
const squash = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const digitsOnly = (v, max = 20) => String(v ?? '').replace(/\D/g, '').slice(0, max);

export function moneyInput(v) {
  const s = String(v ?? '').replace(/[^\d.]/g, '');
  const [whole, ...rest] = s.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

export function employeeIdError(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'ID number is required. It links this employee to the biometric device.';
  if (!/^[1-9]\d{0,8}$/.test(s)) return 'ID must be numbers only (1 to 9 digits) and cannot start with 0.';
  return '';
}

export function personNameError(v, label = 'Name') {
  const s = squash(v);
  if (!s) return `${label} is required.`;
  if (s.length < 2 || s.length > 80) return `${label} must be 2 to 80 characters.`;
  if (!NAME_RE.test(s)) return `${label} can only have letters, spaces, periods, hyphens and apostrophes.`;
  if ((s.match(new RegExp(`[${LETTER}]`, 'g')) || []).length < 2) return `${label} must have at least 2 letters.`;
  return '';
}

export function moneyError(v, { label, min = 0, max, required = true, allowZero = true } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return required ? `${label} is required.` : '';
  if (!MONEY_RE.test(s)) return `${label} must be a number with up to 2 decimal places.`;
  const n = Number(s);
  if (!allowZero && n <= 0) return `${label} must be more than ₱0.`;
  if (n < min) return `${label} must be at least ${peso(min)}.`;
  if (max != null && n > max) return `${label} cannot be more than ${peso(max)}.`;
  return '';
}

export function wholeNumberError(v, { label, min = 0, max } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return `${label} is required.`;
  if (!/^\d+$/.test(s)) return `${label} must be a whole number.`;
  const n = Number(s);
  if (n < min || (max != null && n > max)) return `${label} must be from ${min} to ${max}.`;
  return '';
}

export function mp2Error(v) {
  const s = String(v ?? '').trim();
  if (!s || Number(s) === 0) return MONEY_RE.test(s || '0') ? '' : 'MP2 must be a number with up to 2 decimal places.';
  return moneyError(s, { label: 'MP2', min: LIMITS.mp2Min, max: LIMITS.mp2Max });
}

export function phMobileError(v) {
  const s = String(v ?? '').replace(/\s/g, '');
  if (!s) return '';
  if (!/^09\d{9}$/.test(s)) return 'Contact number must be 11 digits starting with 09.';
  return '';
}

export function birthdateError(v, today = new Date()) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return 'Enter a valid birthdate.';
  const [y, m, d] = s.split('-').map(Number);
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  if (age < 0) return 'Birthdate cannot be in the future.';
  if (age < LIMITS.minAge || age > LIMITS.maxAge) return `Employee must be ${LIMITS.minAge} to ${LIMITS.maxAge} years old.`;
  return '';
}

export function addressError(v) {
  const s = squash(v);
  if (!s) return '';
  if (s.length > 200) return 'Address cannot be longer than 200 characters.';
  if (!ADDRESS_RE.test(s)) return 'Address can only have letters, numbers, spaces and , . - # /';
  return '';
}

export const isUnpaidPosition = (position) => position === 'Operations Head' || position === 'OPERATIONS_HEAD';

export function employeeErrors(form, { today = new Date(), crew = false, noContrib = false, skipId = false } = {}) {
  const e = {
    id: skipId ? '' : employeeIdError(form.id),
    name: personNameError(form.name, 'Full name'),
    position: form.position ? '' : 'Choose a position.',
    rate: moneyError(form.rate, { label: 'Daily rate', max: LIMITS.dailyRateMax, allowZero: isUnpaidPosition(form.position), required: !isUnpaidPosition(form.position) }),
    address: addressError(form.address),
    contact: phMobileError(form.contact),
    birthdate: birthdateError(form.birthdate, today),
    declaredSalary: '', leaveCredits: '', mp2: '',
  };
  if (!noContrib) {
    const anyOn = form.sssOn || form.phOn || form.piOn;
    e.declaredSalary = moneyError(form.declaredSalary, { label: 'Declared monthly salary', max: LIMITS.declaredSalaryMax, required: anyOn, allowZero: !anyOn });
    e.mp2 = mp2Error(form.mp2);
  }
  if (!crew) e.leaveCredits = wholeNumberError(form.leaveCredits, { label: 'Leave credits', min: 0, max: LIMITS.leaveCreditsMax });
  return e;
}

export const firstError = (errors) => Object.values(errors).find(Boolean) || '';

export const flagErrors = () => {
  if (typeof document === 'undefined') return;
  setTimeout(() => {
    const targets = [
      ...document.querySelectorAll('[data-invalid] input, [data-invalid] select, [data-invalid] textarea'),
      ...document.querySelectorAll('input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"]'),
    ];
    targets.forEach((el) => { el.classList.remove('pd-shake'); void el.offsetWidth; el.classList.add('pd-shake'); });
    const first = targets[0] || document.querySelector('[data-field-error]');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 50);
};
export const scrollToFirstError = flagErrors;

const FREE_TEXT_RE = new RegExp(`^[${LETTER}0-9 .,#/'()&:!?"-]+$`);

export function freeTextError(v, { label, min = 1, max = 200, required = true } = {}) {
  const s = squash(v);
  if (!s) return required ? `${label} is required.` : '';
  if (s.length < min) return `${label} must be at least ${min} characters.`;
  if (s.length > max) return `${label} cannot be longer than ${max} characters.`;
  if (!FREE_TEXT_RE.test(s)) return `${label} has characters that are not allowed.`;
  return '';
}

export function quantityError(v, { label = 'Quantity', max = 9999 } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^\d+$/.test(s)) return `${label} must be a whole number.`;
  if (Number(s) > max) return `${label} cannot be more than ${max.toLocaleString('en-PH')}.`;
  return '';
}

export function plateError(v) {
  const s = squash(v).toUpperCase();
  if (!s) return 'Plate number is required.';
  const alnum = s.replace(/[ -]/g, '');
  if (!/^[A-Z0-9]+([ -][A-Z0-9]+)?$/.test(s) || alnum.length < 5 || alnum.length > 7) return 'Plate number must be 5 to 7 letters and numbers, like ABC 1234.';
  return '';
}

export function labelTextError(v, { label, min = 2, max = 40 } = {}) {
  const s = squash(v);
  if (!s) return `${label} is required.`;
  if (s.length < min || s.length > max) return `${label} must be ${min} to ${max} characters.`;
  if (!new RegExp(`^[${LETTER}0-9 &/().-]+$`).test(s)) return `${label} can only have letters, numbers, spaces and & / ( ) . -`;
  return '';
}

export function unitError(v) {
  const s = squash(v);
  if (!s) return 'Unit is required (bag, piece, box, elf...).';
  if (!/^[A-Za-z]{1,15}$/.test(s)) return 'Unit must be one word of letters only, up to 15 characters.';
  return '';
}

const ymdToday = (today = new Date()) => {
  const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function dateNotFutureError(v, { label = 'Date', today = new Date(), required = true } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return required ? `${label} is required.` : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return `Enter a valid ${label.toLowerCase()}.`;
  if (s > ymdToday(today)) return `${label} cannot be in the future.`;
  return '';
}

export function timeOrderError(timeIn, timeOut) {
  if (!timeIn || !timeOut) return '';
  return timeOut > timeIn ? '' : 'Time out must be later than time in.';
}

export function dateRangeError(from, to, maxDays = 366) {
  if (!from || !to) return 'Choose both dates.';
  if (to < from) return 'The end date cannot be earlier than the start date.';
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (days > maxDays) return `Choose a range of ${maxDays} days or less.`;
  return '';
}

export const usernameInput = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);

export function deliveryErrors({ customer, contactNo, landmark, quantities = [], driverId, truckId, province, municipality, barangay, checkPlace = false }) {
  const qtyErr = quantities.map((q) => quantityError(q)).find(Boolean) || '';
  return {
    ...(checkPlace ? {
      driver: driverId ? '' : 'Choose the driver.',
      truck: truckId ? '' : 'Choose the truck.',
      province: province ? '' : 'Choose the province.',
      municipality: municipality ? '' : 'Choose the municipality.',
      barangay: barangay ? '' : 'Choose the barangay.',
    } : {}),
    customer: personNameError(customer, "Customer's name"),
    contactNo: contactNo ? phMobileError(contactNo) : 'Contact number is required.',
    landmark: freeTextError(landmark, { label: 'Specific address / landmark', max: 200, required: false }),
    items: qtyErr || (quantities.some((q) => Number(q) > 0) ? '' : 'Add at least one item with a quantity above zero.'),
  };
}

export function usernameError(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'Username is required.';
  if (!/^[a-z0-9._-]{3,32}$/.test(s)) return 'Username must be 3–32 characters: lowercase letters, numbers, dot, dash, or underscore.';
  return '';
}

export const flagEmptyRequired = () => {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('input[required], select[required], textarea[required]').forEach((el) => {
    if (String(el.value || '').trim()) return;
    el.setAttribute('aria-invalid', 'true');
    el.addEventListener('input', () => el.removeAttribute('aria-invalid'), { once: true });
  });
  flagErrors();
};

export const flagField = (field) => {
  if (typeof document === 'undefined' || !field) return;
  const names = Array.isArray(field) ? field : [field];
  names.forEach((name) => {
    const els = [...document.querySelectorAll(`[data-field="${name}"]`)];
    els.forEach((el) => {
      el.setAttribute('aria-invalid', 'true');
      el.addEventListener('input', () => els.forEach((x) => x.removeAttribute('aria-invalid')), { once: true });
    });
  });
  window.dispatchEvent(new CustomEvent('pd-field-error', { detail: names }));
  flagErrors();
};
