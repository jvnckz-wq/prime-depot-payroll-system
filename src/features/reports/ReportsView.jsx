'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Badge, Btn, EmptyState, Eyebrow, H1, Panel, Skeleton, Td, Th } from '@/components/ui.jsx';
import { CREW_RATE_FALLBACK, positionLabel } from '@/data/seed';
import { computeStaffPayroll, crewEarnings, deliveriesToLog } from '@/lib/payroll';
import { todayYmdManila } from '@/lib/loan-rules';
import { exportXLSX, peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '@/components/theme';

function crewEarningsRange(apiDeliveries, crewRates) {
  const byDate = {};
  for (const d of apiDeliveries) (byDate[d.date] ||= []).push(d);
  const merged = new Map();
  for (const rows of Object.values(byDate)) {
    const day = crewEarnings(deliveriesToLog(rows), crewRates);
    for (const p of day) {
      if (!merged.has(p.name)) merged.set(p.name, { name: p.name, role: p.role, trips: 0, days: 0, trucks: new Set(), pieceRate: 0, dailyRate: 0, bonus: 0, total: 0 });
      const m = merged.get(p.name);
      m.trips += p.trips; m.days += p.days; m.pieceRate += p.pieceRate;
      m.dailyRate += p.dailyRate; m.bonus += p.bonus; m.total += p.total;
      p.trucks.forEach(t => m.trucks.add(t));
    }
  }
  return [...merged.values()]
    .map(m => ({ ...m, trucks: [...m.trucks].sort(), pieceRate: +m.pieceRate.toFixed(2), total: +m.total.toFixed(2) }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'Driver' ? -1 : 1));
}

export const ReportsView = ({ staff, deliveries, loans, statutory, cutoffLabel = '', runKey = '', attendanceSummaries = [], crewRates = CREW_RATE_FALLBACK, navTab }) => {
  const [tab, setTab] = useState(navTab || 'register');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the report from the sidebar selection
  useEffect(() => { if (navTab) setTab(navTab); }, [navTab]);

  const todayStr = todayYmdManila();
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [rangeApi, setRangeApi] = useState([]);
  const [loadingRange, setLoadingRange] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    setLoadingRange(true);
    const t = setTimeout(() => {
      fetch(`/api/deliveries?from=${from}&to=${to}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then(data => { if (!cancelled) setRangeApi(data.deliveries || []); })
        .catch(err => console.error('Could not load crew earnings range:', err))
        .finally(() => { if (!cancelled) setLoadingRange(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [from, to]);

  const attById = useMemo(() => {
    const m = {};
    for (const s of attendanceSummaries) m[s.id] = s;
    return m;
  }, [attendanceSummaries]);
  const cutoffKey = runKey || `staff-${cutoffLabel}`;

  const payrollRows = useMemo(
    () => staff.filter(e => Number(e.rate) > 0).map(e => ({ emp: e, calc: computeStaffPayroll(e, loans, statutory, attById[e.id], cutoffKey) })).filter(r => r.calc.hasAttendance),
    [staff, loans, statutory, attById, cutoffKey]
  );
  const remitRows = payrollRows;
  const T13 = staff.filter(e => Number(e.rate) > 0).map(e => ({ name: e.name, months: 12, basic: e.rate * 22 * 12, pay: Math.round(e.rate * 22 * 12 / 12 * 100) / 100 }));
  const crewRows = useMemo(() => crewEarningsRange(rangeApi, crewRates), [rangeApi, crewRates]);

  const exportRegister = () => exportXLSX('Payroll-Register.xlsx', [{ name: 'Register', rows: payrollRows.map(r => ({ Employee: r.emp.name, Days: r.calc.days, Gross: r.calc.gross, OT: r.calc.ot, Deductions: r.calc.totalDeductions, 'Net Pay': r.calc.net })) }]);
  const exportRemit = () => exportXLSX('Gov-Remittance.xlsx', [{ name: 'Remittance', rows: remitRows.map(r => ({ Employee: r.emp.name, SSS: r.calc.sss, PhilHealth: r.calc.phic, 'Pag-IBIG': r.calc.hdmf, Total: r.calc.sss + r.calc.phic + r.calc.hdmf })) }]);
  const export13 = () => exportXLSX('13th-Month-Pay.xlsx', [{ name: '13th Month', rows: T13.map(r => ({ Employee: r.name, 'Months Worked': r.months, 'Total Basic': r.basic, '13th Month Pay': r.pay })) }]);
  const exportDriver = () => exportXLSX('Crew-Earnings.xlsx', [{ name: 'Crew', rows: crewRows.map(r => ({
    Name: r.name, Role: positionLabel(r.role), Trucks: r.trucks.join(', '), Days: r.days, Trips: r.trips,
    'Daily Rate': r.dailyRate, 'Piece Rate': r.pieceRate, 'Palima Bonus': r.bonus, 'Total Earned': r.total,
  })) }]);

  return (
    <div className="p-4 sm:p-6">
      <H1 sub="Payroll, government compliance, and delivery earnings reports.">Reports</H1>

      {tab === 'register' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Payroll Register — {cutoffLabel || 'Current cutoff'}</Eyebrow>
            <Btn size="sm" variant="outline" onClick={exportRegister}>Export Excel</Btn>
          </div>
          <div className="overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th center>Days</Th><Th right>Gross</Th><Th right>OT</Th><Th right>Deductions</Th><Th right>Net Pay</Th></tr></thead>
              <tbody>{payrollRows.map((r, i) => (
                <tr key={i}>
                  <Td>{r.emp.name}</Td>
                  <Td center mono>{r.calc.days}</Td>
                  <Td right mono>{peso(r.calc.gross)}</Td>
                  <Td right mono>{r.calc.ot ? peso(r.calc.ot) : '—'}</Td>
                  <Td right mono>{r.calc.totalDeductions ? <span style={{ color: T.red }}>−{peso(r.calc.totalDeductions)}</span> : peso(0)}</Td>
                  <Td right mono><span style={{ fontWeight: 600 }}>{peso(r.calc.net)}</span></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === 'remittance' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Government Remittance — Employee Share</Eyebrow>
            <Btn size="sm" variant="outline" onClick={exportRemit}>Export Excel</Btn>
          </div>
          <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>SSS</Th><Th right>PhilHealth</Th><Th right>Pag-IBIG</Th><Th right>Total Withheld</Th></tr></thead>
            <tbody>{remitRows.map((r, i) => <tr key={i}><Td>{r.emp.name}</Td><Td right mono>{peso(r.calc.sss)}</Td><Td right mono>{peso(r.calc.phic)}</Td><Td right mono>{peso(r.calc.hdmf)}</Td><Td right mono>{peso(r.calc.sss + r.calc.phic + r.calc.hdmf)}</Td></tr>)}</tbody>
          </table></div>
          <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.line}` }}><AlertTriangle size={12} /> Estimated employee-share figures for this prototype. Add employer counterpart before remitting.</div>
        </Panel>
      )}
      {tab === '13th' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>13th Month Pay — FY {new Date().getFullYear()} (Basic ÷ 12)</Eyebrow>
            <Btn size="sm" variant="outline" onClick={export13}>Export Excel</Btn>
          </div>
          <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
            <thead><tr><Th>Employee</Th><Th center>Months Worked</Th><Th right>Total Basic</Th><Th right>13th Month Pay</Th></tr></thead>
            <tbody>{T13.map((r, i) => <tr key={i}><Td>{r.name}</Td><Td center mono>{r.months}</Td><Td right mono>{peso(r.basic)}</Td><Td right mono>{peso(r.pay)}</Td></tr>)}</tbody>
          </table></div>
        </Panel>
      )}
      {tab === 'drivers' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Eyebrow>Crew Earnings — per person</Eyebrow>
              <input type="date" max={todayStr} value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded border text-sm" style={{ borderColor: T.line, fontFamily: F_MONO, minWidth: 168, colorScheme: 'light', color: T.ink, backgroundColor: T.surface }} />
              <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>to</span>
              <input type="date" max={todayStr} value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded border text-sm" style={{ borderColor: T.line, fontFamily: F_MONO, minWidth: 168, colorScheme: 'light', color: T.ink, backgroundColor: T.surface }} />
              {loadingRange && <Skeleton w={72} h={11} />}
            </div>
            <Btn size="sm" variant="outline" onClick={exportDriver}>Export Excel</Btn>
          </div>
          <p className="text-xs px-4 pb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            One row per person, totalled across every truck they rode. A pahinante who worked with two
            different drivers appears once here, not twice.
          </p>
          <div className="overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr><Th>Name</Th><Th>Role</Th><Th>Trucks</Th><Th center>Days</Th><Th center>Trips</Th><Th right>Daily</Th><Th right>Piece Rate</Th><Th right>Palima</Th><Th right>Total</Th></tr></thead>
              <tbody>{crewRows.map((r, i) => (
                <tr key={i}>
                  <Td>{r.name}</Td>
                  <Td><Badge tone={r.role === 'Driver' ? 'amber' : 'neutral'}>{positionLabel(r.role)}</Badge></Td>
                  <Td mono><span style={{ color: T.soft }}>{r.trucks.join(', ')}</span></Td>
                  <Td center mono>{r.days}</Td>
                  <Td center mono>{r.trips}</Td>
                  <Td right mono>{peso(r.dailyRate)}</Td>
                  <Td right mono>{peso(r.pieceRate)}</Td>
                  <Td right mono>{r.bonus ? <span style={{ color: T.green }}>{peso(r.bonus)}</span> : '—'}</Td>
                  <Td right mono><span style={{ fontWeight: 700 }}>{peso(r.total)}</span></Td>
                </tr>
              ))}</tbody>
            </table>
            {!crewRows.length && <EmptyState title="No crew earnings yet" desc="Totals appear once deliveries are logged." />}
          </div>
        </Panel>
      )}
      {tab === 'bir' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}><Eyebrow>BIR TRAIN Law — Withholding Tax Reference</Eyebrow></div>
          <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
            <thead><tr><Th>Over</Th><Th>Not Over</Th><Th right>Base Tax</Th><Th right>Rate on Excess</Th></tr></thead>
            <tbody>{statutory.bir.map((r, i) => <tr key={i}><Td mono>{peso(r.over)}</Td><Td mono>{r.notOver === null ? 'Above' : peso(r.notOver)}</Td><Td right mono>{peso(r.base)}</Td><Td right mono>{r.rate}%</Td></tr>)}</tbody>
          </table></div>
          <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.green, borderTop: `1px solid ${T.line}`, backgroundColor: T.greenBg }}><Check size={12} /> All current employees fall below the taxable threshold — ₱0 withholding tax.</div>
        </Panel>
      )}
    </div>
  );
};