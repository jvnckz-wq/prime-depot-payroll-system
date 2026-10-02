const num = (d) => (d == null ? null : Number(d));

export function shapeSss(rows) {
  return [...rows]
    .sort((a, b) => Number(a.salaryTo) - Number(b.salaryTo))
    .map((r) => ({
      from: num(r.salaryFrom),
      ceiling: Number(r.salaryTo) >= 999999999 ? null : num(r.salaryTo),
      share: num(r.employeeShare),
    }));
}

export function shapePhilhealth(cfg) {
  return cfg
    ? { rate: num(cfg.ratePercent), floor: num(cfg.salaryFloor), ceiling: num(cfg.salaryCeiling) }
    : { rate: 5, floor: 10000, ceiling: 100000 };
}

export function shapePagibig(cfg) {
  if (!cfg) return { brackets: [{ ceiling: 1500, eePct: 1 }, { ceiling: null, eePct: 2 }], cap: 200 };
  const brackets = [...(cfg.brackets || [])]
    .sort((a, b) => (a.salaryUpTo == null ? 1 : b.salaryUpTo == null ? -1 : Number(a.salaryUpTo) - Number(b.salaryUpTo)))
    .map((b) => ({ ceiling: b.salaryUpTo == null ? null : num(b.salaryUpTo), eePct: num(b.employeePercent) }));
  return { brackets, cap: num(cfg.monthlyCap) };
}

export function shapeBir(rows) {
  return [...rows]
    .sort((a, b) => Number(a.incomeFrom) - Number(b.incomeFrom))
    .map((r) => ({ over: num(r.incomeFrom), notOver: r.incomeTo == null ? null : num(r.incomeTo), base: num(r.baseTax), rate: num(r.percentOverExcess) }));
}

export function sssToDb(table, year) {
  return table.map((r, i) => ({
    effectiveYear: year,
    salaryFrom: r.from != null ? Number(r.from) : (i === 0 ? 0 : Number(table[i - 1].ceiling) || 0),
    salaryTo: r.ceiling == null || r.ceiling === '' ? 999999999 : Number(r.ceiling),
    employeeShare: Number(r.share),
    employerShare: 0,
  }));
}

export function philhealthToDb(ph, year) {
  return { effectiveYear: year, ratePercent: Number(ph.rate), salaryFloor: Number(ph.floor), salaryCeiling: Number(ph.ceiling) };
}

export function pagibigToDb(pi, year) {
  return {
    config: { effectiveYear: year, monthlyCap: Number(pi.cap) },
    brackets: (pi.brackets || []).map((b) => ({
      salaryUpTo: b.ceiling == null || b.ceiling === '' ? null : Number(b.ceiling),
      employeePercent: Number(b.eePct),
      employerPercent: 0,
    })),
  };
}

export function birToDb(table, year) {
  return table.map((r) => ({
    effectiveYear: year,
    incomeFrom: Number(r.over),
    incomeTo: r.notOver == null || r.notOver === '' ? null : Number(r.notOver),
    baseTax: Number(r.base),
    percentOverExcess: Number(r.rate),
  }));
}
const isNum = (v) => v !== '' && v != null && Number.isFinite(Number(v));
const open = (v) => v == null || v === '';

function ascendingCeilings(rows, label, key = 'ceiling') {
  for (let i = 0; i < rows.length; i++) {
    const last = i === rows.length - 1;
    const c = rows[i][key];
    if (last) {
      if (!open(c)) return `${label}: the last row must have no ceiling (it covers everything above).`;
      continue;
    }
    if (!isNum(c) || Number(c) <= 0) return `${label} row ${i + 1}: the ceiling must be a number above zero.`;
    if (i > 0 && Number(c) <= Number(rows[i - 1][key])) return `${label} row ${i + 1}: each ceiling must be higher than the one before it.`;
  }
  return null;
}

export function validateSss(table) {
  if (!Array.isArray(table) || !table.length) return 'SSS table cannot be empty.';
  const order = ascendingCeilings(table, 'SSS');
  if (order) return order;
  for (let i = 0; i < table.length; i++) {
    const { share } = table[i];
    if (!isNum(share) || Number(share) < 0) return `SSS row ${i + 1}: the employee share must be a number, zero or more.`;
    const base = open(table[i].ceiling) ? Number(table[i - 1]?.ceiling ?? 0) : Number(table[i].ceiling);
    if (base > 0 && Number(share) > base * 0.2) return `SSS row ${i + 1}: the employee share is more than 20% of the bracket. Check for an extra zero.`;
  }
  return null;
}

export function validatePhilhealth(ph) {
  if (!ph) return 'PhilHealth settings are missing.';
  if (!isNum(ph.rate) || Number(ph.rate) <= 0 || Number(ph.rate) > 10) return 'PhilHealth premium rate must be above 0% and at most 10%.';
  if (!isNum(ph.floor) || Number(ph.floor) <= 0) return 'PhilHealth salary floor must be a number above zero.';
  if (!isNum(ph.ceiling) || Number(ph.ceiling) <= Number(ph.floor)) return 'PhilHealth salary ceiling must be higher than the floor.';
  return null;
}

export function validatePagibig(pi) {
  if (!pi) return 'Pag-IBIG settings are missing.';
  if (!isNum(pi.cap) || Number(pi.cap) < 0 || Number(pi.cap) > 5000) return 'Pag-IBIG monthly cap must be from ₱0 to ₱5,000.';
  const rows = pi.brackets || [];
  if (!rows.length) return 'Pag-IBIG needs at least one bracket.';
  const order = ascendingCeilings(rows, 'Pag-IBIG');
  if (order) return order;
  for (let i = 0; i < rows.length; i++) {
    if (!isNum(rows[i].eePct) || Number(rows[i].eePct) < 0 || Number(rows[i].eePct) > 10) return `Pag-IBIG row ${i + 1}: the employee rate must be from 0% to 10%.`;
  }
  return null;
}

export function validateBir(table) {
  if (!Array.isArray(table) || !table.length) return 'BIR table cannot be empty.';
  if (!isNum(table[0].over) || Number(table[0].over) !== 0) return 'BIR row 1 must start at ₱0.';
  const order = ascendingCeilings(table, 'BIR', 'notOver');
  if (order) return order;
  for (let i = 0; i < table.length; i++) {
    const r = table[i];
    if (!isNum(r.over) || Number(r.over) < 0) return `BIR row ${i + 1}: "over" must be a number, zero or more.`;
    if (!open(r.notOver) && Number(r.notOver) <= Number(r.over)) return `BIR row ${i + 1}: "not over" must be higher than "over".`;
    if (i > 0 && Number(r.over) < Number(table[i - 1].over)) return `BIR row ${i + 1}: brackets must go up in order.`;
    if (!isNum(r.base) || Number(r.base) < 0) return `BIR row ${i + 1}: the base tax must be a number, zero or more.`;
    if (!isNum(r.rate) || Number(r.rate) < 0 || Number(r.rate) > 50) return `BIR row ${i + 1}: the rate must be from 0% to 50%.`;
  }
  return null;
}
