'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Btn, Field, Modal, SearchSelect, inputCls, inputStyle } from '@/components/ui.jsx';
import { LOAN_MAX_BALANCE, LOAN_PURPOSES, balanceOf, isOpen, loanRoomLeft, payoffPlan, shortDate } from '@/lib/loan-rules';
import { peso } from '@/lib/utils';
import { F_BODY, T } from '@/components/theme';
import { todayLocalYmd } from '@/features/loans/parts.jsx';

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
  const people = useMemo(() => {
    const active = staff.filter((e) => e.status !== 'Inactive');
    if (presetEmployeeId) return active.filter((e) => e.id === presetEmployeeId);
    const withLoan = new Set(loans.filter((l) => l.kind === 'LOAN' && isOpen(l)).map((l) => l.employeeId));
    return active.filter((e) => !withLoan.has(e.id));
  }, [staff, loans, presetEmployeeId]);
  const byLabel = useMemo(() => new Map(people.map((e) => [labelOf(e), e])), [people]);
  const savingRef = useRef(false);

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
  const room = topUp ? loanRoomLeft(balance) : LOAN_MAX_BALANCE;
  const overLimit = amt > room + 0.004;
  const newBalance = topUp ? balance + (amt > 0 ? amt : 0) : (amt > 0 ? amt : 0);
  const plan = amt > 0 && perNum > 0 && !overLimit ? payoffPlan(newBalance, perNum, date) : null;

  let problem = '';
  if (!emp) problem = 'Choose the employee.';
  else if (!(amt > 0)) problem = 'Enter an amount.';
  else if (overLimit) problem = topUp
    ? `A loan balance can be at most ${peso(LOAN_MAX_BALANCE)}. At most ${peso(room)} can be added.`
    : `A loan can be at most ${peso(LOAN_MAX_BALANCE)}.`;
  else if (!(perNum > 0)) problem = `Enter the deduction per ${unit}.`;
  else if (perNum > newBalance) problem = `The deduction per ${unit} cannot be more than the ${topUp ? 'new balance' : 'loan'}.`;

  const save = async () => {
    if (problem) { toast(problem, 'error'); return; }
    if (savingRef.current) return;
    savingRef.current = true;
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
      onSaved?.();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally { savingRef.current = false; setBusy(false); }
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
            options={people.map(labelOf)} disabled={!!presetEmployeeId}
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
            <div className="relative">
              <input type="number" min="0" max={room} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                className={inputCls} style={{ ...inputStyle, borderColor: overLimit ? T.brand : T.line, paddingRight: 132 }} aria-invalid={overLimit || undefined} />
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: T.soft }}>max {peso(room)}</span>
            </div>
          </Field>
          <Field label={`Deduction per ${unit} (₱)`}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={perValue} onChange={(e) => setPer(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </div>

        <Field label="Date given">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>

        {topUp && !overLimit && (
          <Box>
            <Line label="Current balance" value={peso(balance)} />
            <Line label="Top-up" value={`+${peso(amt > 0 ? amt : 0)}`} />
            <Line label="New balance" value={peso(newBalance)} total />
          </Box>
        )}

        {overLimit && (
          <div role="alert" className="rounded-lg px-3.5 py-3 text-sm" style={{ backgroundColor: T.brandBg, color: T.brand, fontFamily: F_BODY, lineHeight: 1.45 }}>
            <b>Over the limit.</b> {problem}
          </div>
        )}

        {planText && <Box tone="ok">{planText}</Box>}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="amber" onClick={save} loading={busy} disabled={busy || !!problem}>{topUp ? 'Add to loan' : 'Save loan'}</Btn>
        </div>
      </div>
    </Modal>
  );
};