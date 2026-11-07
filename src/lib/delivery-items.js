// Prices the items of a delivery trip from the rate table (no database access, so tests can load it).

export const RATE_GONE_MESSAGE = 'This item is no longer in the rate table. Please reload the page and pick it again.';
export const NO_ITEMS_MESSAGE = 'Add at least one item with a quantity above zero.';
// Most a trip can carry of one item (same rule as the form): 10 for elf and mini dump, 50 otherwise.
const maxQtyFor = (unit) => (unit === 'elf' || unit === 'mini dump' ? 10 : 50);

// Driver and helper amounts for one line: quantity x the item's rate, using the double rates on a
// double-rate trip, rounded to centavos.
export function lineAmounts(rate, quantity, isDouble) {
  const q = Number(quantity);
  return {
    // A double-rate trip pays exactly twice the single rate (no custom double rates, Nov 2026).
    driverAmount: +(q * Number(rate.driverRate) * (isDouble ? 2 : 1)).toFixed(2),
    helperAmount: +(q * Number(rate.helperRate) * (isDouble ? 2 : 1)).toFixed(2),
  };
}

export function rateItemIds(bodyItems) {
  const ids = (Array.isArray(bodyItems) ? bodyItems : []).map((line) => line?.rateItemId);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}

// The server prices every line itself from the rate row: only rateItemId and qty are read from the
// browser, so amounts, names and units sent with the request can never change crew pay.
export function buildDeliveryItems(bodyItems, rateRows, isDouble) {
  const rateById = new Map((rateRows || []).map((r) => [r.id, r]));
  const items = [];
  for (const line of Array.isArray(bodyItems) ? bodyItems : []) {
    const quantity = parseFloat(line?.qty);
    if (isNaN(quantity) || quantity <= 0) continue;
    const rate = typeof line.rateItemId === 'string' ? rateById.get(line.rateItemId) : undefined;
    if (!rate || rate.isActive === false) return { error: RATE_GONE_MESSAGE };
    if (!Number.isInteger(quantity)) return { error: `${rate.itemName}: the quantity must be a whole number.` };
    if (quantity > maxQtyFor(rate.unit)) return { error: `${rate.itemName} (${rate.unit}): at most ${maxQtyFor(rate.unit)} per trip.` };
    items.push({
      rateItemId: rate.id,
      itemName: rate.itemName,
      unit: rate.unit,
      quantity,
      ...lineAmounts(rate, quantity, isDouble),
    });
  }
  if (!items.length) return { error: NO_ITEMS_MESSAGE };
  return { items };
}
