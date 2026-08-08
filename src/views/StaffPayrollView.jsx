'use client';

import React, { useState, useEffect } from 'react';
import { Users, Wallet, ArrowLeft, Printer, Eye, Lock } from 'lucide-react';
import { Av, Badge, Btn, Confirm, Eyebrow, H1, Modal, Money, Panel, StatCard, Td, Th } from '../components/ui.jsx';
import { computePagIBIG, computeStaffPayroll, loanBalance } from '../lib/payroll';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, F_SERIF, T } from '../theme';

// One payslip, reused by the single-print view and the batch "Print All" run so
// the two never drift. Renders the client's exact approved layout.
const PayslipCard = ({ e, calc, cutoffLabel, attPeriod, statutory, className = 'max-w-md', ...rest }) => (
  <Panel className={`${className} overflow-hidden`} {...rest}>
    <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: `2px solid ${T.brand}` }}>
      <div className="font-bold" style={{ fontFamily: F_SERIF, color: T.brand, fontSize: 22, letterSpacing: '0.02em' }}>PRIME DEPOT HARDWARE</div>
      <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.ink, letterSpacing: '0.04em' }}>TILES, PAINTS &amp; CONSTRUCTION SUPPLY</div>
      <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft, letterSpacing: '0.08em' }}>BRGY. P. NIOGAN, MABINI, BATANGAS</div>
    </div>
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      {[['Salary Cut-Off:', cutoffLabel], ["Employee's Name:", e.name], ['Position:', e.position]].map(([l, v], i) => (
        <div key={i} className="flex gap-2 text-sm py-0.5" style={{ fontFamily: F_BODY }}>
          <span style={{ color: T.soft }}>{l}</span>
          <span className="font-bold" style={{ color: T.ink }}>{v}</span>
        </div>
      ))}
    </div>
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="mb-2 text-xs" style={{ fontFamily: F_BODY }}>
        {calc.hasAttendance
          ? <span style={{ color: T.green }}>Days present, tardiness, and OT from imported attendance{attPeriod ? ` (${attPeriod.start} → ${attPeriod.end})` : ''}.</span>
          : <span style={{ color: T.amber }}>⚠ No attendance imported for this person — figures are an estimate ({calc.days} days assumed).</span>}
      </div>
      {[['Basic Rate (Daily):', peso(e.rate)], ['Days Present:', String(calc.days)], ['Gross Salary:', peso(calc.gross)]].map(([l, v], i) => (
        <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
          <span style={{ color: T.ink }}>{l}</span>
          <span className="tabular-nums" style={{ fontFamily: F_MONO, color: T.ink, fontWeight: i === 2 ? 700 : 400 }}>{v}</span>
        </div>
      ))}
    </div>
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="text-sm italic mb-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Additions</div>
      {[['Overtime Pay (Weekdays):', calc.otWeekday], ['Overtime Pay (Weekends):', calc.otWeekend], ['Other Allowances:', calc.allowance]].map(([l, v], i) => (
        <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
          <span style={{ color: T.ink }}>{l}</span>
          <Money value={v} />
        </div>
      ))}
    </div>
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="text-sm italic mb-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Deductions</div>
      {[
        ['HDMF MP1 Contribution:', e.piOn ? computePagIBIG(e.declaredSalary, statutory.pagibig) : 0, false],
        ['HDMF MP2 Contribution:', e.piOn ? (e.mp2 || 0) : 0, false],
        ['PHIC Contribution:', calc.phic, false],
        ['SSS Contribution:', calc.sss, false],
        ['Loans:', 0, false],
        ['Adjustments: Advance Payment', calc.advance, false],
        ['Tardiness:', calc.tardiness, true],
      ].map(([l, v, danger], i) => (
        <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
          <span className={danger ? 'font-bold' : ''} style={{ color: danger ? T.brand : T.ink }}>{l}</span>
          <span className="tabular-nums" style={{ fontFamily: F_MONO, color: danger ? T.brand : T.ink, fontWeight: danger ? 700 : 400 }}>{peso(v)}</span>
        </div>
      ))}
    </div>
    <div className="flex justify-between items-baseline px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <span className="font-bold" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 16 }}>NET SALARY:</span>
      <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: T.brand, fontSize: 20 }}>{peso(calc.net)}</span>
    </div>
    <div className="px-6 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
      <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Remarks: 0 Day/s out 5 Days of Paid Leave used</span>
    </div>
    <div className="grid grid-cols-2 gap-8 px-6 py-6">
      {["Employee's signature / Date", 'Authorized by / Date'].map(l => (
        <div key={l}><div className="h-px mb-1.5" style={{ backgroundColor: T.line }} /><div className="text-xs text-center" style={{ fontFamily: F_BODY, color: T.soft }}>{l}</div></div>
      ))}
    </div>
  </Panel>
);

