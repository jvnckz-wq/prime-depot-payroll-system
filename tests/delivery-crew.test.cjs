const assert = require('node:assert/strict');
const {
  DRIVER_INVALID_MESSAGE, HELPER_INVALID_MESSAGE, SAME_HELPER_MESSAGE, TRUCK_INACTIVE_MESSAGE,
  crewError, crewHelperIds,
} = require('../src/lib/delivery-crew.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const truck = { id: 'TRK-01', isActive: true };
const retiredTruck = { id: 'TRK-09', isActive: false };
const alfa = { id: 'D-01', position: 'DRIVER', status: 'ACTIVE' };
const bravo = { id: 'D-02', position: 'DRIVER', status: 'INACTIVE' };
const charlie = { id: 'H-01', position: 'HELPER', status: 'ACTIVE' };
const delta = { id: 'H-02', position: 'HELPER', status: 'ACTIVE' };
const echo = { id: 'S-01', position: 'JUNIOR_SECRETARY', status: 'ACTIVE' };
const employees = [alfa, bravo, charlie, delta, echo];
const check = (over = {}) => crewError({ truck, employees, driverId: 'D-01', helper1Id: 'H-01', helper2Id: 'H-02', ...over });

ok('valid crew with two helpers', () => assert.equal(check(), null));
ok('inactive truck', () => assert.equal(check({ truck: retiredTruck }), TRUCK_INACTIVE_MESSAGE));
ok('unknown truck', () => assert.equal(check({ truck: null }), TRUCK_INACTIVE_MESSAGE));
ok('office staff as driver', () => assert.equal(check({ driverId: 'S-01' }), DRIVER_INVALID_MESSAGE));
ok('inactive driver', () => assert.equal(check({ driverId: 'D-02' }), DRIVER_INVALID_MESSAGE));
ok('a helper chosen as driver', () => assert.equal(check({ driverId: 'H-01', helper1Id: null }), DRIVER_INVALID_MESSAGE));
ok('a driver chosen as helper', () => assert.equal(check({ helper2Id: 'D-01' }), HELPER_INVALID_MESSAGE));
ok('unknown helper id', () => assert.equal(check({ helper1Id: 'H-99' }), HELPER_INVALID_MESSAGE));
ok('non-string helper ids', () => {
  for (const bad of [5, {}, ['H-01'], true]) assert.equal(check({ helper1Id: bad }), HELPER_INVALID_MESSAGE, String(bad));
});
ok('same helper twice', () => assert.equal(check({ helper2Id: 'H-01' }), SAME_HELPER_MESSAGE));
ok('no helpers', () => {
  assert.equal(check({ helper1Id: null, helper2Id: null }), null);
  assert.equal(check({ helper1Id: undefined, helper2Id: '' }), null);
});
ok('one helper: Helper 1 only, or Helper 2 only as the form allows', () => {
  assert.equal(check({ helper2Id: null }), null);
  assert.equal(check({ helper1Id: null }), null);
});
ok('crewHelperIds keeps only non-empty strings', () => {
  assert.deepEqual(crewHelperIds('H-01', null), ['H-01']);
  assert.deepEqual(crewHelperIds('', 5), []);
  assert.deepEqual(crewHelperIds('H-01', 'H-02'), ['H-01', 'H-02']);
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('  ok - ' + name); } catch (e) { console.error('  FAIL - ' + name + '\n' + e.message); process.exitCode = 1; }
}
if (process.exitCode) console.error(`\n${tests.length - passed} DELIVERY CREW CHECK(S) FAILED`);
else console.log(`\nALL ${passed} DELIVERY CREW CHECKS PASSED`);
