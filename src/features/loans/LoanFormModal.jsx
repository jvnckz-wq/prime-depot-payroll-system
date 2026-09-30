'use client';

import React, { useMemo, useState } from 'react';
import { Btn, Field, Modal, SearchSelect, inputCls, inputStyle } from '@/components/ui.jsx';
import { LOAN_PURPOSES, balanceOf, isOpen, payoffPlan, shortDate } from '@/lib/loan-rules';
import { peso } from '@/lib/utils';
import { F_BODY, T } from '@/components/theme';
import { todayLocalYmd } from '@/features/loans/parts.jsx';
import { printLoanSlip } from '@/features/loans/loanSlip';

const Box = ({ tone, children }) => {
  const s = tone === 'warn'
    ? { backgroundColor: T.warnBg, border: '1px solid #EFD3A8', color: '#7A4B12' }
    : tone === 'ok' ? { backgroundColor: T.greenBg, color: T.green } : { backgroundColor: T.bg, color: T.ink };
  return <div className="rounded-lg px-3.5 py-3 text-sm" style={{ fontFamily: F_BODY, lineHeight: 1.45, ...s }}>{children}</div>;
};
const Line = ({ label, value, total }) => (
  <div className={`flex justify-between text-sm py-0.5 ${total ? 'font-bold mt-1 pt-1.5' : ''}`} style={{ fontFamily: F_BODY, borderTop: total ? `1px solid ${T.line}` : undefined }}>
    <span>{label}</span><span className="tabular-nums">{value}</span>
  </div>
);

const labelOf = (e) => `${e.name} · ${e.position}`;

export const LoanFormModal = ({ open, onClose, staff = [], loans = [], presetEmployeeId = null, onSaved, toast }) => {
  const people = useMemo(() => staff.filter((e) => e.status !== 'Inactive'), [staff]);
  const byLabel = useMemo(() => new Map(people.map((e) => [labelOf(e), e])), [people]);

  const [empId, setEmpId] = useState(presetEmployeeId);
  const [purpose, setPurpose] = useState(LOAN_PURPOSES[0]);
  const [amount, setAmount] = useState('');
  const [per, setPer] = useState('');
  const [date, setDate] = useState(todayLocalYmd());
  const [busy, setBusy] = useState(false);

  const emp = people.find((e) => e.id === empId) || null;
  const active = emp ? loans.find((l) => l.kind === 'LOAN' && l.employeeId === emp.id && isOpen(l)) : null;
  const topUp = !!active;
  const unit = emp?.crew ? 'day' : 'cutoff';
  const balance = active ? balanceOf(active) : 0;
  const perValue = per === '' && active ? String(active.perCutoff) : per;

  const amt = Number(amount);
  const perNum = Number(perValue);
  const newBalance = topUp ? balance + (amt > 0 ? amt : 0) : (amt > 0 ? amt : 0);
  const plan = amt > 0 && perNum > 0 ? payoffPlan(newBalance, perNum, date) : null;

  let problem = '';
  if (!emp) problem = 'Choose the employee.';
  else if (!(amt > 0)) problem = 'Enter an amount.';
  else if (!(perNum > 0)) problem = `Enter the deduction per ${unit}.`;
  else if (perNum > newBalance) problem = `The deduction per ${unit} cannot be more than the ${topUp ? 'new balance' : 'loan'}.`;

  const save = async (withSlip = false) => {
    if (problem) { toast(problem, 'error'); return; }
    setBusy(true);
    try {
      const res = topUp
        ? await fetch(`/api/loans/${active.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topUp: { amount: amt, date, perCutoff: perNum } }),
        })
        : await fetch('/api/loans', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId: emp.id, kind: 'LOAN', purpose, principal: amt, perCutoff: perNum, date }),
        });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the loan.', 'error'); return; }
      toast(topUp ? `Added ${peso(amt)} to ${emp.name}'s loan.` : `Loan saved for ${emp.name}.`);
      if (withSlip) {
        printLoanSlip({
          kind: topUp ? 'TOPUP' : 'LOAN', name: emp.name, position: emp.position, employeeId: emp.id, crew: !!emp.crew,
          date, amount: amt, purpose: topUp ? active.purpose : purpose, perRun: perNum,
          previousBalance: balance, newBalance, plan, ref: data.loan?.id || active?.id || '',
        });
      }
      onSaved?.();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally { setBusy(false); }
  };

  const planText = !plan ? null
    : emp?.crew
      ? <>Paid off in about <b>{plan.count} working day{plan.count === 1 ? '' : 's'}</b> at {peso(perNum)} a day.</>
      : topUp
        ? <>Paid off in <b>{plan.count} cutoff{plan.count === 1 ? '' : 's'}</b> at {peso(perNum)}, last deduction {shortDate(plan.last, true)}.</>
        : plan.count === 1
          ? <>Paid off in <b>1 cutoff</b>: deducted on {shortDate(plan.first, true)}.</>
          : <>Paid off in <b>{plan.count} cutoffs</b>: first deduction {shortDate(plan.first)}, last deduction {shortDate(plan.last, true)}.</>;

  return (
    <Modal open={open} onClose={onClose} title={topUp ? 'Top-up Loan' : 'New Loan'} width={540}>
      <div className="space-y-3.5">
        <Field label="Employee">
          <SearchSelect value={emp ? labelOf(emp) : ''} placeholder="Start typing a name…"
            options={people.map(labelOf)}
            onChange={(label) => { const e = byLabel.get(label); setEmpId(e ? e.id : null); setPer(''); }} />
        </Field>

        {topUp && (
          <Box tone="warn">
            {emp.name} already has an active loan (<b>{active.purpose}</b>, balance <b>{peso(balance)}</b>). This amount will be added to it. One loan per employee.
          </Box>
        )}

        {!topUp && (
          <Field label="Purpose">
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} style={inputStyle}>
              {LOAN_PURPOSES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={topUp ? 'Additional amount (₱)' : 'Amount (₱)'}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label={`Deduction per ${unit} (₱)`}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={perValue} onChange={(e) => setPer(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </div>

        <Field label="Date given">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>

        {topUp && (
          <Box>
            <Line label="Current balance" value={peso(balance)} />
            <Line label="Top-up" value={`+${peso(amt > 0 ? amt : 0)}`} />
            <Line label="New balance" value={peso(newBalance)} total />
          </Box>
        )}

        {planText && <Box tone="ok">{planText}</Box>}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="outline" onClick={() => save(true)} disabled={busy || !!problem}>Save &amp; print slip</Btn>
          <Btn variant="amber" onClick={() => save(false)} loading={busy} disabled={busy || !!problem}>{topUp ? 'Add to loan' : 'Save loan'}</Btn>
        </div>
      </div>
    </Modal>
  );
};