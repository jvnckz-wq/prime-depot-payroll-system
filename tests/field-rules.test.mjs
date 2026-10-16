import assert from 'node:assert/strict';
import { freeTextError, quantityError, plateError, labelTextError, unitError, dateNotFutureError, timeOrderError, dateRangeError, usernameInput, deliveryErrors, employeeIdError, personNameError, moneyError, wholeNumberError, mp2Error, phMobileError, birthdateError, addressError, moneyInput, digitsOnly, employeeErrors, LIMITS } from '../src/lib/field-rules.js';
const tests = []; const ok = (n, f) => tests.push([n, f]);
const bad = (v) => assert.notEqual(v, ''); const good = (v) => assert.equal(v, '');

ok('employee ID: numbers only, 1-9 digits, no leading zero', () => {
  ['7', '48', '100099', '123456789'].forEach((v) => good(employeeIdError(v)));
  ['', 'Ad', 'EMP-001', '007', '0', '1234567890', '1 2', '-5', '4.5'].forEach((v) => bad(employeeIdError(v)));
});
ok('names: letters, ñ, accents, . - \' and spaces only', () => {
  ['Ma. Christine Reyes', 'Juan Dela Cruz', "O'Neil", 'Santos-Reyes', 'Niño Peña', 'José'].forEach((v) => good(personNameError(v)));
  ['', 'A', 'Admin1', 'Jat!', '12345', '..', 'Juan@Cruz', ' - '].forEach((v) => bad(personNameError(v)));
  assert.equal(personNameError('Jm'), '');
});
ok('money: up to 2 decimals, min/max, zero rule', () => {
  good(moneyError('650', { label: 'Daily rate', max: 10000, allowZero: false }));
  good(moneyError('650.5', { label: 'Daily rate', max: 10000, allowZero: false }));
  ['0', '-1', '650.555', 'abc', '10000.01', '1e3', ''].forEach((v) => bad(moneyError(v, { label: 'Daily rate', max: 10000, allowZero: false })));
});
ok('whole numbers and MP2', () => {
  good(wholeNumberError('5', { label: 'Leave credits', min: 0, max: 60 }));
  ['2.5', '-1', '61', 'x'].forEach((v) => bad(wholeNumberError(v, { label: 'Leave credits', min: 0, max: 60 })));
  ['', '0', '500', '50000'].forEach((v) => good(mp2Error(v)));
  ['200', '50001', 'abc'].forEach((v) => bad(mp2Error(v)));
});
ok('PH mobile, birthdate age 18-80, address characters', () => {
  ['', '09171234567', '0917 123 4567'].forEach((v) => good(phMobileError(v)));
  ['9171234567', '0917123456', '091712345678', '+639171234567', '0917abc4567'].forEach((v) => bad(phMobileError(v)));
  const today = new Date(2026, 9, 16);
  ['', '2000-05-10', '2008-10-16'].forEach((v) => good(birthdateError(v, today)));
  ['2008-10-17', '2030-01-01', '1940-01-01', '2026-13-01', 'abc'].forEach((v) => bad(birthdateError(v, today)));
  ['', 'Brgy. P. Niogan, Mabini, Batangas', 'Blk 5 Lot #12, Purok 3/4'].forEach((v) => good(addressError(v)));
  ['<script>', 'Mabini; DROP', 'x'.repeat(201)].forEach((v) => bad(addressError(v)));
});
ok('input filters', () => {
  assert.equal(digitsOnly('Ad12b3'), '123');
  assert.equal(moneyInput('6a5.0.55'), '65.05');
  assert.equal(moneyInput('1,200.999'), '1200.99');
});
ok('the screenshot case is rejected: ID "Ad", name "Admin" ok, rate 0', () => {
  const e = employeeErrors({ id: 'Ad', name: 'Admin', rate: '0', leaveCredits: '5', declaredSalary: '', mp2: '', sssOn: false, phOn: false, piOn: false });
  bad(e.id); good(e.name); bad(e.rate);
  assert.equal(LIMITS.dailyRateMax, 10000);
});
ok('deliveries, trucks, rate items', () => {
  ['', '1', '25', '9999'].forEach((v) => good(quantityError(v)));
  ['2.5', '-1', '10000', 'abc'].forEach((v) => bad(quantityError(v)));
  ['ABC 1234', 'abc-1234', 'NAB1234', 'AB 1234'].forEach((v) => good(plateError(v)));
  ['', 'AB1', 'ABCD12345', 'AB@1234', 'AB 12 34'].forEach((v) => bad(plateError(v)));
  ['Paint', 'Roofing & Steel', 'Blue MD (Isuzu)'].forEach((v) => good(labelTextError(v, { label: 'Item category' })));
  ['', 'X', 'Paint<b>', 'x'.repeat(41)].forEach((v) => bad(labelTextError(v, { label: 'Item category' })));
  ['bag', 'piece', 'elf'].forEach((v) => good(unitError(v)));
  ['', 'bag2', 'per bag', 'x'.repeat(16)].forEach((v) => bad(unitError(v)));
  good(freeTextError('Katabi ng tindahan, asul na gate', { label: 'Landmark', min: 3 }));
  ['', '   ', 'ab', '<script>'].forEach((v) => bad(freeTextError(v, { label: 'Landmark', min: 3 })));
  const d = deliveryErrors({ customer: 'Juan', contactNo: '', landmark: '', quantities: ['', '0'] });
  good(d.customer); bad(d.contactNo); good(d.landmark); bad(d.items);
  bad(deliveryErrors({ customer: 'Juan', contactNo: '09171234567', landmark: '<b>', quantities: ['2'] }).landmark);
  const p = deliveryErrors({ customer: 'Juan', contactNo: '09171234567', quantities: ['2'], checkPlace: true, truckId: 'TRK-01', province: 'Batangas' });
  bad(p.driver); good(p.truck); good(p.province); bad(p.municipality); bad(p.barangay);
});
ok('Operations Head may have a P0 or blank daily rate; position is required', () => {
  const base = { id: '1', name: 'Jean Margaret Tengco', leaveCredits: '5', declaredSalary: '', mp2: '', sssOn: false, phOn: false, piOn: false };
  good(employeeErrors({ ...base, position: 'Operations Head', rate: '0' }).rate);
  good(employeeErrors({ ...base, position: 'Operations Head', rate: '' }).rate);
  bad(employeeErrors({ ...base, position: 'Junior Secretary', rate: '0' }).rate);
  bad(employeeErrors({ ...base, position: '', rate: '600' }).position);
});
ok('dates, times, ranges, usernames', () => {
  const today = new Date(2026, 9, 16);
  good(dateNotFutureError('2026-10-16', { today })); bad(dateNotFutureError('2026-10-17', { today })); bad(dateNotFutureError('', { today }));
  good(timeOrderError('08:00', '17:00')); bad(timeOrderError('17:00', '08:00')); bad(timeOrderError('08:00', '08:00')); good(timeOrderError('', '17:00'));
  good(dateRangeError('2026-10-01', '2026-10-15')); bad(dateRangeError('2026-10-15', '2026-10-01')); bad(dateRangeError('2025-01-01', '2026-10-15'));
  assert.equal(usernameInput('Checker 2!'), 'checker2');
});
let failed = 0;
for (const [n, f] of tests) { try { f(); console.log('  ok  ' + n); } catch (e) { failed++; console.error('  FAIL ' + n + '\n       ' + e.message); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`); if (failed) process.exit(1);
