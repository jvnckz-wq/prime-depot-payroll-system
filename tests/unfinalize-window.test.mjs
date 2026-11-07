// A released cutoff can be un-finalized only on the same Manila day it was finalized.
import assert from 'node:assert/strict';
import { canUnfinalize, finalizedMessage } from '../src/lib/loan-rules.js';

const at = (iso) => new Date(iso);
// Finalized Nov 15, 2026 at 4:00 PM Manila (08:00 UTC).
const released = '2026-11-15T08:00:00.000Z';
assert.equal(canUnfinalize(released, at('2026-11-15T15:59:00.000Z')), true, '11:59 PM the same day');
assert.equal(canUnfinalize(released, at('2026-11-15T16:00:00.000Z')), false, 'midnight Manila: the next day');
assert.equal(canUnfinalize(released, at('2026-11-16T01:00:00.000Z')), false, 'the next morning');
// Finalized 12:30 AM Manila on Nov 16 (still Nov 15 in UTC): the Manila day decides.
assert.equal(canUnfinalize('2026-11-15T16:30:00.000Z', at('2026-11-16T10:00:00.000Z')), true);
assert.equal(canUnfinalize(null, at('2026-11-15T09:00:00.000Z')), false, 'not released');
// The message for a locked cutoff only offers un-finalizing when that is still possible.
assert.equal(finalizedMessage('July 1–15, 2026', '2026-07-15T08:00:00.000Z', at('2026-11-07T02:00:00.000Z')),
  'The payroll for July 1–15, 2026 is already finalized and can no longer be changed.');
assert.equal(finalizedMessage('November 1–15, 2026', released, at('2026-11-15T10:00:00.000Z')),
  'The payroll for November 1–15, 2026 was finalized today. Un-finalize it first to change its attendance.');
console.log('ok - un-finalize only on the day it was finalized (Manila time), and the lock message says so');
