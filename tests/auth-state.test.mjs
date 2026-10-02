import assert from 'node:assert/strict';
import { authStateFrom } from '../src/lib/auth-state.js';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const user = { id: 'u1', username: 'ops', role: 'ADMIN' };

ok('200 with a user is signed in', () => {
  assert.equal(authStateFrom(200, { user }), 'signed-in');
});

ok('200 with user null is signed out', () => {
  assert.equal(authStateFrom(200, { user: null }), 'signed-out');
});

ok('401 is signed out, whatever the body', () => {
  assert.equal(authStateFrom(401, { error: 'Not signed in.' }), 'signed-out');
  assert.equal(authStateFrom(401, null), 'signed-out');
});

ok('500 is unreachable, even when the error body has no user', () => {
  assert.equal(authStateFrom(500, null), 'unreachable');
  assert.equal(authStateFrom(500, { error: 'Internal Server Error' }), 'unreachable');
  assert.equal(authStateFrom(500, { user: null }), 'unreachable');
  assert.equal(authStateFrom(503, null), 'unreachable');
});

ok('a network error is unreachable', () => {
  assert.equal(authStateFrom(0, null), 'unreachable');
  assert.equal(authStateFrom(undefined, undefined), 'unreachable');
});

ok('a 200 that is not the expected answer is unreachable, not signed out', () => {
  assert.equal(authStateFrom(200, null), 'unreachable');
  assert.equal(authStateFrom(200, {}), 'unreachable');
});

let passed = 0;
for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
console.log(`\nALL ${passed} AUTH STATE CHECKS PASSED`);
