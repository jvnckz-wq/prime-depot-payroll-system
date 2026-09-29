'use client';

// Cash Advances: grouped by cutoff, staff only, taken in full on that cutoff's
// payroll. The form shows the hard limit (projected gross) and warns when the
// advance is more than the estimated take-home, before anyone presses Save.

import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Btn, EmptyState, Field, H1, Modal, SearchSelect, inputCls, inputStyle } from '@/components/ui.jsx';
import {
  advancedInCutoff, balanceOf, cutoffOf, dueFor, grantedBy, isOpen, nextCutoff, periodLabel, prevCutoff, projectedGross,
  shortDate, shortPeriod, workingDaysIn,
} from '@/lib/loan-rules';
import { computeStaffPayroll } from '@/lib/payroll';
import { peso } from '@/lib/utils';
import { F_BODY, F_MONO, T } from '@/components/theme';
import { D, H, Kpi, Person, Pill, todayLocalYmd } from '@/features/loans/parts.jsx';
import { printLoanSlip } from '@/features/loans/loanSlip';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const labelOf = (e) => `${e.name} · ${e.position}`;

const AdvanceModal = ({ onClose, staff, loans, statutory, onSaved, toast }) => {
  const people = useMemo(() => staff.filter((e) => !e.crew && e.status !== 'Inactive' && Number(e.rate) > 0), [staff]);
  const byLabel = useMemo(() => new Map(people.map((e) => [labelOf(e), e])), [people]);
  const [empId, setEmpId] = useState(null);
  const [date, setDate] = useState(todayLocalYmd());
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const emp = people.find((e) => e.id === empId) || null;
  const period = cutoffOf(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLocalYmd());
  const days = workingDaysIn(period);
  const limit = emp ? projectedGross(emp.rate, period) : 0;
  const already = emp ? advancedInCutoff(loans, emp.id, period) : 0;
  const room = round2(Math.max(0, limit - already));
  const amt = Number(amount);
  const over = emp && amt > room + 0.004;

  // Estimated take-home if they work every working day of the cutoff: pay
  // after contributions, minus everything else this cutoff's payroll will take
  // (the loan installment with any carry-over, advances already given, and
  // advances carried in from an earlier cutoff). Uses the same
  // computeStaffPayroll as the payslip. Cheap, so recomputed on every render.
  let estimate = null;
  if (emp && statutory?.sss) {
    const base = computeStaffPayroll(emp, [], statutory, { present: days, leave: 0, lateMins: 0, otWeekdayMins: 0, otWeekendMins: 0 }).net;
    const loan = loans.find((l) => l.kind === 'LOAN' && l.employeeId === emp.id && isOpen(l) && !l.paused && grantedBy(l, period.end));
    const installment = loan ? dueFor(loan, { endYmd: period.end }) : 0;
    const carriedIn = round2(loans
      .filter((l) => l.kind === 'CASH_ADVANCE' && l.employeeId === emp.id && isOpen(l) && l.dateGranted && l.dateGranted < period.start)
      .reduce((s2, l) => s2 + balanceOf(l), 0));
    estimate = { takeHome: round2(base - installment - already - carriedIn), installment, carriedIn };
  }
  // What the payroll could not cover moves to the next cutoff (rule e). Counted
  // in total, since the advance is taken before the loan installment.
  const short = estimate && amt > 0 && !over ? round2(Math.max(0, amt - estimate.takeHome)) : 0;
  const after = shortPeriod(nextCutoff(period.end));
  const first = emp ? emp.name.split(/\s+/)[0] : '';

  let problem = '';
  if (!emp) problem = 'Choose the employee.';
  else if (!(amt > 0)) problem = 'Enter an amount.';
  else if (over) problem = `Over the limit. At most ${peso(room)} can be advanced for ${periodLabel(period)}.`;

  // withSlip: save, then print the acknowledgment the employee signs.
  const save = async (withSlip = false) => {
    if (problem) { toast(problem, 'error'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id, kind: 'CASH_ADVANCE', principal: amt, date }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the cash advance.', 'error'); return; }
      toast(`Cash advance of ${peso(amt)} saved for ${emp.name}.`);
      if (withSlip) {
        printLoanSlip({
          kind: 'CASH_ADVANCE', name: emp.name, position: emp.position, employeeId: emp.id,
          date, amount: amt, deductOn: period.end, ref: data.loan?.id || '',
        });
      }
      onSaved?.();
    } catch { toast('Could not reach the server.', 'error'); } finally { setBusy(false); }
  };

  const row = (l, v, bold) => (
    <div className={`flex justify-between gap-3 text-sm py-0.5 ${bold ? 'font-bold mt-1 pt-1.5' : ''}`} style={{ borderTop: bold ? `1px solid ${T.line}` : undefined }}>
      <span>{l}</span><span className="tabular-nums whitespace-nowrap">{v}</span>
    </div>
  );

  return (
    <Modal open onClose={onClose} title="New Cash Advance" width={560}>
      <div className="space-y-3.5" style={{ fontFamily: F_BODY }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Employee">
            <SearchSelect value={emp ? labelOf(emp) : ''} placeholder="Start typing a name…" options={people.map(labelOf)}
              onChange={(label) => { const e = byLabel.get(label); setEmpId(e ? e.id : null); }} />
          </Field>
          <Field label="Date given">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </div>

        {emp && (
          <div className="rounded-lg px-3.5 py-3" style={{ backgroundColor: T.bg, color: T.ink }}>
            {row(`Projected gross, ${periodLabel(period)} (${days} working days × ${peso(emp.rate)})`, peso(limit))}
            {row('Already advanced this cutoff', peso(already))}
            {row('Available to advance', peso(room), true)}
          </div>
        )}

        <Field label="Amount (₱)">
          <div className="relative">
            <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              className={inputCls} style={{ ...inputStyle, borderColor: over ? T.brand : T.line, paddingRight: 120 }} aria-invalid={over || undefined} />
            {emp && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.soft }}>max {peso(room)}</span>}
          </div>
        </Field>

        {over && (
          <div className="rounded-lg px-3.5 py-3 text-sm" style={{ backgroundColor: T.brandBg, color: T.brand, lineHeight: 1.45 }}>
            <b>Over the limit.</b> A cash advance cannot be more than the projected gross pay for the cutoff. At most <b>{peso(room)}</b> can be advanced.
          </div>
        )}

        {short > 0 && (
          <div className="rounded-lg px-3.5 py-3 text-sm" style={{ backgroundColor: T.warnBg, border: '1px solid #EFD3A8', color: '#7A4B12', lineHeight: 1.45 }}>
            <b>Heads up:</b> {first}&apos;s estimated take-home is <b>{peso(Math.max(0, estimate.takeHome))}</b> after contributions
            {estimate.installment > 0 ? ' and the loan installment' : ''}{already > 0 || estimate.carriedIn > 0 ? ' and earlier advances' : ''}, if {first} works every remaining day.
            {' '}<b>{peso(short)}</b> will carry over to the {after} cutoff.
          </div>
        )}

        <div className="text-xs" style={{ color: T.soft }}>Deducted in full on the {shortDate(period.end)} payroll. Cash advances cannot be paused.</div>

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="outline" onClick={() => save(true)} disabled={busy || !!problem}>Save &amp; print slip</Btn>
          <Btn variant="amber" onClick={() => save(false)} loading={busy} disabled={busy || !!problem}>Save advance</Btn>
        </div>
      </div>
    </Modal>
  );
};

