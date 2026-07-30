import { CREW_POSITIONS, DOBLE_AREAS } from '../data/seed';

// The one place that decides which payroll an employee belongs to. Position is
// the only input: Driver and Pahinante are paid piece-rate (pakyawan) through
// the Truck Payroll module, everyone else runs through Staff Payroll. Keeping
// this in a single function means a future rule change is a one-line edit
// instead of a hunt through every view.
export function isCrewPosition(position) {
  return CREW_POSITIONS.includes(position);
}

/// Flattens the per-truck delivery log into a list of trips.
///
/// Voided trips are excluded by DEFAULT. Every earnings calculation flows
/// through here, so making the safe answer the default one means a correction
/// can never quietly leave money in a payslip — a caller has to ask for voided
/// rows explicitly, and the only callers that do are the ones drawing the
/// manifest on screen.
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

/// Converts what /api/deliveries returns into the per-truck shape the payslip
/// and manifest views already read.
///
/// The API returns one record per trip with its items nested, which is the
/// right shape for a database. The views were built around a flat list where
/// the first row of a trip carries the trip-level details and later rows leave
/// them blank. Translating here keeps that translation in one place instead of
/// scattering it through four views.
export function deliveriesToLog(apiDeliveries) {
  const out = {};
  for (const d of apiDeliveries || []) {
    if (!out[d.truckId]) out[d.truckId] = { date: d.date, items: [], kaltas: [] };
    // Keep the most recent date seen for this truck.
    if (d.date > out[d.truckId].date) out[d.truckId].date = d.date;

    (d.items || []).forEach((it, i) => {
      const first = i === 0;
      out[d.truckId].items.push({
        deliveryId: d.id,
        seq: first ? d.seq : null,
        address: first ? d.address : '',
        customer: first ? d.customer : '',
        item: it.item, qty: it.qty, unit: it.unit, d: it.d, h: it.h,
        dbl: d.dbl,
        helpers: first ? d.helpers : undefined,
        driver: first ? d.driver : undefined,
        voided: d.voided,
        voidedBy: d.voidedBy,
        voidReason: d.voidReason,
        loggedBy: d.loggedBy,
        date: d.date,
      });
    });
  }
  return out;
}

// shared payroll math so the Payslip list, the individual slip, and Reports always agree
// Semi-monthly staff pay. When an attendance summary for the cutoff is passed
// in, Days Present, Tardiness, and Overtime all come from the biometric record;
// otherwise the row falls back to a plain estimate (flagged hasAttendance:false)
// so views that don't load attendance — like the dashboard KPIs — still work.
//
// The money rules mirror the client's payroll sheet exactly:
//   Gross        = daily rate × Days Present
//   Hourly rate  = daily rate ÷ 8
//   OT (weekday) = hourly × (OT minutes ÷ 60) × 1.25
//   OT (weekend) = hourly × (OT minutes ÷ 60) × 1.30   (Sat/Sun)
//   Tardiness    = hourly × (late minutes ÷ 60) × 2     = rate × late ÷ 240
const DEFAULT_CUTOFF_DAYS = 11;

// Round to centavos. Applied to every money line so the amounts a payslip shows
// always add up to the totals it shows — no floating-point drift, no ₱0.01 gaps.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function computeStaffPayroll(e, loans = [], statutory, attendance = null, runKey = null) {
  const hasAttendance = !!attendance;
  const days = hasAttendance ? attendance.present : DEFAULT_CUTOFF_DAYS;
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
  const hdmf = round2(e.piOn ? (computePagIBIG(e.declaredSalary, statutory.pagibig) + (e.mp2 || 0)) : 0);

  // Loan deduction for THIS cutoff. If it's already applied (a ledger entry
  // tagged with this cutoff's runKey exists), use that exact amount so it stays
  // on the payslip after "Apply Deductions"/Finalize. Otherwise preview what
  // this cutoff would deduct from the running balance.
  const advance = round2(loans
    .filter(l => l.person === e.name && !l.paused)
    .reduce((s, l) => {
      const appliedThisCutoff = runKey
        ? l.entries.filter(en => en.type === 'deduction' && en.payslipId === runKey).reduce((a, en) => a + en.amount, 0)
        : 0;
      if (appliedThisCutoff > 0) return s + appliedThisCutoff;
      const bal = loanBalance(l);
      return bal > 0 ? s + Math.min(l.perCutoff, bal) : s;
    }, 0));

  const lateMins = hasAttendance ? (attendance.lateMins || 0) : 0;
  const tardiness = round2(e.rate * lateMins / 240);

  const totalEarnings = round2(gross + ot + allowance);
  const totalDeductions = round2(sss + phic + hdmf + advance + tardiness);
  const net = round2(totalEarnings - totalDeductions);
  return { hasAttendance, days, lateMins, gross, otWeekday, otWeekend, ot, allowance, sss, phic, hdmf, advance, tardiness, totalEarnings, totalDeductions, net };
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

/// Earnings grouped by PERSON rather than by truck.
///
/// The truck payslip answers "what did this truck cost today". It cannot
/// answer "what do we owe Echo", because a pahinante can ride with one driver
/// in the morning and another in the afternoon — their pay ends up split
/// across two truck payslips with nothing tying the halves together. Checking
/// every truck to find one helper's total is exactly the kind of manual
/// cross-referencing this system exists to remove.
///
/// Voided trips are excluded: flattenDeliveries drops them before we start.
export function crewEarnings(deliveries, { driverDaily, helperDaily, bonusHead, bonusTrips }) {
  const trips = flattenDeliveries(deliveries);

  // people[name] accumulates one person's work across every truck and day.
  const people = new Map();
  const get = (name, role) => {
    if (!people.has(name)) {
      people.set(name, {
        name, role,
        pieceRate: 0,
        trucks: new Set(),
        days: new Set(),
        // Keyed truck|date, so the palima bonus can be judged the way it is
        // actually awarded: per truck, per day.
        tripKeys: new Set(),
        tripCount: 0,
      });
    }
    return people.get(name);
  };

  // Trip totals per truck+date, needed for the bonus threshold.
  const truckDayTrips = new Map();
  trips.forEach((t) => {
    if (!t.seq) return;
    const key = `${t.crewId}|${t.date}`;
    if (!truckDayTrips.has(key)) truckDayTrips.set(key, new Set());
    truckDayTrips.get(key).add(t.seq);
  });

  // Walk every line item. Trip-level details (driver, helpers) only appear on
  // the first row of a trip, so they are carried forward.
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
      // A trip's helper amount is shared by whoever was actually on it.
      const n = currentHelpers.length;
      if (n) currentHelpers.forEach((h) => { get(h, 'Pahinante').pieceRate += (it.h || 0) / n; });
    });
  });

  return [...people.values()]
    .map((p) => {
      const daily = (p.role === 'Driver' ? driverDaily : helperDaily) * p.days.size;
      // Bonus is per truck per day, so somebody who qualified on two different
      // trucks in one day earns it twice — which is what actually happened.
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
