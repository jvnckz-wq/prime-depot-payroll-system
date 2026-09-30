'use client';

import React, { useState, useEffect } from 'react';
import { Users, Wallet, ArrowLeft } from 'lucide-react';
import { Av, Badge, Btn, Confirm, Eyebrow, H1, Modal, Money, Panel, SkeletonBlock, SkeletonRows, StatCard, Td, Th } from '@/components/ui.jsx';
import { computeStaffPayroll } from '@/lib/payroll';
import { cutoffOf, nextCutoff, planDeductions, shortDate, staffRunKey } from '@/lib/loan-rules';
import { currentCutoffPeriod, peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, F_SERIF, T } from '@/components/theme';

const loanNote = (calc, kind, nextEnd) => {
  const lines = (calc.deductionLines || []).filter((d) => d.kind === kind);
  if (!lines.length) return null;
  const short = lines.reduce((s, d) => s + (d.shortfall || 0), 0);
  const moved = short > 0.004 ? `${peso(short)} short, moves to the ${shortDate(nextEnd)} payroll` : '';
  let text;
  if (kind === 'CASH_ADVANCE') {
    text = lines.length === 1 ? `Cash advance given ${shortDate(lines[0].dateGranted, true)}` : `${lines.length} cash advances this cutoff`;
  } else {
    text = `${lines[0].purpose || 'Loan'} · balance after this cutoff ${peso(Math.max(0, lines[0].balanceAfter))}`;
  }
  return moved ? `${text} · ${moved}` : text;
};

const shortNames = (short) => {
  const named = short.slice(0, 3).map((x) => `${x.person} (${peso(x.unpaid)})`).join(', ');
  return short.length > 3 ? `${named} and ${short.length - 3} more` : named;
};

const PayslipCard = ({ e, calc, cutoffLabel, attPeriod, att, statutory, className = 'max-w-md', ...rest }) => {
  const nextEnd = nextCutoff(cutoffOf(attPeriod?.start || currentCutoffPeriod().start).end).end;
  return (
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
      {/* Attendance basis — the exact record behind Days Present, Tardiness and
          OT, so a payslip can be traced to its source at a glance. */}
      {calc.hasAttendance && att && (
        <div className="mb-2 px-2.5 py-1.5 rounded text-xs" style={{ backgroundColor: T.bg, fontFamily: F_MONO, color: T.soft }}>
          Present {att.present}{att.leave ? ` · Leave ${att.leave}` : ''} · Late {att.daysLate}d/{Math.round(att.lateMins || 0)}min · OT {Math.round(att.otWeekdayMins || 0)}min wkdy / {Math.round(att.otWeekendMins || 0)}min wknd
        </div>
      )}
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
      {/* Only when the pay could not cover the government contributions: the
          company pays the difference for this cutoff (Phase 3 assumption). */}
      {calc.companyCover > 0 && (
        <div className="flex justify-between gap-3 text-sm py-1" style={{ fontFamily: F_BODY }}>
          <span style={{ color: T.ink }}>
            Covered by Company:
            <span className="block text-xs" style={{ color: T.soft }}>Contributions were more than this cutoff&apos;s pay</span>
          </span>
          <Money value={calc.companyCover} />
        </div>
      )}
    </div>
    <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="text-sm italic mb-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Deductions</div>
      {[
        ['HDMF MP1 Contribution:', calc.mp1 ?? 0, false],
        // MP2 is voluntary savings: on a short payslip it is only what fits.
        ['HDMF MP2 Contribution:', calc.mp2 ?? 0, false, e.piOn && (Number(e.mp2) || 0) > (calc.mp2 ?? 0) + 0.004 ? `Not enough pay this cutoff for the full ${peso(Number(e.mp2) || 0)}` : null],
        ['PHIC Contribution:', calc.phic, false],
        ['SSS Contribution:', calc.sss, false],
        // Loans and cash advances on their own lines, as on the client's own
        // payslip, each with a short note so the employee can see what it is.
        ['Loans:', calc.loanDeduction ?? 0, false, loanNote(calc, 'LOAN', nextEnd)],
        ['Adjustments: Advance Payment', calc.advanceDeduction ?? calc.advance, false, loanNote(calc, 'CASH_ADVANCE', nextEnd)],
        ['Tardiness:', calc.tardiness, true, calc.tardinessDue > calc.tardiness + 0.004 ? `${peso(calc.tardinessDue - calc.tardiness)} not deducted: no pay left` : null],
      ].map(([l, v, danger, sub], i) => (
        <div key={i} className="flex justify-between gap-3 text-sm py-1" style={{ fontFamily: F_BODY }}>
          <span className={danger ? 'font-bold' : ''} style={{ color: danger ? T.brand : T.ink }}>
            {l}
            {sub && <span className="block text-xs" style={{ color: T.soft, fontWeight: 400 }}>{sub}</span>}
          </span>
          <span className="tabular-nums" style={{ fontFamily: F_MONO, color: danger ? T.brand : T.ink, fontWeight: danger ? 700 : 400 }}>{peso(v)}</span>
        </div>
      ))}
    </div>
    <div className="flex justify-between items-baseline px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
      <span className="font-bold" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 16 }}>NET SALARY:</span>
      <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: T.brand, fontSize: 20 }}>{peso(calc.net)}</span>
    </div>
    <div className="px-6 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
      <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Remarks: {calc.leaveDays || 0} day/s of Paid Leave this cut-off · {e.leaveCredits ?? 5} credit/s per year</span>
    </div>
    <div className="grid grid-cols-2 gap-8 px-6 py-6">
      {["Employee's signature / Date", 'Authorized by / Date'].map(l => (
        <div key={l}><div className="h-px mb-1.5" style={{ backgroundColor: T.line }} /><div className="text-xs text-center" style={{ fontFamily: F_BODY, color: T.soft }}>{l}</div></div>
      ))}
    </div>
  </Panel>
  );
};

