export const isActiveChecker = (employee) =>
  !!employee && employee.status === 'ACTIVE' && employee.position === 'CHECKER';

export function checkerLinkProblem(employee, { accountId = null } = {}) {
  if (!employee) return 'Choose a checker from the list.';
  if (employee.status !== 'ACTIVE') return `${employee.name} is inactive.`;
  if (employee.position !== 'CHECKER') {
    return `${employee.name} is not a Checker. Change their position in Employees first.`;
  }
  if (employee.account && employee.account.id !== accountId) {
    return `${employee.name} already has the account "${employee.account.username}".`;
  }
  return null;
}

export function suggestUsername(name) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32)
    .replace(/\.+$/g, '');
  return base.length >= 3 ? base : '';
}

export function accountAfterEmployeeChange(before, patch) {
  const account = before?.account;
  if (!account) return { disable: false, rename: null };
  const next = {
    status: patch.status ?? before.status,
    position: patch.position ?? before.position,
  };
  const disable = account.isActive && !isActiveChecker(next);
  const rename = patch.name && patch.name !== before.name ? patch.name : null;
  return { disable, rename };
}
