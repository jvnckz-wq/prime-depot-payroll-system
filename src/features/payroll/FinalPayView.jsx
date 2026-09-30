'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Btn, Confirm, Field, Panel } from '@/components/ui.jsx';
import { balanceOf, planDeductions, shortDate, todayYmdManila } from '@/lib/loan-rules';
import { peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, F_SERIF, T } from '@/components/theme';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nf = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

const EXIT_TYPES = ['Resignation', 'Termination', 'End of Contract', 'Retirement', 'AWOL'];

const Row = ({ label, value, bold }) => (
  <div className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
    <span style={{ color: T.ink }}>{label}</span>
    <span className="tabular-nums" style={{ fontFamily: F_MONO, color: T.ink, fontWeight: bold ? 700 : 400 }}>{value}</span>
  </div>
);

export const FinalPayView = ({ employee, onBack, toast, onDeactivate, editable = false }) => {
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
  const [loans, setLoans] = useState([]);
  const [finalKey, setFinalKey] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/payroll/final-pay?employeeId=${encodeURIComponent(employee.id)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => {
        if (cancelled) return;
        setLoans(d.loans || []);
        setFinalKey(d.finalKey || '');
        if (reload) return;
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
  }, [employee.id, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const grossA = round2(nf(rate) * nf(days));
  const netA = round2(grossA + nf(otAllow));
  const b = round2(nf(yearBasic) / 12);
  const c = round2(nf(rate) * nf(leaveDays));
  const total = round2(netA + b + c);

  const recordedEntries = loans.flatMap(l => (l.entries || []).filter(e => e.type === 'deduction' && e.payslipId === finalKey).map(e => ({ l, e })));
  const recorded = recordedEntries.length > 0;
  const preview = !recorded && finalKey && loans.length
    ? planDeductions(loans, { crew: !!loans[0].isCrew, runKey: finalKey, endYmd: todayYmdManila(), available: { [employee.id]: Math.max(0, total) }, full: true })
    : null;
  const loanLines = recorded
    ? recordedEntries.map(({ l, e }) => ({ id: l.id, l, amount: e.amount }))
    : (preview ? preview.writes.map(w => ({ id: w.loanId, l: loans.find(x => x.id === w.loanId), amount: w.amount })) : []);
  const deducted = round2(loanLines.reduce((s, x) => s + x.amount, 0));
  const stillOwed = recorded
    ? round2(loans.reduce((s, l) => s + Math.max(0, balanceOf(l)), 0))
    : round2(preview ? preview.unpaidTotal : 0);
  const netFinal = round2(total - deducted);
  const lineLabel = (l) => (l?.kind === 'CASH_ADVANCE' ? `Cash advance (${shortDate(l.dateGranted, true)})` : `Loan (${l?.purpose || 'Loan'})`);
  const recordedOn = recorded ? recordedEntries[0].e.date : '';

  const send = async (method) => {
    setBusy(true);
    try {
      const res = await fetch('/api/payroll/final-pay', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'POST' ? { employeeId: employee.id, finalPayTotal: Math.max(0, total) } : { employeeId: employee.id }),
      });
      const data = await res.json();
      if (!res.ok) { if (toast) toast(data.error || 'Could not save.', 'error'); return; }
      if (toast) {
        toast(method === 'POST'
          ? `Deducted ${peso(data.total)} from the final pay` + (data.unpaidTotal > 0 ? `; ${peso(data.unpaidTotal)} is still owed.` : '.')
          : 'Final pay deduction undone. The balances are back.');
      }
      setReload(n => n + 1);
    } catch {
      if (toast) toast('Could not reach the server.', 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

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
        <div className="flex items-center gap-2 no-print">
          <Btn variant="outline" onClick={() => window.print()}>Print</Btn>
          {onDeactivate && (
            <Btn variant="amber" onClick={onDeactivate}>Deactivate employee</Btn>
          )}
        </div>
      </div>

      {editable ? (
        <div className="no-print mb-4 grid gap-3 md:grid-cols-2 p-4 rounded" style={{ backgroundColor: T.bg, border: `1px solid ${T.line}` }}>
          <div className="md:col-span-2 text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>
            Final pay details {loading ? ', loading...' : ''}{periodLabel ? ` · last cutoff ${periodLabel}` : ''}
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
      ) : (
        periodLabel && (
          <div className="no-print mb-4 text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
            Final pay details · last cutoff {periodLabel}
          </div>
        )
      )}

      {loanLines.length > 0 && (
        <div className="no-print mb-4 p-3 rounded flex items-center flex-wrap gap-3 max-w-lg" style={{ backgroundColor: recorded ? T.greenBg : T.warnBg, border: `1px solid ${recorded ? T.line : '#EFD3A8'}` }}>
          <span className="text-sm flex-1" style={{ fontFamily: F_BODY, color: recorded ? T.green : '#7A4B12', lineHeight: 1.45 }}>
            {recorded
              ? <>Deduction recorded on {recordedOn}. {netFinal < 0 ? 'The final pay is now lower than what was deducted: undo and record again.' : 'The loans below show it in their ledger.'}</>
              : <><b>{employee.name.split(/\s+/)[0]} still owes {peso(round2(deducted + stillOwed))}.</b> Record the deduction when this final pay is released; until then the loans stay open.</>}
          </span>
          {recorded
            ? <Btn size="sm" variant="outline" loading={busy} onClick={() => setConfirm('undo')}>Undo</Btn>
            : <Btn size="sm" variant="amber" loading={busy} disabled={loading || busy} onClick={() => setConfirm('record')}>Record deduction</Btn>}
        </div>
      )}

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
          <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: loanLines.length ? T.ink : T.brand, fontSize: loanLines.length ? 17 : 20 }}>{peso(total)}</span>
        </div>

        {loanLines.length > 0 && (
          <>
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
              <div className="text-sm font-bold mb-1.5" style={{ fontFamily: F_HEAD, color: T.ink }}>d. Less: Loans and Cash Advances</div>
              {loanLines.map(x => <Row key={x.id} label={lineLabel(x.l)} value={`-${peso(x.amount)}`} />)}
              <Row label="Total deducted" value={`-${peso(deducted)}`} bold />
              {stillOwed > 0.004 && (
                <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: '#7A4B12' }}>
                  Still owed after this final pay: {peso(stillOwed)} (not covered by the final pay; stays on record).
                </div>
              )}
            </div>
            <div className="flex justify-between items-baseline px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
              <span className="font-bold" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 15 }}>NET FINAL PAY TO RECEIVE:</span>
              <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: T.brand, fontSize: 20 }}>{peso(Math.max(0, netFinal))}</span>
            </div>
          </>
        )}

        <div className="px-6 pt-8 pb-6">
          <div className="text-xs mb-6" style={{ fontFamily: F_BODY, color: T.soft }}>Conforme:</div>
          <div className="w-64"><div className="h-px mb-1.5" style={{ backgroundColor: T.ink }} /><div className="text-xs" style={{ fontFamily: F_BODY, color: T.ink, fontWeight: 700 }}>{employee.name}</div></div>
        </div>
      </Panel>

      <Confirm open={confirm === 'record'} onCancel={() => setConfirm(null)} onConfirm={() => send('POST')} busy={busy}
        title="Record the final pay deduction?"
        message={`This deducts ${peso(deducted)} from ${employee.name}'s final pay (cash advances first, then loans) and writes it to the loans' ledger.`
          + (stillOwed > 0.004 ? ` ${peso(stillOwed)} is more than the final pay can cover and stays owed.` : ' Everything owed is paid off.')
          + ' Record it when the final pay is released. You can undo it if the figures change.'}
        confirmLabel="Record deduction" />
      <Confirm open={confirm === 'undo'} onCancel={() => setConfirm(null)} onConfirm={() => send('DELETE')} busy={busy}
        title="Undo the final pay deduction?"
        message="This removes the final pay deduction from the loans' ledger and restores the balances, so it can be recorded again with the corrected final pay."
        confirmLabel="Undo" />
    </div>
  );
};