export const StaffPayrollView = ({ staff, loans, reloadLoans, statutory, toast, cutoffLabel = '', reloadStaff }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('current');
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmUnfinalize, setConfirmUnfinalize] = useState(null);
  const [viewPeriod, setViewPeriod] = useState(null);
  const [viewPeriodLoading, setViewPeriodLoading] = useState(false);
  // Locked read-only view of a released cut-off's stored payslips.
  const openPeriod = async (p) => {
    setViewPeriod({ period: p, payslips: [] });
    setViewPeriodLoading(true);
    try {
      const res = await fetch(`/api/payroll/history?periodId=${encodeURIComponent(p.id)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      setViewPeriod({ period: d.period || p, payslips: d.payslips || [] });
    } catch (err) {
      console.error('Could not load cut-off:', err);
      toast('Could not load that cut-off.', 'error');
    } finally {
      setViewPeriodLoading(false);
    }
  };
  // Other Allowances is edited on the payslip and SAVED to the employee record,
  // so it persists across refreshes and shows everywhere (Dashboard, payslip,
  // snapshot, Finalize). allowanceEdits holds the in-progress text before Save.
  const [allowanceEdits, setAllowanceEdits] = useState({});
  const [savingAllowance, setSavingAllowance] = useState(false);
  // One key per cutoff, used to tag/read this cutoff's loan deductions so the
  // preview, the payslip, Apply Deductions, and Finalize all agree.
  const cutoffKey = `staff-${cutoffLabel}`;
  const [printAll, setPrintAll] = useState(false);
  useEffect(() => {
    if (!printAll) return;
    // Wait for the batch container to render, print, then tear it back down.
    const t = setTimeout(() => { window.print(); setPrintAll(false); }, 150);
    return () => clearTimeout(t);
  }, [printAll]);

  // Days Present, Tardiness, and Overtime come from the latest imported
  // attendance. Keyed by employee id (= biometric User ID).
  const [attById, setAttById] = useState({});
  const [attPeriod, setAttPeriod] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/attendance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => {
        if (cancelled) return;
        const map = {};
        for (const s of d.summaries || []) map[s.id] = s;
        setAttById(map);
        setAttPeriod(d.period || null);
      })
      .catch(err => console.error('Could not load attendance for payroll:', err));
    return () => { cancelled = true; };
  }, []);

  // Released cut-offs for the History tab — real stored snapshots, not estimates.
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/payroll/history');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      setHistory(d.periods || []);
    } catch (err) {
      console.error('Could not load payroll history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
  useEffect(() => { loadHistory(); }, []);

  const unfinalize = async (p) => {
    setConfirmUnfinalize(null);
    if (!p) return;
    try {
      const res = await fetch('/api/payroll/finalize', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: p.start, end: p.end }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not un-finalize.', 'error'); return; }
      toast(`Un-finalized ${p.label}` + (data.loanEntriesReversed ? ` — ${data.loanEntriesReversed} loan deduction(s) reversed.` : '.'));
      await loadHistory();
      await reloadLoans();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  // Persist the payslip's Other Allowances onto the employee record so it sticks
  // across refreshes and flows into the Dashboard, the snapshot, and Finalize.
  const saveAllowance = async (e) => {
    const val = parseFloat(allowanceEdits[e.id]);
    if (!Number.isFinite(val) || val < 0) { toast('Enter an allowance of zero or more.', 'error'); return; }
    setSavingAllowance(true);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(e.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowance: val }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the allowance.', 'error'); return; }
      toast(`Saved ${e.name}'s allowance.`);
      setAllowanceEdits(o => { const n = { ...o }; delete n[e.id]; return n; });
      if (reloadStaff) await reloadStaff();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setSavingAllowance(false);
    }
  };

  // A ₱0 daily rate means no salary is set yet, so that person isn't part of
  // this payroll run — keep them out of the list, the totals, and the snapshot.
  const rows = staff.filter(e => Number(e.rate) > 0).map(e => ({ emp: e, calc: computeStaffPayroll(e, loans, statutory, attById[e.id], cutoffKey) }));
  const totalGross = rows.reduce((s, r) => s + r.calc.gross, 0);
  const totalNet = rows.reduce((s, r) => s + r.calc.net, 0);

  // Loans belonging to staff (matched by name) that still owe something and aren't paused —
  // these are the ones "Apply Cutoff Deductions" will actually touch.
  const dueLoans = loans.filter(l => staff.some(s => s.name === l.person) && !l.paused && loanBalance(l) > 0);
  const dueTotal = dueLoans.reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const applyDeductions = async () => {
    setConfirmApply(false);
    // Per-cutoff run key: applying the same cutoff again is a no-op server-side.
    const runKey = cutoffKey;
    try {
      const res = await fetch('/api/loans/apply-deductions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'staff', runKey }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not apply deductions.', 'error'); return; }
      if (data.applied === 0) {
        toast(data.skipped ? `Deductions were already applied for the ${cutoffLabel} cutoff.` : 'No staff loans were due.');
      } else {
        toast(`Applied ${peso(data.total)} across ${data.applied} loan(s).`);
      }
      await reloadLoans();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  // Finalize / Release: freeze every staff payslip for this cutoff as a snapshot
  // and apply the loan deductions in one step. What's on screen is exactly what
  // gets stored — the figures never move afterward, even if rates change later.
  const finalize = async () => {
    setConfirmFinalize(false);
    if (!attPeriod) { toast("Import this cutoff's attendance before finalizing.", 'error'); return; }
    setFinalizing(true);
    const payslips = rows.map(({ emp: e, calc }) => {
      const mp2Ded = e.piOn ? (Number(e.mp2) || 0) : 0;
      return {
        employeeId: e.id,
        daysPresent: calc.days,
        basicPay: calc.gross,
        overtimeWeekday: calc.otWeekday,
        overtimeWeekend: calc.otWeekend,
        allowances: calc.allowance,
        grossPay: calc.gross,
        sssDeduction: calc.sss,
        philhealthDeduction: calc.phic,
        pagibigDeduction: Math.max(0, calc.hdmf - mp2Ded),
        mp2Deduction: mp2Ded,
        tardinessDeduction: calc.tardiness,
        loanDeduction: calc.advance,
        totalDeductions: calc.totalDeductions,
        netPay: calc.net,
      };
    });
    try {
      const res = await fetch('/api/payroll/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: attPeriod.start, end: attPeriod.end, label: cutoffLabel, payslips }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not finalize the cutoff.', 'error'); return; }
      toast(`Released ${cutoffLabel} — ${data.payslips} payslip(s) snapshotted` + (data.loans?.total ? `, ${peso(data.loans.total)} in loans deducted.` : '.'));
      await reloadLoans();
      await loadHistory();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  if (view === 'slip' && selectedId) {
    const e = staff.find(s => s.id === selectedId);
    const savedAllow = Number(e.allowance) || 0;
    const allowStr = allowanceEdits[e.id] !== undefined ? allowanceEdits[e.id] : String(savedAllow);
    const effAllow = parseFloat(allowStr) || 0;
    const allowDirty = allowanceEdits[e.id] !== undefined && effAllow !== savedAllow;
    const calc = computeStaffPayroll({ ...e, allowance: effAllow }, loans, statutory, attById[selectedId], cutoffKey);
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>
            <ArrowLeft size={14} /> Back to Payroll
          </button>
          <Btn variant="outline" icon={Printer} onClick={() => window.print()}>Print</Btn>
        </div>

        <div className="no-print mb-4 flex items-center flex-wrap gap-3 p-3 rounded" style={{ backgroundColor: T.bg, border: `1px solid ${T.line}` }}>
          <span className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>Other allowances</span>
          <div className="flex items-center gap-1">
            <span className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>₱</span>
            <input type="number" value={allowStr}
              onChange={ev => setAllowanceEdits(o => ({ ...o, [e.id]: ev.target.value }))}
              className="px-2 py-1.5 rounded border text-sm w-32" style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink, backgroundColor: T.surface }} />
          </div>
          <Btn size="sm" disabled={!allowDirty || savingAllowance} onClick={() => saveAllowance(e)}>{savingAllowance ? 'Saving…' : 'Save'}</Btn>
          <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Saved to this employee and shown on every payslip. Edit here, press Save, then Finalize.</span>
        </div>

        <style>{`
          @media print {
            body * { visibility: hidden; }
            #staff-payslip, #staff-payslip * { visibility: visible; }
            #staff-payslip { position: absolute; left: 0; top: 0; width: 100%; }
            #staff-payslip .no-print { display: none !important; }
          }
        `}</style>

        <PayslipCard id="staff-payslip" e={e} calc={calc} cutoffLabel={cutoffLabel} attPeriod={attPeriod} statutory={statutory} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <H1 sub="Bi-monthly payroll, computed for each staff member from their current-cutoff attendance.">Staff Payroll</H1>

      <div className="flex gap-1 mb-4 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft, width: 'fit-content' }}>
        {[['current', 'Current Cutoff'], ['history', 'History']].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: subTab === k ? T.surface : 'transparent', color: subTab === k ? T.ink : T.soft }}>{l}</button>
        ))}
      </div>

      {subTab === 'current' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard label="Total Gross" value={peso(totalGross)} tone="blue" icon={Wallet} />
            <StatCard label="Total Net Pay" value={peso(totalNet)} tone="green" icon={Wallet} />
            <StatCard label="Employees Computed" value={staff.length} icon={Users} />
          </div>
          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Payslips — {cutoffLabel}</Eyebrow>
              <div className="flex items-center gap-2">
                <Badge tone={attPeriod ? 'green' : 'amber'}>{attPeriod ? `DTR ${attPeriod.start} → ${attPeriod.end}` : 'No attendance imported'}</Badge>
                <Btn size="sm" variant="outline" icon={Printer} disabled={rows.length === 0 || printAll} onClick={() => setPrintAll(true)}>{printAll ? 'Preparing…' : 'Print All Payslips'}</Btn>
                <Btn size="sm" variant="outline" icon={Wallet} disabled={dueLoans.length === 0} onClick={() => setConfirmApply(true)}>Apply Cutoff Deductions</Btn>
                <Btn size="sm" icon={Lock} loading={finalizing} disabled={!attPeriod || finalizing} onClick={() => setConfirmFinalize(true)}>{finalizing ? 'Finalizing…' : 'Finalize / Release'}</Btn>
              </div>
            </div>
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th center>Days</Th><Th right>Gross</Th><Th right>OT</Th><Th right>Deductions</Th><Th right>Net Pay</Th><Th>Payslip</Th></tr></thead>
              <tbody>
                {rows.map(({ emp, calc }) => (
                  <tr key={emp.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Av name={emp.name} size={28} />
                        <span className="font-semibold" style={{ fontFamily: F_BODY }}>{emp.name}</span>
                        {!calc.hasAttendance && <Badge tone="amber">no attendance</Badge>}
                      </div>
                    </Td>
                    <Td center mono>{calc.days}</Td>
                    <Td right mono>{peso(calc.gross)}</Td>
                    <Td right mono><span style={{ color: T.green, fontWeight: 600 }}>+{peso(calc.ot)}</span></Td>
                    <Td right mono><span style={{ color: T.red, fontWeight: 600 }}>-{peso(calc.totalDeductions)}</span></Td>
                    <Td right mono><b>{peso(calc.net)}</b></Td>
                    <Td><Btn size="sm" variant="outline" icon={Eye} onClick={() => { setSelectedId(emp.id); setView('slip'); }}>View</Btn></Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Td colSpan={2}><b>Totals</b></Td>
                  <Td right mono>{peso(rows.reduce((s, r) => s + r.calc.gross, 0))}</Td>
                  <Td /><Td />
                  <Td right mono><b style={{ color: T.amber }}>{peso(totalNet)}</b></Td>
                  <Td />
                </tr>
              </tfoot>
            </table>
          </Panel>
        </>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Released cut-offs</Eyebrow>
          </div>
          {historyLoading ? (
            <div className="p-4 text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>Loading…</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>No cut-offs have been finalized yet. Release one from the Current Cutoff tab.</div>
          ) : (
            <table className="w-full">
              <thead><tr><Th>Cut-off Period</Th><Th center>Employees</Th><Th right>Total Gross</Th><Th right>Total Net</Th><Th>Status</Th><Th></Th></tr></thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <Td><b>{p.label}</b></Td>
                    <Td center mono>{p.employees}</Td>
                    <Td right mono>{peso(p.totalGross)}</Td>
                    <Td right mono>{peso(p.totalNet)}</Td>
                    <Td><Badge tone="green">Released</Badge></Td>
                    <Td><div className="flex gap-1.5 justify-end"><Btn size="sm" variant="outline" icon={Eye} onClick={() => openPeriod(p)}>View</Btn><Btn size="sm" variant="outline" onClick={() => setConfirmUnfinalize(p)}>Un-finalize</Btn></div></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply cutoff deductions?"
        message={`This will deduct ${peso(dueTotal)} total across ${dueLoans.length} active loan(s) for the ${cutoffLabel} cutoff, each logged with today's date on the Loans & Advances page. This can't be undone from here.`}
        confirmLabel="Apply Deductions" />

      <Confirm open={confirmFinalize} onCancel={() => setConfirmFinalize(false)} onConfirm={finalize}
        title={`Finalize and release ${cutoffLabel}?`}
        message={`This snapshots all ${rows.length} staff payslip(s) for this cutoff (total net ${peso(totalNet)}) and applies their loan deductions. The figures are frozen once released — they won't change even if rates or records change later. You can un-finalize this cutoff from History if a correction is needed.`}
        confirmLabel="Finalize / Release" />

      <Confirm open={!!confirmUnfinalize} onCancel={() => setConfirmUnfinalize(null)} onConfirm={() => unfinalize(confirmUnfinalize)}
        title={confirmUnfinalize ? `Un-finalize ${confirmUnfinalize.label}?` : ''}
        message="This removes the released snapshot and reverses this cut-off's loan deductions, restoring the balances, so it can be recomputed and released again. Only do this to correct a mistake."
        confirmLabel="Un-finalize" />

      <Modal open={!!viewPeriod} onClose={() => setViewPeriod(null)} title={viewPeriod ? `Released — ${viewPeriod.period.label}` : ''} width={720}>
        {viewPeriod && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
              <Badge tone="green">Released</Badge>
              <Badge tone="amber">Locked — viewing only</Badge>
              <span>Snapshot figures — frozen at release.</span>
            </div>
            {viewPeriodLoading ? <div className="p-4 text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>Loading…</div>
              : viewPeriod.payslips.length === 0 ? <div className="p-6 text-center text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>No payslips in this cut-off.</div>
              : (
              <div className="overflow-x-auto" style={{ maxHeight: 420 }}>
                <table className="w-full">
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                    <tr><Th>Employee</Th><Th center>Days</Th><Th right>Gross</Th><Th right>Deductions</Th><Th right>Net Pay</Th></tr>
                  </thead>
                  <tbody>
                    {viewPeriod.payslips.map((p, i) => (
                      <tr key={i}>
                        <Td><div className="flex items-center gap-2.5"><Av name={p.name} size={26} /><span className="font-semibold text-sm" style={{ fontFamily: F_BODY }}>{p.name}</span></div></Td>
                        <Td center mono>{p.daysPresent}</Td>
                        <Td right mono>{peso(p.basicPay)}</Td>
                        <Td right mono>{p.totalDeductions > 0 ? `−${peso(p.totalDeductions)}` : peso(0)}</Td>
                        <Td right mono style={{ fontWeight: 700 }}>{peso(p.netPay)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot style={{ position: 'sticky', bottom: 0, backgroundColor: T.surface }}>
                    <tr><Td><b>Total</b></Td><Td /><Td right mono><b>{peso(viewPeriod.payslips.reduce((s, p) => s + p.basicPay, 0))}</b></Td><Td /><Td right mono><b>{peso(viewPeriod.payslips.reduce((s, p) => s + p.netPay, 0))}</b></Td></tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {printAll && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #staff-payslip-batch, #staff-payslip-batch * { visibility: visible; }
              #staff-payslip-batch { position: absolute !important; left: 0 !important; top: 0 !important; width: 100%; }
              #staff-payslip-batch .payslip-page { page-break-after: always; break-after: page; }
              #staff-payslip-batch .payslip-page:last-child { page-break-after: auto; break-after: auto; }
            }
          `}</style>
          <div id="staff-payslip-batch" style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
            {rows.map(({ emp, calc }) => (
              <div key={emp.id} className="payslip-page" style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <PayslipCard e={emp} calc={calc} cutoffLabel={cutoffLabel} attPeriod={attPeriod} statutory={statutory} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ============================= LOANS ============================= */
