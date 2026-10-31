'use client';
// Crew Payroll screen: each driver, helper and daily staff member's pay for one day, with printable payslips.

import React, { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { DayBar } from '@/features/deliveries/DayBar.jsx';
import { useDeliveryDay } from '@/features/deliveries/useDeliveryDay';
import { Avatar, Badge, Btn, Confirm, EmptyState, Eyebrow, H1, Modal, Panel, Td, Th } from '@/components/ui';
import { CREW_RATE_FALLBACK } from '@/lib/constants';
import { crewDayPay, crewEarnings, dailyContributionFor, loanBalance } from '@/lib/payroll';
import { grantedBy, planDeductions, todayYmdManila } from '@/lib/loan-rules';
import { round2 } from '@/lib/money';
import { peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';

export const CrewPayrollView = ({ deliveries, crewRates = CREW_RATE_FALLBACK, loans, reloadLoans, toast }) => {
  const [confirmApply, setConfirmApply] = useState(false);
  const [slipPerson, setSlipPerson] = useState(null);

  const todayYmd = todayYmdManila();
  const dueLoans = loans.filter(l => l.isCrew && !l.paused && !l.settled && loanBalance(l) > 0
    && grantedBy(l, todayYmd) && !l.entries.some(en => en.payslipId === 'crew-' + todayYmd));
  const applyDeductions = async () => {
    setConfirmApply(false);
    const runKey = 'crew-' + todayYmd;
    try {
      const res = await fetch('/api/loans/apply-deductions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'crew', runKey }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not apply deductions.', 'error'); return; }
      const notTaken = (data.short || []).length;
      if (data.applied === 0 && !notTaken) {
        toast(data.skipped ? 'Deductions were already applied for today.' : 'No crew loans were due.');
      } else {
        toast(`Applied ${peso(data.total)} across ${data.applied} loan(s)`
          + (notTaken ? `; ${notTaken} with too little pay today will run a day longer.` : '.'));
      }
      await reloadLoans();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  const { viewDate, histLoading, D, readOnly, loadHistory } = useDeliveryDay(deliveries, toast);

  const [dailyStaff, setDailyStaff] = useState([]);
  const dailyDate = viewDate || todayYmdManila();
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/payroll/daily?date=${dailyDate}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => { if (!cancelled) setDailyStaff((data.staff || []).map(d => ({ ...d, key: d.id }))); })
      .catch(err => { if (!cancelled) setDailyStaff([]); console.error('Could not load daily attendance:', err); });
    return () => { cancelled = true; };
  }, [dailyDate]);

  const todayStr = todayYmdManila();
  const dayDate = viewDate || todayStr;

  const loanDeductionsFor = (p) => {
    const runKey = 'crew-' + dayDate;
    return (loans || [])
      .filter(l => l.isCrew && (p.id ? l.employeeId === p.id : l.person === p.name))
      .reduce((s, l) => s + (l.entries || [])
        .filter(en => en.type === 'deduction' && en.payslipId === runKey)
        .reduce((a, en) => a + (en.amount || 0), 0), 0);
  };
  const contributionByName = new Map(dailyStaff.filter(d => d.contribution).map(d => [d.key, d.contribution]));
  const dayPeople = crewDayPay(crewEarnings(D, crewRates), dailyStaff).map(p => {
    const deductions = round2(loanDeductionsFor(p));
    const c = contributionByName.get(p.key);
    const contribution = c ? dailyContributionFor(c, p.payable) : 0;
    const month = c ? { collected: round2(c.collectedBefore + contribution), share: c.shareTotal } : null;
    return { ...p, deductions, contribution, month, net: round2(p.payable - contribution - deductions) };
  });

  const byId = (a, b) => (Number(a.id) || Infinity) - (Number(b.id) || Infinity) || a.name.localeCompare(b.name);
  const earnedToday = new Map(dayPeople.map(p => [p.key, round2(p.payable - p.contribution)]));
  const crewLoans = loans.filter(l => l.isCrew);
  const crewPlan = viewDate ? null : planDeductions(crewLoans, {
    crew: true, runKey: 'crew-' + todayYmd, endYmd: todayYmd,
    available: new Map(crewLoans.filter(l => earnedToday.has(l.employeeId)).map(l => [l.employeeId, earnedToday.get(l.employeeId)])),
  });
  const crewShortText = crewPlan && crewPlan.short.length
    ? ` Not enough pay today, so nothing extra is taken and the loan runs a day longer: ${crewPlan.short
      .map(x => (x.amount > 0 ? `${x.person} (only ${peso(x.amount)} earned)` : `${x.person} (no trips)`)).join(', ')}.`
    : '';

  const personLinesAll = (p) => {
    const lines = [];
    Object.entries(D).forEach(([truckId, log]) => {
      let cur = null; const trips = [];
      (log.items || []).forEach(it => {
        if (it.seq) { cur = { seq: it.seq, driver: it.driver || null, helpers: it.helpers || [], crew: it.crew || [], items: [] }; trips.push(cur); }
        if (cur && !it.voided) cur.items.push(it);
      });
      trips.forEach(t => {
        const ids = t.crew.filter(c => c && c.id);
        const isDriver = ids.length ? ids.some(c => c.role === 'Driver' && c.id === p.id) : t.driver === p.name;
        const isHelper = ids.length ? ids.some(c => c.role !== 'Driver' && c.id === p.id) : t.helpers.includes(p.name);
        if (p.role === 'Driver') {
          if (isDriver) t.items.forEach(it => lines.push({ truckId, seq: t.seq, item: it.item, qty: it.qty, unit: it.unit, isDouble: it.isDouble, amt: it.driverAmount }));
        } else if (isHelper) {
          const n = t.helpers.length || 1;
          t.items.forEach(it => lines.push({ truckId, seq: t.seq, item: it.item, qty: it.qty, unit: it.unit, isDouble: it.isDouble, amt: it.helperAmount / n }));
        }
      });
    });
    const order = new Map();
    lines.forEach(l => { const k = `${l.truckId}|${l.seq}`; if (!order.has(k)) order.set(k, order.size + 1); l.trip = order.get(k); });
    return lines;
  };

  return (
    <div className="p-4 sm:p-6">
      <H1
        action={readOnly ? null : <div className="flex items-center gap-2">
          <Btn variant="outline" disabled={dueLoans.length === 0} onClick={() => setConfirmApply(true)}>Apply Today&apos;s Deductions</Btn>
        </div>}>Crew Payroll</H1>

      <DayBar todayStr={todayStr} viewDate={viewDate} readOnly={readOnly} histLoading={histLoading} loadHistory={loadHistory} />

      {dayPeople.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Eyebrow>Per-Person Payslips</Eyebrow>
          </div>
          <Panel className="overflow-hidden hidden md:block">
            <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead><tr><Th>ID</Th><Th>Employee</Th><Th center>Trips</Th><Th right>Gross Pay</Th><Th right>Deductions</Th><Th right>Net Pay</Th><Th right>Payslip</Th></tr></thead>
              <tbody>
                {[...dayPeople].sort(byId).map(p => {
                  const totalDeductions = round2((p.late || 0) + (p.contribution || 0) + (p.deductions || 0));
                  return (
                    <tr key={p.key}>
                      <Td mono>{p.id || '--'}</Td>
                      <Td><span className="font-semibold" style={{ fontFamily: F_BODY }}>{p.name}</span></Td>
                      <Td center mono>{p.attendanceDaily ? '--' : p.trips}</Td>
                      <Td right mono>{peso(p.total)}</Td>
                      <Td right mono><span style={{ color: T.red, fontWeight: 600 }}>-{peso(totalDeductions)}</span></Td>
                      <Td right mono><b>{peso(p.net)}</b></Td>
                      <Td right><Btn size="sm" variant="outline" onClick={() => setSlipPerson(p)}>View</Btn></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </Panel>
          <Panel className="overflow-hidden md:hidden">
            {dayPeople.map((p, pi) => (
              <button key={p.key} onClick={() => setSlipPerson(p)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                style={{ borderTop: pi ? `1px solid ${T.line}` : undefined }}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} size={32} tone={p.role === 'Driver' ? T.amber : T.brand} />
                  <div>
                    <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>{p.name}</div>
                    <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
                      {p.role} · {p.attendanceDaily ? 'present' : `${p.trips} trip${p.trips === 1 ? '' : 's'}`}
                      {p.lateMins > 0 && <span style={{ color: T.brand }}> · {p.lateMins} minute{p.lateMins === 1 ? '' : 's'} late</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span style={{ fontFamily: F_MONO, color: T.green, fontWeight: 700 }}>{peso(p.net)}</span>
                  <span className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.brand }}><Printer size={12} /> View / Print</span>
                </div>
              </button>
            ))}
          </Panel>
        </div>
      )}

      {dayPeople.length === 0 && (
        <Panel className="overflow-hidden"><EmptyState title="No crew pay for this day" desc="Crew payslips appear here once deliveries are logged or daily staff time in for the day." /></Panel>
      )}

      <Modal open={!!slipPerson} onClose={() => setSlipPerson(null)} title={`Payslip: ${slipPerson?.name || ''}`} width={600}>
        {slipPerson && (() => {
          const p = slipPerson;
          const lines = personLinesAll(p);
          return (
            <>
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  #person-slip, #person-slip * { visibility: visible; }
                  #person-slip { position: absolute; left: 0; top: 0; width: 100%; }
                  #person-slip .no-print { display: none !important; }
                }
              `}</style>
              <div className="flex justify-end mb-3 no-print">
                <Btn variant="outline" size="sm" onClick={() => window.print()}>Print this payslip</Btn>
              </div>
              <div id="person-slip">
                <Panel className="overflow-hidden">
                  <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: T.ink }}>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo from /public on a printable payslip; next/image adds no value here */}
                      <img src="/logo.png" alt="Prime Depot" className="w-9 h-9 rounded bg-white p-1 object-contain shrink-0" />
                      <div>
                        <div className="text-white font-bold text-sm" style={{ fontFamily: F_HEAD }}>{p.name}</div>
                        <div className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>{p.role} · {dayDate}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs" style={{ color: T.soft, fontFamily: F_HEAD }}>NET SALARY</div>
                      <div className="text-white font-bold" style={{ fontFamily: F_MONO, fontSize: 18 }}>{peso(p.net)}</div>
                    </div>
                  </div>
                  {!p.attendanceDaily && <div className="overflow-x-auto pd-scroll-shadow">
                    <table className="w-full" style={{ fontSize: 12 }}>
                      <thead><tr><Th>Trip</Th><Th>Item</Th><Th center>Quantity</Th><Th>Unit</Th><Th>Double</Th><Th right>Amount</Th></tr></thead>
                      <tbody>
                        {lines.map((l, li) => (
                          <tr key={li}>
                            <Td mono>{l.trip}</Td>
                            <Td>{l.item}</Td>
                            <Td center mono>{l.qty}</Td>
                            <Td>{l.unit}</Td>
                            <Td>{l.isDouble && <Badge tone="amber">DOUBLE</Badge>}</Td>
                            <Td right mono>{peso(l.amt)}</Td>
                          </tr>
                        ))}
                        {!lines.length && <tr><Td colSpan={6}><span style={{ color: T.soft }}>No piece-rate trips.</span></Td></tr>}
                      </tbody>
                    </table>
                  </div>}
                  <div className="px-6 py-4" style={{ borderTop: `1px dashed ${T.line}`, backgroundColor: T.bg }}>
                    <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full" style={{ fontFamily: F_MONO, fontSize: 13 }}>
                      <tbody>
                        <tr><Td style={{ fontFamily: F_HEAD, color: T.soft }}>Daily rate</Td><Td right mono>{peso(p.dailyRate)}</Td></tr>
                        {!p.attendanceDaily && <tr><Td style={{ fontFamily: F_HEAD, color: T.soft }}>Piece rate</Td><Td right mono>{peso(p.pieceRate)}</Td></tr>}
                        {!p.attendanceDaily && <tr><Td style={{ fontFamily: F_HEAD, color: T.soft }}>Trip bonus</Td><Td right mono style={{ color: p.bonus ? T.green : undefined }}>{p.bonus ? `+${peso(p.bonus)}` : peso(0)}</Td></tr>}
                        <tr><Td style={{ fontFamily: F_HEAD, color: T.soft }}>Late</Td><Td right mono style={{ color: p.late ? T.red : undefined }}>{p.late ? `-${peso(p.late)}` : peso(0)}</Td></tr>
                        <tr><Td style={{ fontFamily: F_HEAD, color: T.soft }}>Deductions</Td><Td right mono style={{ color: p.deductions ? T.red : undefined }}>{p.deductions ? `-${peso(p.deductions)}` : peso(0)}</Td></tr>
                        <tr style={{ borderTop: `1px solid ${T.line}` }}><Td style={{ fontFamily: F_HEAD, color: T.ink }}><b>NET SALARY</b></Td><Td right mono><b style={{ color: T.brand }}>{peso(p.net)}</b></Td></tr>
                      </tbody>
                    </table></div>
                  </div>
                  <div className="px-6 py-6">
                    <div className="h-px mb-1.5" style={{ backgroundColor: T.line, maxWidth: 260 }} />
                    <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>{p.name}, Signature / Date</div>
                  </div>
                </Panel>
              </div>
            </>
          );
        })()}
      </Modal>

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply today's deductions?"
        message={crewPlan
          ? `Press this after the day's last trip is logged: it takes from what each person earned today. It will deduct ${peso(crewPlan.total)} across ${crewPlan.applied} loan(s).${crewShortText} This can't be undone from here.`
          : ''}
        confirmLabel="Apply Deductions" />
    </div>
  );
};
