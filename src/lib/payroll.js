// Payroll math: staff cutoff pay, government contributions, crew piece-rate pay and daily contributions.
import { dueFor, workingDaysIn } from './loan-rules';
import { cutoffWithholding } from './withholding';
import { round2 } from './money';

export function flattenDeliveries(deliveries, filterCrewId, { includeVoided = false } = {}) {
  const out = [];
  Object.entries(deliveries).forEach(([crewId, log]) => {
    log.items
      .filter(i => i.seq)
      .filter(i => includeVoided || !i.voided)
      .forEach(i => out.push({ crewId, ...i, date: log.date }));
  });
  return filterCrewId ? out.filter(t => t.crewId === filterCrewId) : out;
}

export function deliveriesToLog(apiDeliveries) {
  const out = {};
  for (const d of apiDeliveries || []) {
    if (!out[d.truckId]) out[d.truckId] = { date: d.date, items: [], deductions: [] };
    if (d.date > out[d.truckId].date) out[d.truckId].date = d.date;

    (d.items || []).forEach((it, i) => {
      const first = i === 0;
      out[d.truckId].items.push({
        deliveryId: d.id,
        seq: first ? d.seq : null,
        address: first ? d.address : '',
        landmark: first ? (d.landmark || '') : '',
        contactNo: first ? (d.contactNo || '') : '',
        customer: first ? d.customer : '',
        item: it.item, qty: it.qty, unit: it.unit, driverAmount: it.driverAmount, helperAmount: it.helperAmount,
        isDouble: d.isDouble,
        helpers: first ? d.helpers : undefined,
        driver: first ? d.driver : undefined,
        noScan: first ? (d.noScan || []) : undefined,
        noScanIds: first ? (d.noScanIds || []) : undefined,
        crew: first ? (d.crew || []) : undefined,
        voidedAt: d.voidedAt || null,
        voided: d.voided,
        voidedBy: d.voidedBy,
        voidReason: d.voidReason,
        loggedBy: d.loggedBy,
        loggedAt: d.loggedAt,
        date: d.date,
      });
    });
  }
  return out;
}

export function computeStaffPayroll(e, loans = [], statutory, attendance = null, runKey = null) {
  // No attendance for the cutoff means the employee is not on this cutoff's payroll: no pay and no contributions.
  if (!attendance) {
    return {
      hasAttendance: false, days: 0, present: 0, leaveDays: 0, lateMins: 0, gross: 0, otWeekday: 0, otWeekend: 0, ot: 0,
      allowance: 0, sss: 0, phic: 0, mp1: 0, mp2: 0, hdmf: 0, companyCover: 0, advance: 0, loanDeduction: 0,
      advanceDeduction: 0, deductionLines: [], tardiness: 0, tardinessDue: 0, taxable: 0, withholdingTax: 0,
      totalEarnings: 0, totalDeductions: 0, net: 0,
    };
  }
  const leaveDays = attendance.leave || 0;
  const days = attendance.present + leaveDays;
  const gross = round2(e.rate * days);

  // Overtime (client's rule): hourly rate = daily rate / 8, paid x1.25 on weekdays and x1.30 on weekends.
  const hourly = e.rate / 8;
  const otWeekdayMins = attendance.otWeekdayMins || 0;
  const otWeekendMins = attendance.otWeekendMins || 0;
  const otWeekday = round2(hourly * (otWeekdayMins / 60) * 1.25);
  const otWeekend = round2(hourly * (otWeekendMins / 60) * 1.3);
  const ot = round2(otWeekday + otWeekend);

  const allowance = round2(Number(e.allowance) || 0);

  const sss = round2(e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) : 0);
  const phic = round2(e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) : 0);
  const mp1 = round2(e.piOn ? computePagIBIG(e.declaredSalary, statutory.pagibig) : 0);
  const mp2Set = round2(e.piOn ? (Number(e.mp2) || 0) : 0);

  const lateMins = attendance.lateMins || 0;
  // Office late deduction (client's rule): daily rate x minutes late / 240. Minutes are counted
  // from the call time in attendance.js.
  const tardinessDue = round2(e.rate * lateMins / 240);
  const totalEarnings = round2(gross + ot + allowance);

  // Contributions come out first. Late, withholding tax and MP2 only take what pay is left, and
  // if pay cannot cover the contributions the company covers the gap (companyCover).
  let room = round2(totalEarnings - sss - phic - mp1);
  const companyCover = room < 0 ? round2(-room) : 0;
  room = Math.max(0, room);
  const tardiness = round2(Math.min(tardinessDue, room));
  room = round2(room - tardiness);
  const taxable = round2(Math.max(0, totalEarnings - tardiness - sss - phic - mp1));
  const withholdingTax = round2(Math.min(cutoffWithholding(taxable, (statutory && statutory.bir) || []), room));
  room = round2(room - withholdingTax);
  const mp2 = round2(Math.min(mp2Set, room));
  const hdmf = round2(mp1 + mp2);

  let loanDeduction = 0;
  let advanceDeduction = 0;
  const deductionLines = [];
  for (const l of loans) {
    if (!l || l.employeeId !== e.id) continue;
    let amount;
    let shortfall = 0;
    if (runKey) {
      const mine = (l.entries || []).filter(en => en.type === 'deduction' && en.payslipId === runKey);
      amount = mine.reduce((a, en) => a + en.amount, 0);
      shortfall = mine.reduce((a, en) => a + (en.shortfall || 0), 0);
    } else {
      if (l.paused) continue;
      amount = dueFor(l);
    }
    if (amount <= 0 && shortfall <= 0) continue;
    if (l.kind === 'CASH_ADVANCE') advanceDeduction += amount; else loanDeduction += amount;
    const balanceAfter = round2(runKey ? balanceThrough(l, runKey) : loanBalance(l) - amount);
    deductionLines.push({ kind: l.kind, purpose: l.purpose, amount: round2(amount), shortfall: round2(shortfall), balanceAfter, dateGranted: l.dateGranted });
  }
  loanDeduction = round2(loanDeduction);
  advanceDeduction = round2(advanceDeduction);
  const advance = round2(loanDeduction + advanceDeduction);

  const totalDeductions = round2(sss + phic + hdmf + advance + tardiness + withholdingTax);
  const net = round2(totalEarnings + companyCover - totalDeductions);
  return { hasAttendance: true, days, present: attendance.present, leaveDays, lateMins, gross, otWeekday, otWeekend, ot, allowance, sss, phic, mp1, mp2, hdmf, companyCover, advance, loanDeduction, advanceDeduction, deductionLines, tardiness, tardinessDue, taxable, withholdingTax, totalEarnings, totalDeductions, net };
}

