// Maps the statutory tables between their relational database rows and the flat
// shapes the Settings editor and the compute* functions already use. The field
// names differ (DB salaryTo/employeeShare ↔ frontend ceiling/share), so this is
// the single place that translation lives.

const num = (d) => (d == null ? null : Number(d));

// ---- DB → frontend ---------------------------------------------------------

export function shapeSss(rows) {
  return [...rows]
    .sort((a, b) => Number(a.salaryTo) - Number(b.salaryTo))
    // The open-ended top band is stored with a sentinel ceiling; surface it as
    // null so the editor shows "and up", matching the seed fallback.
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

// ---- frontend → DB ---------------------------------------------------------

// salaryFrom uses the row's own `from` when present, else the previous
// bracket's ceiling; the open-ended top maps back to the sentinel ceiling.
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