export const CashAdvancesPage = ({ staff, loans, reloadLoans, statutory, period: current, toast }) => {
  const advances = useMemo(() => loans.filter((l) => l.kind === 'CASH_ADVANCE' && l.dateGranted), [loans]);
  const [adding, setAdding] = useState(false);

  // Cutoffs to pick from: the current one plus every cutoff that has an advance.
  const options = useMemo(() => {
    const m = new Map([[current.start, current]]);
    for (const l of advances) { const p = cutoffOf(l.dateGranted); m.set(p.start, p); }
    return [...m.values()].sort((a, b) => b.start.localeCompare(a.start));
  }, [advances, current]);
  const [pick, setPick] = useState(current.start);
  const period = options.find((p) => p.start === pick) || current;

  const inCutoff = advances
    .filter((l) => l.dateGranted >= period.start && l.dateGranted <= period.end)
    .sort((a, b) => a.dateGranted.localeCompare(b.dateGranted) || a.person.localeCompare(b.person));
  const staffById = new Map(staff.map((e) => [e.id, e]));
  const total = inCutoff.reduce((s, l) => s + l.principal, 0);
  const people = new Set(inCutoff.map((l) => l.employeeId)).size;
  // Advances from earlier cutoffs that a short payslip left open (rule e).
  // They are due in full on this cutoff's payroll.
  const earlier = advances.filter((l) => l.dateGranted < period.start && isOpen(l));
  const earlierTotal = earlier.reduce((s, l) => s + balanceOf(l), 0);
  const prev = shortPeriod(prevCutoff(period.start));

  return (
    <div className="p-4 sm:p-6">
      <H1 action={
        <div className="flex gap-2.5 flex-wrap">
          <select value={period.start} onChange={(e) => setPick(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 'auto' }} aria-label="Cutoff">
            {options.map((p) => <option key={p.start} value={p.start}>Cutoff: {periodLabel(p)}</option>)}
          </select>
          <Btn variant="amber" icon={Plus} onClick={() => setAdding(true)}>New Cash Advance</Btn>
        </div>
      }>Cash Advances</H1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3.5 mb-4">
        <Kpi label="Advanced this cutoff" value={peso(total)} sub={`${people} employee${people === 1 ? '' : 's'}`} />
        <Kpi label="Deducted in full on" value={`${shortDate(period.end)} payroll`} sub="Staff only · crew are paid daily" />
        <Kpi label={`Carried over from ${prev}`} value={peso(earlierTotal)}
          sub={earlier.length ? `${earlier.length} advance${earlier.length === 1 ? '' : 's'} due on ${shortDate(period.end)}` : 'No short payslips last cutoff'} />
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: T.surface, borderColor: T.line }}>
        {inCutoff.length === 0 ? (
          <EmptyState title={`No cash advances for ${periodLabel(period)}`} desc="Advances given in this cutoff are deducted in full on its payroll." />
        ) : (
          <>
          {/* Phone: one card per advance (who, when, how much, status). */}
          <div className="md:hidden">
            {inCutoff.map((l) => {
              const bal = balanceOf(l);
              const paid = !isOpen(l);
              const partly = !paid && l.entries.some((en) => en.type === 'deduction' && en.payslipId);
              const emp = staffById.get(l.employeeId);
              const limit = emp ? projectedGross(emp.rate, period) : null;
              const room = limit == null ? null : round2(limit - advancedInCutoff(advances, l.employeeId, period));
              return (
                <div key={l.id} className="px-3.5 py-3" style={{ borderBottom: `1px solid ${T.lineSoft}`, fontFamily: F_BODY }}>
                  <div className="flex items-start justify-between gap-2">
                    <Person name={l.person} role={l.role} />
                    <span className="font-bold pd-num whitespace-nowrap" style={{ fontFamily: F_MONO, color: T.ink }}>{peso(l.principal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs" style={{ color: T.soft }}>
                    <span>Given {shortDate(l.dateGranted, true)}{room == null ? '' : ` · room left ${peso(Math.max(0, room))}`}</span>
                    {paid ? <Pill tone="green">Deducted</Pill>
                      : partly ? <Pill tone="amber">{peso(bal)} carried over</Pill>
                        : <Pill tone="slate">To deduct {shortDate(period.end)}</Pill>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr><H>Employee</H><H>Date given</H><H right>Amount</H><H right>Limit (projected gross)</H><H right>Room left</H><H>Status</H></tr></thead>
              <tbody>
                {inCutoff.map((l) => {
                  const emp = staffById.get(l.employeeId);
                  const limit = emp ? projectedGross(emp.rate, period) : null;
                  const room = limit == null ? null : round2(limit - advancedInCutoff(advances, l.employeeId, period));
                  const bal = balanceOf(l);
                  const paid = !isOpen(l);
                  // A payroll already ran on it and could not take all of it
                  // (even P0): the rest moved to the next cutoff.
                  const partly = !paid && l.entries.some((en) => en.type === 'deduction' && en.payslipId);
                  return (
                    <tr key={l.id}>
                      <D><Person name={l.person} role={l.role} /></D>
                      <D style={{ whiteSpace: 'nowrap' }}>{shortDate(l.dateGranted, true)}</D>
                      <D right style={{ fontFamily: F_MONO, fontWeight: 700 }}>{peso(l.principal)}</D>
                      <D right style={{ fontFamily: F_MONO }}>{limit == null ? 'n/a' : peso(limit)}</D>
                      <D right style={{ fontFamily: F_MONO }}>{room == null ? 'n/a' : peso(Math.max(0, room))}</D>
                      <D>
                        {paid ? <Pill tone="green">Deducted</Pill>
                          : partly ? <Pill tone="amber">{peso(bal)} carried over</Pill>
                            : <Pill tone="slate">To deduct {shortDate(period.end)}</Pill>}
                      </D>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {adding && (
        <AdvanceModal onClose={() => setAdding(false)} staff={staff} loans={loans} statutory={statutory} toast={toast}
          onSaved={async () => { setAdding(false); await reloadLoans(); }} />
      )}
    </div>
  );
};