// SSS for one cutoff: half the monthly employee share of the salary's bracket.
export function computeSSS(monthlySalary, table) {
  if (!monthlySalary || monthlySalary <= 0 || !table.length) return 0;
  const bracket = table.find(b => b.ceiling !== null && monthlySalary < b.ceiling) || table[table.length - 1];
  return bracket.share / 2;
}
// PhilHealth for one cutoff: rate% of the salary (kept between floor and ceiling), halved for the employee share, halved again for the cutoff.
export function computePhilHealth(monthlySalary, ph) {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  const base = Math.max(ph.floor, Math.min(ph.ceiling, monthlySalary));
  return base * (ph.rate / 100) / 2 / 2;
}
// Pag-IBIG for one cutoff: the bracket's employee % of the salary, at most the monthly cap, halved for the cutoff.
export function computePagIBIG(monthlySalary, pi) {
  if (!monthlySalary || monthlySalary <= 0 || !pi.brackets.length) return 0;
  const bracket = pi.brackets.find(b => b.ceiling !== null && monthlySalary <= b.ceiling) || pi.brackets[pi.brackets.length - 1];
  const monthly = Math.min(monthlySalary * (bracket.eePct / 100), pi.cap);
  return monthly / 2;
}

function balanceThrough(loan, key) {
  let b = 0; let at = null;
  for (const en of loan.entries || []) {
    b += en.type === 'grant' ? en.amount : -en.amount;
    if (en.payslipId === key) at = b;
  }
  return at ?? b;
}

export function loanBalance(loan) {
  return loan.entries.reduce((b, e) => e.type === 'grant' ? b + e.amount : b - e.amount, 0);
}
export function loanLedger(loan) {
  let running = 0;
  return loan.entries.map(e => {
    running = e.type === 'grant' ? running + e.amount : running - e.amount;
    return { ...e, runningBalance: running };
  });
}

export function crewEarnings(deliveries, { driverDaily, helperDaily, bonusHead, bonusTrips }) {
  const people = new Map();
  const get = (who, role) => {
    const key = who.key;
    if (!people.has(key)) {
      people.set(key, {
        key, id: who.id, name: who.name, role,
        pieceRate: 0,
        trucks: new Set(),
        days: new Set(),
        tripKeys: new Set(),
        tripsByKey: new Map(),
        tripCount: 0,
      });
    }
    return people.get(key);
  };
  const crewOf = (it) => {
    const list = Array.isArray(it.crew) ? it.crew.filter((c) => c && c.id) : [];
    if (list.length) {
      const d = list.find((c) => c.role === 'Driver');
      return {
        driver: d ? { key: d.id, id: d.id, name: d.name || d.id } : null,
        helpers: list.filter((c) => c.role !== 'Driver').map((c) => ({ key: c.id, id: c.id, name: c.name || c.id })),
      };
    }
    return {
      driver: it.driver ? { key: it.driver, id: undefined, name: it.driver } : null,
      helpers: (it.helpers || []).map((h) => ({ key: h, id: undefined, name: h })),
    };
  };

  let currentDriver = null, currentHelpers = [], currentKey = null;
  Object.entries(deliveries).forEach(([crewId, log]) => {
    (log.items || []).forEach((it) => {
      if (it.voided) return;
      if (it.seq) {
        const c = crewOf(it);
        currentDriver = c.driver;
        currentHelpers = c.helpers;
        currentKey = `${crewId}|${log.date}`;
        const mark = (p) => {
          p.tripKeys.add(currentKey); p.trucks.add(crewId); p.days.add(log.date); p.tripCount += 1;
          p.tripsByKey.set(currentKey, (p.tripsByKey.get(currentKey) || 0) + 1);
        };
        if (currentDriver) mark(get(currentDriver, 'Driver'));
        currentHelpers.forEach((h) => mark(get(h, 'Helper')));
      }
      if (currentDriver) get(currentDriver, 'Driver').pieceRate += it.driverAmount || 0;
      const n = currentHelpers.length;
      if (n) currentHelpers.forEach((h) => { get(h, 'Helper').pieceRate += (it.helperAmount || 0) / n; });
    });
  });

  return [...people.values()]
    .map((p) => {
      const daily = (p.role === 'Driver' ? driverDaily : helperDaily) * p.days.size;
      // Trip bonus: bonusHead for each truck and day where this person has bonusTrips or more of
      // their own non-voided trips (by default ₱100 at 5 trips, set in the crew rates).
      const bonus = [...p.tripsByKey.values()].filter((n) => n >= bonusTrips).length * bonusHead;
      return {
        key: p.key,
        id: p.id,
        name: p.name,
        role: p.role,
        trips: p.tripCount,
        trucks: [...p.trucks].sort(),
        days: p.days.size,
        pieceRate: +p.pieceRate.toFixed(2),
        dailyRate: daily,
        bonus,
        total: +(p.pieceRate + daily + bonus).toFixed(2),
      };
    })
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'Driver' ? -1 : 1));
}
// Daily-paid late deduction (client's rule): ₱3 per minute late, counted from the 06:30 call time,
// and never more than that day's pay.
export const DAILY_LATE_PER_MINUTE = 3;

