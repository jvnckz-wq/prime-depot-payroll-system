import { CREW_POSITIONS } from '../data/seed';
import { dueFor } from './loan-rules';

export function isCrewPosition(position) {
  return CREW_POSITIONS.includes(position);
}

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
    if (!out[d.truckId]) out[d.truckId] = { date: d.date, items: [], kaltas: [] };
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
        item: it.item, qty: it.qty, unit: it.unit, d: it.d, h: it.h,
        dbl: d.dbl,
        helpers: first ? d.helpers : undefined,
        driver: first ? d.driver : undefined,
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

const DEFAULT_CUTOFF_DAYS = 11;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function computeStaffPayroll(e, loans = [], statutory, attendance = null, runKey = null) {
  const hasAttendance = !!attendance;
  const leaveDays = hasAttendance ? (attendance.leave || 0) : 0;
  const days = hasAttendance ? (attendance.present + leaveDays) : DEFAULT_CUTOFF_DAYS;
  const gross = round2(e.rate * days);

  const hourly = e.rate / 8;
  const otWeekdayMins = hasAttendance ? (attendance.otWeekdayMins || 0) : 0;
  const otWeekendMins = hasAttendance ? (attendance.otWeekendMins || 0) : 0;
  const otWeekday = round2(hourly * (otWeekdayMins / 60) * 1.25);
  const otWeekend = round2(hourly * (otWeekendMins / 60) * 1.3);
  const ot = round2(otWeekday + otWeekend);

  const allowance = round2(Number(e.allowance) || 0);

  const sss = round2(e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) : 0);
  const phic = round2(e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) : 0);
  const mp1 = round2(e.piOn ? computePagIBIG(e.declaredSalary, statutory.pagibig) : 0);
  const mp2Set = round2(e.piOn ? (Number(e.mp2) || 0) : 0);

  const lateMins = hasAttendance ? (attendance.lateMins || 0) : 0;
  const tardinessDue = round2(e.rate * lateMins / 240);
  const totalEarnings = round2(gross + ot + allowance);

  let room = round2(totalEarnings - sss - phic - mp1);
  const companyCover = room < 0 ? round2(-room) : 0;
  room = Math.max(0, room);
  const tardiness = round2(Math.min(tardinessDue, room));
  room = round2(room - tardiness);
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

  const totalDeductions = round2(sss + phic + hdmf + advance + tardiness);
  const net = round2(totalEarnings + companyCover - totalDeductions);
  return { hasAttendance, days, present: hasAttendance ? attendance.present : days, leaveDays, lateMins, gross, otWeekday, otWeekend, ot, allowance, sss, phic, mp1, mp2, hdmf, companyCover, advance, loanDeduction, advanceDeduction, deductionLines, tardiness, tardinessDue, totalEarnings, totalDeductions, net };
}

export function computeSSS(monthlySalary, table) {
  if (!monthlySalary || monthlySalary <= 0 || !table.length) return 0;
  const bracket = table.find(b => b.ceiling !== null && monthlySalary < b.ceiling) || table[table.length - 1];
  return bracket.share / 2;
}
export function computePhilHealth(monthlySalary, ph) {
  if (!monthlySalary || monthlySalary <= 0) return 0;
  const base = Math.max(ph.floor, Math.min(ph.ceiling, monthlySalary));
  return base * (ph.rate / 100) / 2 / 2;
}
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
  const trips = flattenDeliveries(deliveries);

  const people = new Map();
  const get = (name, role) => {
    if (!people.has(name)) {
      people.set(name, {
        name, role,
        pieceRate: 0,
        trucks: new Set(),
        days: new Set(),
        tripKeys: new Set(),
        tripCount: 0,
      });
    }
    return people.get(name);
  };

  const truckDayTrips = new Map();
  trips.forEach((t) => {
    if (!t.seq) return;
    const key = `${t.crewId}|${t.date}`;
    if (!truckDayTrips.has(key)) truckDayTrips.set(key, new Set());
    truckDayTrips.get(key).add(t.seq);
  });

  let currentDriver = null, currentHelpers = [], currentKey = null;
  Object.entries(deliveries).forEach(([crewId, log]) => {
    (log.items || []).forEach((it) => {
      if (it.voided) return;
      if (it.seq) {
        currentDriver = it.driver || null;
        currentHelpers = it.helpers || [];
        currentKey = `${crewId}|${log.date}`;
        if (currentDriver) {
          const p = get(currentDriver, 'Driver');
          p.tripKeys.add(currentKey); p.trucks.add(crewId); p.days.add(log.date); p.tripCount += 1;
        }
        currentHelpers.forEach((h) => {
          const p = get(h, 'Pahinante');
          p.tripKeys.add(currentKey); p.trucks.add(crewId); p.days.add(log.date); p.tripCount += 1;
        });
      }
      if (currentDriver) get(currentDriver, 'Driver').pieceRate += it.d || 0;
      const n = currentHelpers.length;
      if (n) currentHelpers.forEach((h) => { get(h, 'Pahinante').pieceRate += (it.h || 0) / n; });
    });
  });

  return [...people.values()]
    .map((p) => {
      const daily = (p.role === 'Driver' ? driverDaily : helperDaily) * p.days.size;
      const bonus = [...p.tripKeys]
        .filter((k) => (truckDayTrips.get(k)?.size || 0) >= bonusTrips)
        .length * bonusHead;
      return {
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