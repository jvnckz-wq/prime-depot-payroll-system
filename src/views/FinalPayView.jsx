'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Btn, Field, Panel } from '../components/ui.jsx';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, F_SERIF, T } from '../theme';

const EXIT_TYPES = ['Resignation', 'Termination', 'End of Contract', 'Retirement', 'AWOL'];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nf = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

// A labelled amount row on the final-pay slip. Defined at module scope (not
// inside FinalPayView) so it is a stable component identity across renders —
// it only depends on its props and the module-level theme tokens.
const Row = ({ label, value, bold }) => (
  <div className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
    <span style={{ color: T.ink }}>{label}</span>
    <span className="tabular-nums" style={{ fontFamily: F_MONO, color: T.ink, fontWeight: bold ? 700 : 400 }}>{value}</span>
  </div>
);

// Final pay = (a) unpaid salary + (b) pro-rated 13th month + (c) unused leave
// credits — matching the client's FINAL PAY sheet exactly (no deductions).
export const FinalPayView = ({ employee, onBack, toast }) => {
  const [loading, setLoading] = useState(true);
  const [exitType, setExitType] = useState('Resignation');
  const [exitDate, setExitDate] = useState('');
  const [lastService, setLastService] = useState('');
  const [rate, setRate] = useState(employee.rate || 0);
  const [days, setDays] = useState(0);
  const [otAllow, setOtAllow] = useState(0);
  const [yearBasic, setYearBasic] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [periodLabel, setPeriodLabel] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/payroll/final-pay?employeeId=${encodeURIComponent(employee.id)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => {
        if (cancelled) return;
        setRate(d.employee?.rate ?? employee.rate ?? 0);
        setDays(d.days ?? 0);
        setOtAllow(d.otAndAllowances ?? 0);
        setYearBasic(d.yearBasic ?? 0);
        setLeaveDays(d.leaveRemaining ?? 0);
        if (d.period) { setPeriodLabel(`${d.period.start} \u2192 ${d.period.end}`); setLastService(d.period.end); setExitDate(d.period.end); }
      })
      .catch(err => { console.error('Final pay load failed:', err); if (toast) toast('Could not load final-pay details.', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employee.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grossA = round2(nf(rate) * nf(days));
  const netA = round2(grossA + nf(otAllow));
  const b = round2(nf(yearBasic) / 12);
  const c = round2(nf(rate) * nf(leaveDays));
  const total = round2(netA + b + c);

  const numInput = (value, onChange) => (
    <input type="number" value={value} onChange={e => onChange(e.target.value)}
      className="px-2 py-1.5 rounded border text-sm w-32" style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink, backgroundColor: T.surface }} />
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Employees
        </button>
        <Btn variant="outline" icon={Printer} onClick={() => window.print()}>Print</Btn>
      </div>

      {/* Editable inputs — never printed */}
      <div className="no-print mb-4 grid gap-3 md:grid-cols-2 p-4 rounded" style={{ backgroundColor: T.bg, border: `1px solid ${T.line}` }}>
        <div className="md:col-span-2 text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>
          Final pay details {loading ? '· loading…' : ''}{periodLabel ? ` · last cutoff ${periodLabel}` : ''}
        </div>
        <Field label="Type of exit">
          <select value={exitType} onChange={e => setExitType(e.target.value)} className="px-2 py-1.5 rounded border text-sm w-full" style={{ borderColor: T.line, fontFamily: F_BODY, color: T.ink, backgroundColor: T.surface }}>
            {EXIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date of exit effectivity">
          <input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} className="px-2 py-1.5 rounded border text-sm w-full" style={{ borderColor: T.line, fontFamily: F_BODY, color: T.ink, backgroundColor: T.surface, colorScheme: 'light' }} />
        </Field>
        <Field label="Last date of service"><input type="date" value={lastService} onChange={e => setLastService(e.target.value)} className="px-2 py-1.5 rounded border text-sm w-full" style={{ borderColor: T.line, fontFamily: F_BODY, color: T.ink, backgroundColor: T.surface, colorScheme: 'light' }} /></Field>
        <Field label="Daily rate (₱)">{numInput(rate, setRate)}</Field>
        <Field label="Days worked (last cutoff)">{numInput(days, setDays)}</Field>
        <Field label="OT + other allowances (₱)">{numInput(otAllow, setOtAllow)}</Field>
        <Field label="Total basic salary this year (₱)">{numInput(yearBasic, setYearBasic)}</Field>
        <Field label="Unused leave days">{numInput(leaveDays, setLeaveDays)}</Field>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #final-pay-slip, #final-pay-slip * { visibility: visible; }
          #final-pay-slip { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <Panel id="final-pay-slip" className="max-w-lg overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: `2px solid ${T.brand}` }}>
          <div className="font-bold" style={{ fontFamily: F_SERIF, color: T.brand, fontSize: 22, letterSpacing: '0.02em' }}>PRIME DEPOT HARDWARE</div>
          <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.ink, letterSpacing: '0.04em' }}>TILES, PAINTS &amp; CONSTRUCTION SUPPLY</div>
          <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft, letterSpacing: '0.08em' }}>BRGY. P. NIOGAN, MABINI, BATANGAS</div>
          <div className="text-sm font-bold mt-3" style={{ fontFamily: F_HEAD, color: T.ink, letterSpacing: '0.06em' }}>RECEIVING OF FINAL PAY</div>
        </div>

        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          {[["Employee's Name:", employee.name], ['Position:', employee.position], ['Frequency of Salary Releasing:', 'Bi-Monthly'], ['Type of Exit:', exitType], ['Date of Exit Effectivity:', exitDate || '—'], ['Last Date of Service Rendered:', lastService || '—']].map(([l, v], i) => (
            <div key={i} className="flex gap-2 text-sm py-0.5" style={{ fontFamily: F_BODY }}>
              <span style={{ color: T.soft }}>{l}</span>
              <span className="font-bold" style={{ color: T.ink }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="text-sm font-bold mb-1.5" style={{ fontFamily: F_HEAD, color: T.ink }}>a. Unpaid Salary</div>
          <Row label="Daily Rate" value={peso(rate)} />
          <Row label="Number of Days Worked" value={String(nf(days))} />
          <Row label="Gross Amount" value={peso(grossA)} />
          <Row label="Overtime Pay and Other Allowances" value={peso(otAllow)} />
          <Row label={`Net Salary${periodLabel ? ` (${periodLabel})` : ''}`} value={peso(netA)} bold />
        </div>

        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="text-sm font-bold mb-1.5" style={{ fontFamily: F_HEAD, color: T.ink }}>b. Pro-Rated 13th-Month Pay</div>
          <Row label="Total Basic Salary Received during the Current Year" value={peso(yearBasic)} />
          <Row label="Number of Months in a Year" value="12" />
          <Row label="Total" value={peso(b)} bold />
        </div>

        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="text-sm font-bold mb-1.5" style={{ fontFamily: F_HEAD, color: T.ink }}>c. Unused Leave Credits</div>
          <Row label="Daily Rate" value={peso(rate)} />
          <Row label="Number of Unused Leave Days" value={String(nf(leaveDays))} />
          <Row label="Total" value={peso(c)} bold />
        </div>

        <div className="flex justify-between items-baseline px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <span className="font-bold" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 15 }}>TOTAL AMOUNT OF FINAL PAY:</span>
          <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: T.brand, fontSize: 20 }}>{peso(total)}</span>
        </div>

        <div className="px-6 pt-8 pb-6">
          <div className="text-xs mb-6" style={{ fontFamily: F_BODY, color: T.soft }}>Conforme:</div>
          <div className="w-64"><div className="h-px mb-1.5" style={{ backgroundColor: T.ink }} /><div className="text-xs" style={{ fontFamily: F_BODY, color: T.ink, fontWeight: 700 }}>{employee.name}</div></div>
        </div>
      </Panel>
    </div>
  );
};