export const StaffPayrollView = ({ staff, loans, reloadLoans, statutory, toast, cutoffLabel = '', reloadStaff, loading = false, navView }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState(navView || 'current');
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmUnfinalize, setConfirmUnfinalize] = useState(null);
  const [unfinalizing, setUnfinalizing] = useState(false);
  const [viewPeriod, setViewPeriod] = useState(null);
  const [viewPeriodLoading, setViewPeriodLoading] = useState(false);
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
  const [allowanceEdits, setAllowanceEdits] = useState({});
  const [savingAllowance, setSavingAllowance] = useState(false);
  const [attById, setAttById] = useState({});
  const [attPeriod, setAttPeriod] = useState(null);
  const cutoffKey = staffRunKey(attPeriod?.start || currentCutoffPeriod().start);
  const [printAll, setPrintAll] = useState(false);
  useEffect(() => {
    if (!printAll) return;
    const t = setTimeout(() => { window.print(); setPrintAll(false); }, 150);
    return () => clearTimeout(t);
  }, [printAll]);

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
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { if (navView) setSubTab(navView); }, [navView]);

  const unfinalize = async (p) => {
    if (!p) return;
    setUnfinalizing(true);
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
    } finally {
      setUnfinalizing(false);
      setConfirmUnfinalize(null);
    }
  };

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

  const rows = staff.filter(e => Number(e.rate) > 0).map(e => ({ emp: e, calc: computeStaffPayroll(e, loans, statutory, attById[e.id], cutoffKey), att: attById[e.id] || null })).filter(r => r.calc.hasAttendance);
  const totalGross = rows.reduce((s, r) => s + r.calc.gross, 0);
  const totalNet = rows.reduce((s, r) => s + r.calc.net, 0);

  const cutoffEnd = cutoffOf(attPeriod?.start || currentCutoffPeriod().start).end;
  const nextEnd = nextCutoff(cutoffEnd).end;
  const plan = attPeriod
    ? planDeductions(loans, {
      crew: false, runKey: cutoffKey, endYmd: cutoffEnd,
      available: new Map(rows.map(r => [r.emp.id, Math.max(0, computeStaffPayroll(r.emp, [], statutory, r.att).net)])),
    })
    : null;
  const pending = plan ? plan.writes : [];
  const applyDeductions = async () => {
    setConfirmApply(false);
    if (!attPeriod) { toast("Import this cutoff's attendance first.", 'error'); return; }
    try {
      const res = await fetch('/api/loans/apply-deductions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'staff', start: attPeriod.start, end: attPeriod.end }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not apply deductions.', 'error'); return; }
      if (data.applied === 0 && !(data.short || []).length) {
        toast(data.skipped ? `Deductions were already applied for the ${cutoffLabel} cutoff.` : 'No staff loans were due.');
      } else {
        toast(`Applied ${peso(data.total)} across ${data.applied} loan(s)`
          + (data.unpaidTotal > 0 ? `; ${peso(data.unpaidTotal)} carried over to the ${shortDate(nextEnd)} payroll.` : '.'));
      }
      await reloadLoans();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  const finalize = async () => {
    setConfirmFinalize(false);
    if (!attPeriod) { toast("Import this cutoff's attendance before finalizing.", 'error'); return; }
    setFinalizing(true);
    const payslips = rows.map(({ emp: e, calc }) => {
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
        pagibigDeduction: calc.mp1,
        mp2Deduction: calc.mp2,
        companyCover: calc.companyCover,
        tardinessDeduction: calc.tardiness,
        loanDeduction: calc.loanDeduction,
        advanceDeduction: calc.advanceDeduction,
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
      toast(`Released ${cutoffLabel}: ${data.payslips} payslip(s) snapshotted`
        + (data.loans?.total ? `, ${peso(data.loans.total)} in loans deducted` : '')
        + (data.loans?.unpaidTotal > 0 ? `, ${peso(data.loans.unpaidTotal)} carried over.` : '.'));
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
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>
            <ArrowLeft size={14} /> Back to Payroll
          </button>
          <Btn variant="outline" onClick={() => window.print()}>Print</Btn>
        </div>

        <div className="no-print mb-4 flex items-center flex-wrap gap-3 p-3 rounded" style={{ backgroundColor: T.bg, border: `1px solid ${T.line}` }}>
          <span className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>Other allowances</span>
          <div className="flex items-center gap-1">
            <span className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>₱</span>
            <input type="number" value={allowStr}
              onChange={ev => setAllowanceEdits(o => ({ ...o, [e.id]: ev.target.value }))}
              className="px-2 py-1.5 rounded border text-sm w-32" style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink, backgroundColor: T.surface }} />
          </div>
          <Btn size="sm" loading={savingAllowance} disabled={!allowDirty || savingAllowance} onClick={() => saveAllowance(e)}>{savingAllowance ? 'Saving…' : 'Save'}</Btn>
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

        <PayslipCard id="staff-payslip" e={e} calc={calc} cutoffLabel={cutoffLabel} attPeriod={attPeriod} att={attById[selectedId]} statutory={statutory} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <H1 sub="Bi-monthly payroll, computed for each staff member from their current-cutoff attendance.">Staff Payroll</H1>

      {subTab === 'current' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-5">
            <StatCard compact label="Total Gross" value={peso(totalGross)} tone="blue" icon={Wallet} />
            <StatCard compact label="Total Net Pay" value={peso(totalNet)} tone="green" icon={Wallet} />
            <StatCard compact label="Employees Computed" value={rows.length} icon={Users} />
          </div>
          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Payslips — {cutoffLabel}</Eyebrow>
              {/* Phone: the DTR range on its own line and one full-width button
                  per row, so none of the money buttons has its label broken
                  into pieces. From sm up: one row, as before. */}
              <div className="grid grid-cols-1 gap-2 w-full sm:flex sm:items-center sm:w-auto">
                <Badge tone={attPeriod ? 'green' : 'amber'}>{attPeriod ? `DTR ${attPeriod.start} → ${attPeriod.end}` : 'No attendance imported'}</Badge>
                <Btn size="sm" fullMobile variant="outline" disabled={rows.length === 0 || printAll} onClick={() => setPrintAll(true)}>{printAll ? 'Preparing…' : 'Print All Payslips'}</Btn>
                <Btn size="sm" fullMobile variant="outline" disabled={pending.length === 0} onClick={() => setConfirmApply(true)}>Apply Cutoff Deductions</Btn>
                <Btn size="sm" fullMobile loading={finalizing} disabled={!attPeriod || finalizing} onClick={() => setConfirmFinalize(true)}>{finalizing ? 'Finalizing…' : 'Finalize / Release'}</Btn>
              </div>
            </div>
            {/* Phone: one card per payslip, Net Pay first. Tapping the card
                opens the payslip, the same as View. */}
            <div className="md:hidden">
              {loading ? <SkeletonBlock /> : rows.map(({ emp, calc }) => (
                <button key={emp.id} type="button" onClick={() => { setSelectedId(emp.id); setView('slip'); }}
                  className="pd-clickable w-full text-left px-4 py-3 flex items-center gap-3"
                  style={{ borderBottom: `1px solid ${T.lineSoft}`, fontFamily: F_BODY }}>
                  <Av name={emp.name} size={32} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate" style={{ color: T.ink }}>{emp.name}</span>
                    <span className="block text-xs pd-num" style={{ color: T.soft }}>
                      <span className="whitespace-nowrap">{calc.days} days</span>{' · '}
                      <span className="whitespace-nowrap">gross {peso(calc.gross)}</span>
                      {calc.ot > 0 && <>{' · '}<span className="whitespace-nowrap">OT +{peso(calc.ot)}</span></>}
                    </span>
                    <span className="block text-xs pd-num" style={{ color: T.red }}>Deductions -{peso(calc.totalDeductions)}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-xs" style={{ color: T.soft }}>Net pay</span>
                    <span className="block font-bold pd-num whitespace-nowrap" style={{ fontFamily: F_MONO, color: T.ink }}>{peso(calc.net)}</span>
                  </span>
                </button>
              ))}
              {!loading && rows.length > 0 && (
                <div className="px-4 py-3 flex justify-between text-sm" style={{ fontFamily: F_BODY }}>
                  <b>Total net</b><b className="pd-num" style={{ fontFamily: F_MONO, color: T.amber }}>{peso(totalNet)}</b>
                </div>
              )}
            </div>
            <div className="hidden md:block overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead><tr><Th>Employee</Th><Th center>Days</Th><Th right>Gross</Th><Th right>OT</Th><Th right>Deductions</Th><Th right>Net Pay</Th><Th>Payslip</Th></tr></thead>
              <tbody>
                {loading ? <SkeletonRows cols={7} rows={5} /> : rows.map(({ emp, calc }) => (
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
                    <Td><Btn size="sm" variant="outline" onClick={() => { setSelectedId(emp.id); setView('slip'); }}>View</Btn></Td>
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
            </table></div>
          </Panel>
        </>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Released cut-offs</Eyebrow>
          </div>
          {historyLoading ? (
            <SkeletonBlock avatar={false} />
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>No cut-offs have been finalized yet. Release one from Staff Payroll.</div>
          ) : (
            <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead><tr><Th>Cut-off Period</Th><Th center>Employees</Th><Th right>Total Gross</Th><Th right>Total Net</Th><Th>Status</Th><Th></Th></tr></thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <Td><b>{p.label}</b></Td>
                    <Td center mono>{p.employees}</Td>
                    <Td right mono>{peso(p.totalGross)}</Td>
                    <Td right mono>{peso(p.totalNet)}</Td>
                    <Td><Badge tone="green">Released</Badge></Td>
                    <Td><div className="flex gap-1.5 justify-end"><Btn size="sm" variant="outline" onClick={() => openPeriod(p)}>View</Btn><Btn size="sm" variant="outline" onClick={() => setConfirmUnfinalize(p)}>Un-finalize</Btn></div></Td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Panel>
      )}

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply cutoff deductions?"
        message={plan ? `This will deduct ${peso(plan.total)} across ${plan.applied} loan(s) and cash advance(s) for the ${cutoffLabel} cutoff.`
          + (plan.short.length
            ? ` ${plan.short.length} can't be covered in full by this cutoff's pay: ${shortNames(plan.short)}. Net pay stops at ₱0.00, and the unpaid part carries over to the ${shortDate(nextEnd)} payroll.`
            : '')
          + " This can't be undone from here." : ''}
        confirmLabel="Apply Deductions" />

      <Confirm open={confirmFinalize} onCancel={() => setConfirmFinalize(false)} onConfirm={finalize}
        title={`Finalize and release ${cutoffLabel}?`}
        message={`This snapshots all ${rows.length} staff payslip(s) for this cutoff and applies their loan deductions.`
          + (plan && plan.total > 0 ? ` It also takes ${peso(plan.total)} in deductions not applied yet, so the total net released will be ${peso(totalNet - plan.total)}.` : ` Total net ${peso(totalNet)}.`)
          + (plan && plan.short.length ? ` ${plan.short.length} will carry over to the ${shortDate(nextEnd)} payroll: ${shortNames(plan.short)}.` : '')
          + " The figures are frozen once released, even if rates or records change later. You can un-finalize this cutoff from History if a correction is needed."}
        confirmLabel="Finalize / Release" />

      <Confirm open={!!confirmUnfinalize} onCancel={() => setConfirmUnfinalize(null)} onConfirm={() => unfinalize(confirmUnfinalize)} busy={unfinalizing}
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
            {viewPeriodLoading ? <SkeletonBlock avatar={false} />
              : viewPeriod.payslips.length === 0 ? <div className="p-6 text-center text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>No payslips in this cut-off.</div>
              : (
              <div className="overflow-x-auto pd-scroll-shadow" style={{ maxHeight: 420 }}>
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
            {rows.map(({ emp, calc, att }) => (
              <div key={emp.id} className="payslip-page" style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <PayslipCard e={emp} calc={calc} cutoffLabel={cutoffLabel} attPeriod={attPeriod} att={att} statutory={statutory} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};