export function dailyPresent(row) {
  return !!row && !row.isAbsent && !row.isLeave && (!!row.timeIn || !!row.isAssumedIn);
}

export function dailyLateDeduction(lateMins, cap) {
  const due = Math.max(0, Number(lateMins) || 0) * DAILY_LATE_PER_MINUTE;
  return round2(Math.min(Math.max(0, Number(cap) || 0), due));
}

export function crewDayPay(crewPeople, dailyStaff) {
  const byKey = new Map((dailyStaff || []).map((d) => [d.key, d]));
  const piece = (crewPeople || []).map((p) => {
    const a = byKey.get(p.key ?? p.name);
    const lateMins = a && a.present ? a.lateMins : 0;
    const late = dailyLateDeduction(lateMins, p.total);
    return { ...p, lateMins, late, payable: round2(p.total - late) };
  });
  const attendance = (dailyStaff || [])
    .filter((d) => d.attendanceDaily && d.present)
    .map((d) => {
      const gross = round2(d.dailyRate);
      const late = dailyLateDeduction(d.lateMins, gross);
      return {
        key: d.key, id: d.id, name: d.name ?? d.key, role: d.position, trucks: [], trips: 0, days: 1,
        pieceRate: 0, dailyRate: gross, bonus: 0, total: gross,
        lateMins: d.lateMins, late, payable: round2(gross - late), attendanceDaily: true,
      };
    });
  return [...piece, ...attendance];
}

// The full month's employee share (two cutoffs) of SSS, PhilHealth and Pag-IBIG.
export function monthlyEmployeeShare(e, statutory) {
  const sss = round2(e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) * 2 : 0);
  const phic = round2(e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) * 2 : 0);
  const hdmf = round2(e.piOn ? computePagIBIG(e.declaredSalary, statutory.pagibig) * 2 : 0);
  return { sss, phic, hdmf, total: round2(sss + phic + hdmf) };
}

export function monthBounds(ymd) {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${ymd.slice(0, 8)}01`, end: `${ymd.slice(0, 8)}${String(last).padStart(2, '0')}` };
}

// Daily contribution amount: the fixed amount from the crew rates if one is set, otherwise the
// monthly share spread over the month's working days (Sundays off), rounded up to the centavo.
export function contributionPerDay(setting, shareTotal, ymd) {
  if (setting !== null && setting !== undefined && setting !== '') return round2(Math.max(0, Number(setting) || 0));
  const days = workingDaysIn(monthBounds(ymd));
  if (!days || !(shareTotal > 0)) return 0;
  return Math.ceil((shareTotal / days) * 100 - 1e-9) / 100;
}

export function dailyContributionFor({ perDay, shareTotal, collectedBefore }, payable) {
  const remaining = Math.max(0, round2((Number(shareTotal) || 0) - (Number(collectedBefore) || 0)));
  return round2(Math.max(0, Math.min(Number(perDay) || 0, Math.max(0, Number(payable) || 0), remaining)));
}

export function collectDailyContributions(days, shareTotal, perDay) {
  let collected = 0;
  const byDay = {};
  for (const d of [...days].sort((a, b) => a.ymd.localeCompare(b.ymd))) {
    const amount = dailyContributionFor({ perDay, shareTotal, collectedBefore: collected }, d.payable);
    if (amount > 0) {
      byDay[d.ymd] = amount;
      collected = round2(collected + amount);
    }
  }
  return { byDay, collected, remaining: Math.max(0, round2(shareTotal - collected)) };
}
