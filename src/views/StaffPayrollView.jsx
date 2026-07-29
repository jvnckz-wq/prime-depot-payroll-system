'use client';

import React, { useState, useEffect } from 'react';
import { Users, Wallet, ArrowLeft, Printer, Eye } from 'lucide-react';
import { Av, Badge, Btn, Confirm, Eyebrow, H1, Money, Panel, StatCard, Td, Th } from '../components/ui.jsx';
import { computePagIBIG, computeStaffPayroll, loanBalance } from '../lib/payroll';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const StaffPayrollView = ({ staff, loans, reloadLoans, statutory, toast, cutoffLabel = '' }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('current');
  const [confirmApply, setConfirmApply] = useState(false);

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

  const rows = staff.map(e => ({ emp: e, calc: computeStaffPayroll(e, loans, statutory, attById[e.id]) }));
  const totalGross = rows.reduce((s, r) => s + r.calc.totalEarnings, 0);
  const totalNet = rows.reduce((s, r) => s + r.calc.net, 0);

  // Loans belonging to staff (matched by name) that still owe something and aren't paused —
  // these are the ones "Apply Cutoff Deductions" will actually touch.
  const dueLoans = loans.filter(l => staff.some(s => s.name === l.person) && !l.paused && loanBalance(l) > 0);
  const dueTotal = dueLoans.reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const applyDeductions = async () => {
    setConfirmApply(false);
    // Per-cutoff run key: applying the same cutoff again is a no-op server-side.
    const runKey = `staff-${cutoffLabel}`;
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

  if (view === 'slip' && selectedId) {
    const e = staff.find(s => s.id === selectedId);
    const calc = computeStaffPayroll(e, loans, statutory, attById[selectedId]);
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>
            <ArrowLeft size={14} /> Back to Payroll
          </button>
          <Btn variant="outline" icon={Printer} onClick={() => window.print()}>Print</Btn>
        </div>

        <style>{`
          @media print {
            body * { visibility: hidden; }
            #staff-payslip, #staff-payslip * { visibility: visible; }
            #staff-payslip { position: absolute; left: 0; top: 0; width: 100%; }
            #staff-payslip .no-print { display: none !important; }
          }
        `}</style>

        <Panel id="staff-payslip" className="max-w-md overflow-hidden">
          {/* Centered brand letterhead — matches the approved payslip reference */}
          <div className="px-6 pt-6 pb-4 text-center" style={{ borderBottom: `2px solid ${T.brand}` }}>
            <div className="font-bold" style={{ fontFamily: F_HEAD, color: T.brand, fontSize: 22, letterSpacing: '0.02em' }}>PRIME DEPOT HARDWARE</div>
            <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.ink, letterSpacing: '0.04em' }}>TILES, PAINTS &amp; CONSTRUCTION SUPPLY</div>
            <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft, letterSpacing: '0.08em' }}>BRGY. P. NIOGAN, MABINI, BATANGAS</div>
          </div>

          {/* Cut-off / Name / Position */}
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            {[['Salary Cut-Off:', cutoffLabel], ["Employee's Name:", e.name], ['Position:', e.position]].map(([l, v], i) => (
              <div key={i} className="flex gap-2 text-sm py-0.5" style={{ fontFamily: F_BODY }}>
                <span style={{ color: T.soft }}>{l}</span>
                <span className="font-bold" style={{ color: T.ink }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Basic rate / days present / gross */}
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

          {/* Additions */}
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm italic mb-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Additions</div>
            {[['Overtime Pay (Weekdays):', calc.otWeekday], ['Overtime Pay (Weekends):', calc.otWeekend], ['Other Allowances:', calc.allowance]].map(([l, v], i) => (
              <div key={i} className="flex justify-between text-sm py-1" style={{ fontFamily: F_BODY }}>
                <span style={{ color: T.ink }}>{l}</span>
                <Money value={v} />
              </div>
            ))}
          </div>

          {/* Deductions — labelled exactly as the client's payslip */}
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

          {/* Net salary */}
          <div className="flex justify-between items-baseline px-6 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span className="font-bold" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 16 }}>NET SALARY:</span>
            <span className="font-bold tabular-nums" style={{ fontFamily: F_MONO, color: T.brand, fontSize: 20 }}>{peso(calc.net)}</span>
          </div>
          <div className="px-6 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Remarks: 0 Day/s out 5 Days of Paid Leave used</span>
          </div>

          <div className="grid grid-cols-2 gap-8 px-6 py-6 no-print">
            {["Employee's signature / Date", 'Authorized by / Date'].map(l => (
              <div key={l}><div className="h-px mb-1.5" style={{ backgroundColor: T.line }} /><div className="text-xs text-center" style={{ fontFamily: F_BODY, color: T.soft }}>{l}</div></div>
            ))}
          </div>
        </Panel>
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
                <Btn size="sm" variant="outline" icon={Wallet} disabled={dueLoans.length === 0} onClick={() => setConfirmApply(true)}>Apply Cutoff Deductions</Btn>
              </div>
            </div>
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th right>Days</Th><Th right>Gross</Th><Th right>OT</Th><Th right>Deductions</Th><Th right>Net Pay</Th><Th>Payslip</Th></tr></thead>
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
                    <Td right mono>{calc.days}</Td>
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
          <table className="w-full">
            <thead><tr><Th>Cut-off Period</Th><Th right>Employees</Th><Th right>Total Gross</Th><Th right>Total Net</Th><Th>Status</Th></tr></thead>
            <tbody>
              {[['May 1–15, 2026', staff.length, totalGross, totalNet], ['Apr 16–30, 2026', staff.length, totalGross * 0.97, totalNet * 0.97], ['Apr 1–15, 2026', staff.length - 1, totalGross * 0.9, totalNet * 0.9]].map(([period, count, g, n], i) => (
                <tr key={i}>
                  <Td><b>{period}</b></Td><Td right mono>{count}</Td><Td right mono>{peso(g)}</Td><Td right mono>{peso(n)}</Td>
                  <Td><Badge tone="green">Finalized</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply cutoff deductions?"
        message={`This will deduct ${peso(dueTotal)} total across ${dueLoans.length} active loan(s) for the ${cutoffLabel} cutoff, each logged with today's date on the Loans & Advances page. This can't be undone from here.`}
        confirmLabel="Apply Deductions" />
    </div>
  );
};

/* ============================= LOANS ============================= */
