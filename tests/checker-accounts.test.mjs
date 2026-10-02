import assert from 'node:assert/strict';
import {
  accountAfterEmployeeChange,
  checkerLinkProblem,
  isActiveChecker,
  suggestUsername,
} from '../src/lib/checker-accounts.js';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const ana = { id: '21', name: 'Ana Cruz', status: 'ACTIVE', position: 'CHECKER', account: null };

ok('an active Checker with no account can be linked', () => {
  assert.equal(checkerLinkProblem(ana), null);
  assert.equal(isActiveChecker(ana), true);
});

ok('no employee chosen is refused', () => {
  assert.match(checkerLinkProblem(null), /Choose a checker/);
});

ok('an inactive employee is refused', () => {
  assert.match(checkerLinkProblem({ ...ana, status: 'INACTIVE' }), /Ana Cruz is inactive/);
});

ok('a non-Checker is refused, even a real employee', () => {
  const clerk = { ...ana, name: 'Jerome Ylagan', position: 'JUNIOR_SECRETARY' };
  assert.match(checkerLinkProblem(clerk), /Jerome Ylagan is not a Checker/);
  assert.equal(isActiveChecker(clerk), false);
});

ok('one account per employee', () => {
  const taken = { ...ana, account: { id: 'u1', username: 'ana.cruz' } };
  assert.match(checkerLinkProblem(taken), /already has the account "ana.cruz"/);
  assert.equal(checkerLinkProblem(taken, { accountId: 'u1' }), null);
});

ok('username suggestion is lowercase, dotted, and accent-free', () => {
  assert.equal(suggestUsername('Ma. Christine Reyes'), 'ma.christine.reyes');
  assert.equal(suggestUsername('Juan Dela Cruz Jr.'), 'juan.dela.cruz.jr');
  assert.equal(suggestUsername('Niño  Peñafiel'), 'nino.penafiel');
  assert.equal(suggestUsername('Jo'), '');
  assert.equal(suggestUsername(''), '');
  const long = suggestUsername('Maria Concepcion Villanueva de los Santos');
  assert.ok(long.length <= 32 && !long.endsWith('.'));
  assert.match(long, /^[a-z0-9._-]{3,32}$/);
});

ok('moving a linked Checker to another position disables the account', () => {
  const before = { ...ana, account: { id: 'u1', username: 'ana.cruz', isActive: true } };
  assert.deepEqual(accountAfterEmployeeChange(before, { position: 'JUNIOR_SECRETARY' }), { disable: true, rename: null });
});

ok('deactivating a linked Checker disables the account', () => {
  const before = { ...ana, account: { id: 'u1', username: 'ana.cruz', isActive: true } };
  assert.deepEqual(accountAfterEmployeeChange(before, { status: 'INACTIVE' }), { disable: true, rename: null });
});

ok('ordinary edits leave the account alone, a rename follows the employee', () => {
  const before = { ...ana, account: { id: 'u1', username: 'ana.cruz', isActive: true } };
  assert.deepEqual(accountAfterEmployeeChange(before, { dailyRate: 500 }), { disable: false, rename: null });
  assert.deepEqual(accountAfterEmployeeChange(before, { name: 'Ana M. Cruz' }), { disable: false, rename: 'Ana M. Cruz' });
  assert.deepEqual(accountAfterEmployeeChange(before, { name: 'Ana Cruz' }), { disable: false, rename: null });
});

ok('an already disabled account is not disabled twice, and no account means nothing to do', () => {
  const off = { ...ana, account: { id: 'u1', username: 'ana.cruz', isActive: false } };
  assert.deepEqual(accountAfterEmployeeChange(off, { status: 'INACTIVE' }), { disable: false, rename: null });
  assert.deepEqual(accountAfterEmployeeChange(ana, { status: 'INACTIVE' }), { disable: false, rename: null });
});

let passed = 0;
for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
console.log(`\nALL ${passed} CHECKER ACCOUNT CHECKS PASSED`);
