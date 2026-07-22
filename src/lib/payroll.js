import { DOBLE_AREAS } from '../data/seed';

export function flattenDeliveries(deliveries, filterCrewId) {
  const out = [];
  Object.entries(deliveries).forEach(([crewId, log]) => {
    log.items.filter(i => i.seq).forEach(i => out.push({ crewId, ...i, date: log.date }));
  });
  return filterCrewId ? out.filter(t => t.crewId === filterCrewId) : out;
}

// shared payroll math so the Payslip list, the individual slip, and Reports always agree
export function computeStaffPayroll(e, loans = [], statutory) {
  const days = 11;
  const gross = e.rate * days;
  const otWeekday = 472.14, otWeekend = 113.75, allowance = 4400;
  const ot = otWeekday + otWeekend;
  const sss = e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) : 0;
  const phic = e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) : 0;
  const hdmf = e.piOn ? (computePagIBIG(e.declaredSalary, statutory.pagibig) + (e.mp2 || 0)) : 0;
  // What THIS cutoff would deduct across this employee's active, unpaused loans — a live
  // preview, same as the rest of this payslip. The actual ledger entry only gets written
  // when "Apply Cutoff Deductions" is clicked on the Staff Payroll page.
  const advance = loans.filter(l => l.person === e.name && !l.paused && loanBalance(l) > 0)
    .reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const tardiness = 0;
  const totalEarnings = gross + ot + allowance;
  const totalDeductions = sss + phic + hdmf + advance + tardiness;
  const net = totalEarnings - totalDeductions;
  return { days, gross, otWeekday, otWeekend, ot, allowance, sss, phic, hdmf, advance, tardiness, totalEarnings, totalDeductions, net };
}

// deterministic pseudo-random per employee, so charts are stable across renders

export function matchDobleArea(address) {
  if (!address || !address.trim()) return null;
  const a = address.trim().toLowerCase();
  return DOBLE_AREAS.find(area => a.includes(area.toLowerCase()) || area.toLowerCase().includes(a)) || null;
}


export function computeSSS(monthlySalary, table) {
  if (!monthlySalary || monthlySalary <= 0 || !table.length) return 0;
  const bracket = table.find(b => b.ceiling !== null && monthlySalary < b.ceiling) || table[table.length - 1];
  return bracket.share / 2; // semi-monthly cutoff
}
export function computePhilHealth(monthlySalary, ph) {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  const base = Math.max(ph.floor, Math.min(ph.ceiling, monthlySalary));
  return base * (ph.rate / 100) / 2 / 2; // 50/50 er/ee split, then ÷2 for the cutoff
}
export function computePagIBIG(monthlySalary, pi) {
  if (!monthlySalary || monthlySalary <= 0 || !pi.brackets.length) return 0;
  const bracket = pi.brackets.find(b => b.ceiling !== null && monthlySalary <= b.ceiling) || pi.brackets[pi.brackets.length - 1];
  const monthly = Math.min(monthlySalary * (bracket.eePct / 100), pi.cap);
  return monthly / 2;
}


export function loanBalance(loan) {
  return loan.entries.reduce((b, e) => e.type === 'grant' ? b + e.amount : b - e.amount, 0);
}
// Same entries, but each annotated with the balance immediately after it — for a bank-statement-style display.
export function loanLedger(loan) {
  let running = 0;
  return loan.entries.map(e => {
    running = e.type === 'grant' ? running + e.amount : running - e.amount;
    return { ...e, runningBalance: running };
  });
}
