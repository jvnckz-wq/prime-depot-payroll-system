// 13th month pay from released payslips.
import { round2 } from './money.js';

// 13th month pay: each employee's total basic pay on the given payslips, divided by 12.
export function thirteenthMonthRows(slips) {
  const byEmployee = new Map();
  for (const s of slips) {
    const row = byEmployee.get(s.employeeId) || { employeeId: s.employeeId, name: s.name || s.employeeId, months: new Set(), basic: 0 };
    row.basic += Number(s.basicPay) || 0;
    row.months.add(String(s.periodStart).slice(0, 7));
    byEmployee.set(s.employeeId, row);
  }
  return [...byEmployee.values()]
    .map((r) => {
      const basic = round2(r.basic);
      return { employeeId: r.employeeId, name: r.name, months: r.months.size, basic, pay: round2(basic / 12) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
