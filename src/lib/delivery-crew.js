// Checks the truck and crew of a new delivery against what the Log Delivery form allows (no database access, so tests can load it).
export const TRUCK_INACTIVE_MESSAGE = 'This truck is not active. Reload the page and pick another truck.';
export const DRIVER_INVALID_MESSAGE = 'The selected driver is not an active driver. Reload the page and pick again.';
export const HELPER_INVALID_MESSAGE = 'The selected helper is not an active helper. Reload the page and pick again.';
export const SAME_HELPER_MESSAGE = 'Helper 1 and Helper 2 must be different people.';

// A helper slot left on "None" arrives as null (or is missing).
const isNone = (id) => id === undefined || id === null || id === '';

// The helper ids worth looking up: only non-empty strings.
export function crewHelperIds(helper1Id, helper2Id) {
  return [helper1Id, helper2Id].filter((id) => typeof id === 'string' && id);
}

// truck and employees are the rows the route loaded; returns the first problem, or null when the crew is valid.
// Either helper may be empty (the form allows Helper 2 without Helper 1), but a filled pair must be two people.
export function crewError({ truck, employees, driverId, helper1Id, helper2Id }) {
  if (!truck || truck.isActive !== true) return TRUCK_INACTIVE_MESSAGE;

  const byId = new Map((employees || []).map((e) => [e.id, e]));
  const isActive = (id, position) => {
    const e = typeof id === 'string' ? byId.get(id) : undefined;
    return !!e && e.position === position && e.status === 'ACTIVE';
  };

  if (!isActive(driverId, 'DRIVER')) return DRIVER_INVALID_MESSAGE;
  for (const id of [helper1Id, helper2Id]) {
    if (!isNone(id) && !isActive(id, 'HELPER')) return HELPER_INVALID_MESSAGE;
  }
  if (!isNone(helper1Id) && helper1Id === helper2Id) return SAME_HELPER_MESSAGE;
  return null;
}
