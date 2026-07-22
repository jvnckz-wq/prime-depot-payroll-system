'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, Download } from 'lucide-react';
import { Badge, Btn, Eyebrow, H1, Panel, Td, Th } from '../components/ui.jsx';
import { BONUS_HEAD, BONUS_TRIPS, CREWS, DRIVER_DAILY } from '../data/seed';
import { computePagIBIG, computePhilHealth, computeSSS } from '../lib/payroll';
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
  const driverStats = CREWS.map(c => {
    const log = deliveries[c.id];
    const trips = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
    const earn = log ? DRIVER_DAILY + log.items.reduce((s, i) => s + i.d, 0) + (trips >= BONUS_TRIPS ? BONUS_HEAD : 0) : 0;
    return { crew: c, trips, earn, bonus: trips >= BONUS_TRIPS };
  });

  const exportRegister = () => exportXLSX('Payroll-Register.xlsx', [{ name: 'Register', rows: registerRows.map(r => ({ Employee: r.emp.name, Gross: r.gross, SSS: r.sss, PhilHealth: r.ph, 'Pag-IBIG': r.hdmf, Net: r.net })) }]);
  const exportRemit = () => exportXLSX('Gov-Remittance.xlsx', [{ name: 'Remittance', rows: registerRows.map(r => ({ Employee: r.emp.name, SSS: r.sss, PhilHealth: r.ph, 'Pag-IBIG': r.hdmf, Total: r.sss + r.ph + r.hdmf })) }]);
  const export13 = () => exportXLSX('13th-Month-Pay.xlsx', [{ name: '13th Month', rows: T13.map(r => ({ Employee: r.name, 'Months Worked': r.months, 'Total Basic': r.basic, '13th Month Pay': r.pay })) }]);
  const exportDriver = () => exportXLSX('Driver-Earnings.xlsx', [{ name: 'Drivers', rows: driverStats.map(d => ({ Driver: d.crew.driver, Truck: d.crew.id, Trips: d.trips, 'Total Earned': d.earn })) }]);

  const tabs = [['register', 'Payroll Register'], ['remittance', "Gov't Remittance"], ['13th', '13th Month Pay'], ['drivers', 'Driver & Delivery'], ['bir', 'BIR Reference']];

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
            <Eyebrow>Driver & Delivery Earnings</Eyebrow>
            <Btn size="sm" variant="outline" icon={Download} onClick={exportDriver}>Export Excel</Btn>
          </div>
          <table className="w-full">
            <thead><tr><Th>Driver</Th><Th>Truck</Th><Th right>Trips</Th><Th>Bonus</Th><Th right>Total Earned</Th></tr></thead>
            <tbody>{driverStats.map((d, i) => <tr key={i}><Td>{d.crew.driver}</Td><Td mono>{d.crew.id}</Td><Td right mono>{d.trips}</Td><Td>{d.bonus && <Badge tone="amber">Palima</Badge>}</Td><Td right mono>{peso(d.earn)}</Td></tr>)}</tbody>
          </table>
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
