'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, Download } from 'lucide-react';
import { Badge, Btn, EmptyState, Eyebrow, H1, Panel, Td, Th } from '../components/ui.jsx';
import { BONUS_HEAD, BONUS_TRIPS, DRIVER_DAILY, HELPER_DAILY } from '../data/seed';
import { computePagIBIG, computePhilHealth, computeSSS, crewEarnings } from '../lib/payroll';
import { exportXLSX, peso } from '../lib/utils';
import { F_BODY, F_HEAD, T } from '../theme';

export const ReportsView = ({ staff, deliveries, loans, statutory }) => {
  const [tab, setTab] = useState('register');

  const registerRows = staff.map(e => {
    const gross = e.rate * 11;
    const sss = e.sssOn ? computeSSS(e.declaredSalary, statutory.sss) : 0;
    const ph = e.phOn ? computePhilHealth(e.declaredSalary, statutory.philhealth) : 0;
    const hdmf = e.piOn ? (computePagIBIG(e.declaredSalary, statutory.pagibig) + (e.mp2 || 0)) : 0;
    return { emp: e, gross, sss, ph, hdmf, net: gross - sss - ph - hdmf };
  });
  const T13 = staff.map(e => ({ name: e.name, months: 12, basic: e.rate * 22 * 12, pay: Math.round(e.rate * 22 * 12 / 12 * 100) / 100 }));
  // Earnings are reported per PERSON, not per truck. A pahinante can ride with
  // two different drivers in one day, so a per-truck total cannot answer what
  // any one of them is owed. Voided trips are already excluded upstream.
  const crewRows = crewEarnings(deliveries, {
    driverDaily: DRIVER_DAILY, helperDaily: HELPER_DAILY,
    bonusHead: BONUS_HEAD, bonusTrips: BONUS_TRIPS,
  });

  const exportRegister = () => exportXLSX('Payroll-Register.xlsx', [{ name: 'Register', rows: registerRows.map(r => ({ Employee: r.emp.name, Gross: r.gross, SSS: r.sss, PhilHealth: r.ph, 'Pag-IBIG': r.hdmf, Net: r.net })) }]);
  const exportRemit = () => exportXLSX('Gov-Remittance.xlsx', [{ name: 'Remittance', rows: registerRows.map(r => ({ Employee: r.emp.name, SSS: r.sss, PhilHealth: r.ph, 'Pag-IBIG': r.hdmf, Total: r.sss + r.ph + r.hdmf })) }]);
  const export13 = () => exportXLSX('13th-Month-Pay.xlsx', [{ name: '13th Month', rows: T13.map(r => ({ Employee: r.name, 'Months Worked': r.months, 'Total Basic': r.basic, '13th Month Pay': r.pay })) }]);
  const exportDriver = () => exportXLSX('Crew-Earnings.xlsx', [{ name: 'Crew', rows: crewRows.map(r => ({
    Name: r.name, Role: r.role, Trucks: r.trucks.join(', '), Days: r.days, Trips: r.trips,
    'Daily Rate': r.dailyRate, 'Piece Rate': r.pieceRate, 'Palima Bonus': r.bonus, 'Total Earned': r.total,
  })) }]);

  const tabs = [['register', 'Payroll Register'], ['remittance', "Gov't Remittance"], ['13th', '13th Month Pay'], ['drivers', 'Crew Earnings'], ['bir', 'BIR Reference']];

  return (
    <div className="p-6">
      <H1 sub="Payroll, government compliance, and delivery earnings reports.">Reports</H1>
      <div className="flex gap-1 mb-4 flex-wrap rounded-md p-0.5" style={{ backgroundColor: T.lineSoft, width: 'fit-content' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: tab === k ? T.surface : 'transparent', color: tab === k ? T.ink : T.soft }}>{l}</button>
        ))}
      </div>

      {tab === 'register' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Payroll Register — May 16–31, 2026</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportRegister}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>Gross</Th><Th right>SSS</Th><Th right>PhilHealth</Th><Th right>Pag-IBIG</Th><Th right>Net Pay</Th></tr></thead>
            <tbody>{registerRows.map((r, i) => <tr key={i}><Td>{r.emp.name}</Td><Td right mono>{peso(r.gross)}</Td><Td right mono>{peso(r.sss)}</Td><Td right mono>{peso(r.ph)}</Td><Td right mono>{peso(r.hdmf)}</Td><Td right mono>{peso(r.net)}</Td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {tab === 'remittance' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Government Remittance — Employee Share</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportRemit}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>SSS</Th><Th right>PhilHealth</Th><Th right>Pag-IBIG</Th><Th right>Total Withheld</Th></tr></thead>
            <tbody>{registerRows.map((r, i) => <tr key={i}><Td>{r.emp.name}</Td><Td right mono>{peso(r.sss)}</Td><Td right mono>{peso(r.ph)}</Td><Td right mono>{peso(r.hdmf)}</Td><Td right mono>{peso(r.sss + r.ph + r.hdmf)}</Td></tr>)}</tbody>
          </table>
          <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.line}` }}><AlertTriangle size={12} /> Estimated employee-share figures for this prototype. Add employer counterpart before remitting.</div>
        </Panel>
      )}
      {tab === '13th' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>13th Month Pay — FY 2026 (Basic ÷ 12)</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={export13}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>Months Worked</Th><Th right>Total Basic</Th><Th right>13th Month Pay</Th></tr></thead>
            <tbody>{T13.map((r, i) => <tr key={i}><Td>{r.name}</Td><Td right mono>{r.months}</Td><Td right mono>{peso(r.basic)}</Td><Td right mono>{peso(r.pay)}</Td></tr>)}</tbody>
          </table>
        </Panel>
      )}
      {tab === 'drivers' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Crew Earnings — per person</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportDriver}>Export Excel</Btn>
          </div>
          <p className="text-xs px-4 pb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            One row per person, totalled across every truck they rode. A pahinante who worked with two
            different drivers appears once here, not twice.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><Th>Name</Th><Th>Role</Th><Th>Trucks</Th><Th right>Days</Th><Th right>Trips</Th><Th right>Daily</Th><Th right>Piece Rate</Th><Th right>Palima</Th><Th right>Total</Th></tr></thead>
              <tbody>{crewRows.map((r, i) => (
                <tr key={i}>
                  <Td>{r.name}</Td>
                  <Td><Badge tone={r.role === 'Driver' ? 'amber' : 'neutral'}>{r.role}</Badge></Td>
                  <Td mono><span style={{ color: T.soft }}>{r.trucks.join(', ')}</span></Td>
                  <Td right mono>{r.days}</Td>
                  <Td right mono>{r.trips}</Td>
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
          <table className="w-full">
            <thead><tr><Th>Over</Th><Th>Not Over</Th><Th right>Base Tax</Th><Th right>Rate on Excess</Th></tr></thead>
            <tbody>{statutory.bir.map((r, i) => <tr key={i}><Td mono>{peso(r.over)}</Td><Td mono>{r.notOver === null ? 'Above' : peso(r.notOver)}</Td><Td right mono>{peso(r.base)}</Td><Td right mono>{r.rate}%</Td></tr>)}</tbody>
          </table>
          <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.green, borderTop: `1px solid ${T.line}`, backgroundColor: T.greenBg }}><Check size={12} /> All current employees fall below the taxable threshold — ₱0 withholding tax.</div>
        </Panel>
      )}
    </div>
  );
};

/* ============================= SETTINGS ============================= */
