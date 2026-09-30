import assert from 'node:assert/strict';
import { isEmail, maskEmail, normalizeEmail } from '../src/lib/email-format.js';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

ok('real addresses pass, trimmed and lower-cased', () => {
  for (const e of ['jean.tengco@gmail.com', 'ops+payroll@primedepot.com.ph', 'a.b-c@sub.domain.ph', '  Jean@Gmail.com ']) assert.equal(isEmail(e), true, e);
  assert.equal(normalizeEmail('  Jean@Gmail.com '), 'jean@gmail.com');
});

ok('things that only look like an email are refused', () => {
  for (const e of ['a@b.c', 'x@y.z', 'asd', 'asd@asd', 'asd@asd.1', '@gmail.com', 'jean@', 'jean@@gmail.com',
    'jean@gmail..com', 'jean.@gmail.com', '.jean@gmail.com', 'jean @gmail.com', 'jean@-gmail.com', 'jean@gmail.c0m', '', null, 42]) {
    assert.equal(isEmail(e), false, String(e));
  }
});

ok('mask shows only the first letters', () => {
  assert.equal(maskEmail('jean.tengco@gmail.com'), 'j•••@g•••.com');
});

let passed = 0;
for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
console.log(`\nALL ${passed} EMAIL FORMAT CHECKS PASSED`);
