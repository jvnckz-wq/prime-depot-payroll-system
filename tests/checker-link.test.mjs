// The signed-in user must carry employeeId: deliveries use it to check that a checker has timed in.
// (It was once left out of getCurrentUser, which made every checker look unlinked.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/lib/server/security/auth.js', import.meta.url), 'utf8');
const start = src.indexOf('export async function getCurrentUser');
const fn = src.slice(start, src.indexOf('\nexport ', start + 1));
const ret = fn.slice(fn.lastIndexOf('return {'));
assert.match(ret, /employeeId/, 'getCurrentUser must return employeeId');
console.log('ok - the signed-in user carries the checker\u2019s employee link');
