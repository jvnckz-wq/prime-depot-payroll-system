const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const CUTOFFS_PER_YEAR = 24;

export function annualIncomeTax(annualTaxable, table = []) {
  const t = Math.max(0, Number(annualTaxable) || 0);
  const row = table.find((r) => t > Number(r.over) && (r.notOver === null || r.notOver === undefined || t <= Number(r.notOver)));
  if (!row) return 0;
  return round2(Number(row.base) + (t - Number(row.over)) * (Number(row.rate) / 100));
}

export function taxableForCutoff(calc) {
  if (!calc) return 0;
  const n = (v) => Number(v) || 0;
  return round2(Math.max(0, n(calc.totalEarnings) - n(calc.tardiness) - n(calc.sss) - n(calc.phic) - n(calc.mp1)));
}

export function cutoffWithholding(taxable, table) {
  return round2(annualIncomeTax((Number(taxable) || 0) * CUTOFFS_PER_YEAR, table) / CUTOFFS_PER_YEAR);
}

export function cutoffThreshold(table = []) {
  const zero = table.find((r) => Number(r.rate) === 0 && Number(r.base) === 0 && r.notOver !== null && r.notOver !== undefined);
  return zero ? round2(Number(zero.notOver) / CUTOFFS_PER_YEAR) : 0;
}
