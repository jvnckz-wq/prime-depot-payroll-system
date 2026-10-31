const assert = require('node:assert/strict');
const { NO_ITEMS_MESSAGE, RATE_GONE_MESSAGE, buildDeliveryItems, lineAmounts, rateItemIds } = require('../src/lib/delivery-items.js');

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const cement = { id: 'r-cement', itemName: 'Cement', unit: 'bag', driverRate: 3, helperRate: 2.5, driverRateDouble: 6, helperRateDouble: 5, isActive: true };
const sand = { id: 'r-sand', itemName: 'Sand', unit: 'cu.m', driverRate: 60, helperRate: 45, driverRateDouble: 130, helperRateDouble: 95, isActive: true };
const blocks = { id: 'r-blocks', itemName: 'Hollow Blocks', unit: 'pc', driverRate: 0.25, helperRate: 0.2, driverRateDouble: 0.5, helperRateDouble: 0.4, isActive: true };
const retired = { id: 'r-old', itemName: 'Old Item', unit: 'bag', driverRate: 5, helperRate: 4, driverRateDouble: 10, helperRateDouble: 8, isActive: false };
const rows = [cement, sand, blocks, retired];

// The formula setDouble in PATCH /api/deliveries/[id] used inline before lineAmounts existed.
const oldSetDouble = (q, r, want) => ({
  driverAmount: +(q * Number(want ? r.driverRateDouble : r.driverRate)).toFixed(2),
  helperAmount: +(q * Number(want ? r.helperRateDouble : r.helperRate)).toFixed(2),
});
// Prisma Decimal values convert with Number() through their string value.
const dec = (v) => ({ valueOf: () => String(v), toString: () => String(v) });

ok('regular and double amounts', () => {
  assert.deepEqual(lineAmounts(cement, 40, false), { driverAmount: 120, helperAmount: 100 });
  assert.deepEqual(lineAmounts(cement, 40, true), { driverAmount: 240, helperAmount: 200 });
  assert.deepEqual(lineAmounts(sand, 2, true), { driverAmount: 260, helperAmount: 190 });
});

ok('a decimal quantity is priced and rounded to centavos', () => {
  assert.deepEqual(lineAmounts(blocks, 2.5, false), { driverAmount: 0.63, helperAmount: 0.5 });
  assert.deepEqual(lineAmounts(sand, 1.333, false), { driverAmount: 79.98, helperAmount: 59.98 });
});

ok('lineAmounts matches the old inline setDouble formula', () => {
  const samples = [
    [cement, 40], [sand, 3], [blocks, 333], [blocks, 7], [sand, 1.333],
    [{ driverRate: '12.75', helperRate: '9.10', driverRateDouble: '25.50', helperRateDouble: '18.20' }, 17],
    [{ driverRate: dec('0.35'), helperRate: dec('0.15'), driverRateDouble: dec('0.70'), helperRateDouble: dec('0.30') }, dec('101')],
  ];
  for (const [rate, q] of samples) {
    for (const want of [false, true]) assert.deepEqual(lineAmounts(rate, q, want), oldSetDouble(Number(q), rate, want));
  }
});

ok('builds rows from the rate table, with rateItemId, name and unit from the rate row', () => {
  const out = buildDeliveryItems([{ rateItemId: 'r-cement', qty: 40 }, { rateItemId: 'r-sand', qty: '2' }], rows, false);
  assert.deepEqual(out, { items: [
    { rateItemId: 'r-cement', itemName: 'Cement', unit: 'bag', quantity: 40, driverAmount: 120, helperAmount: 100 },
    { rateItemId: 'r-sand', itemName: 'Sand', unit: 'cu.m', quantity: 2, driverAmount: 120, helperAmount: 90 },
  ] });
  assert.equal(buildDeliveryItems([{ rateItemId: 'r-sand', qty: 2 }], rows, true).items[0].driverAmount, 260);
});

ok('amounts, names and units sent by the browser are ignored', () => {
  const out = buildDeliveryItems([{
    rateItemId: 'r-cement', qty: 10, item: 'Gold Bars', unit: 'truck', driverAmount: 999999, helperAmount: 888888, d: 5000, h: 5000,
  }], rows, false);
  assert.deepEqual(out.items, [{ rateItemId: 'r-cement', itemName: 'Cement', unit: 'bag', quantity: 10, driverAmount: 30, helperAmount: 25 }]);
});

ok('unknown, missing or retired rate ids give the rate table error', () => {
  assert.deepEqual(buildDeliveryItems([{ rateItemId: 'r-nope', qty: 1 }], rows, false), { error: RATE_GONE_MESSAGE });
  assert.deepEqual(buildDeliveryItems([{ qty: 1, item: 'Cement', unit: 'bag' }], rows, false), { error: RATE_GONE_MESSAGE });
  assert.deepEqual(buildDeliveryItems([{ rateItemId: '', qty: 1 }], rows, false), { error: RATE_GONE_MESSAGE });
  assert.deepEqual(buildDeliveryItems([{ rateItemId: 'r-old', qty: 1 }], rows, false), { error: RATE_GONE_MESSAGE });
  assert.deepEqual(buildDeliveryItems([{ rateItemId: 'r-cement', qty: 1 }, { rateItemId: 'r-old', qty: 2 }], rows, false), { error: RATE_GONE_MESSAGE });
});

ok('zero or blank quantity lines are dropped, even with a bad id', () => {
  const out = buildDeliveryItems([
    { rateItemId: 'r-cement', qty: 0 }, { rateItemId: 'r-sand', qty: '' }, { rateItemId: 'r-nope', qty: '0' },
    { rateItemId: 'r-blocks', qty: 100 }, { qty: undefined },
  ], rows, false);
  assert.deepEqual(out.items.map((i) => [i.rateItemId, i.quantity]), [['r-blocks', 100]]);
});

ok('no valid lines gives the existing "Add at least one item" error', () => {
  assert.equal(NO_ITEMS_MESSAGE, 'Add at least one item with a quantity above zero.');
  assert.deepEqual(buildDeliveryItems([], rows, false), { error: NO_ITEMS_MESSAGE });
  assert.deepEqual(buildDeliveryItems(undefined, rows, false), { error: NO_ITEMS_MESSAGE });
  assert.deepEqual(buildDeliveryItems([{ rateItemId: 'r-cement', qty: 0 }, { rateItemId: 'r-sand', qty: '' }], rows, false), { error: NO_ITEMS_MESSAGE });
});

ok('rateItemIds collects the unique string ids for the database lookup', () => {
  assert.deepEqual(rateItemIds([{ rateItemId: 'a' }, { rateItemId: 'b' }, { rateItemId: 'a' }, { rateItemId: '' }, { rateItemId: 7 }, {}, null]), ['a', 'b']);
  assert.deepEqual(rateItemIds(undefined), []);
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('  ok - ' + name); } catch (e) { console.error('  FAIL - ' + name + '\n' + e.message); process.exitCode = 1; }
}
if (process.exitCode) console.error(`\n${tests.length - passed} DELIVERY ITEM CHECK(S) FAILED`);
else console.log(`\nALL ${passed} DELIVERY ITEM CHECKS PASSED`);
