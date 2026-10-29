'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Btn, Field, Modal, SearchSelect, inputCls, inputStyle } from '@/components/ui.jsx';
import { LOAN_MAX_BALANCE, LOAN_PURPOSES, isOpen, todayYmdManila } from '@/lib/loan-rules';
import { peso } from '@/lib/utils';
import { F_BODY, T } from '@/components/theme';
import { todayLocalYmd } from '@/features/loans/parts.jsx';
import { moneyInput, flagErrors } from '@/lib/field-rules';

const labelFor = (list) => {
  const counts = new Map();
  list.forEach((e) => counts.set(e.name, (counts.get(e.name) || 0) + 1));
  return (e) => (counts.get(e.name) > 1 ? `${e.name} (ID ${e.id})` : e.name);
};

export const LoanFormModal = ({ open, onClose, staff = [], loans = [], onSaved, toast }) => {
  const people = useMemo(() => {
    const active = staff.filter((e) => e.status !== 'Inactive');
    const withLoan = new Set(loans.filter((l) => l.kind === 'LOAN' && isOpen(l)).map((l) => l.employeeId));
    return active.filter((e) => !withLoan.has(e.id));
  }, [staff, loans]);
  const labelOf = useMemo(() => labelFor(people), [people]);
  const byLabel = useMemo(() => new Map(people.map((e) => [labelOf(e), e])), [people, labelOf]);
  const savingRef = useRef(false);

  const [empId, setEmpId] = useState(null);
  const [purpose, setPurpose] = useState(LOAN_PURPOSES[0]);
  const [amount, setAmount] = useState('');
  const [per, setPer] = useState('');
  const [date, setDate] = useState(todayLocalYmd());
  const [busy, setBusy] = useState(false);

  const emp = people.find((e) => e.id === empId) || null;
  const unit = emp?.crew ? 'day' : 'cutoff';

  const amt = Number(amount);
  const perNum = Number(per);
  const overLimit = amt > LOAN_MAX_BALANCE + 0.004;
  const limitMsg = `A loan can be at most ${peso(LOAN_MAX_BALANCE)}.`;
  const perMsg = `The deduction per ${unit} cannot be more than the loan.`;

  const [showErrors, setShowErrors] = useState(false);
  let problem = '';
  if (!emp) problem = 'Choose the employee.';
  else if (!(amt > 0)) problem = 'Enter an amount.';
  else if (overLimit) problem = limitMsg;
  else if (!(perNum > 0)) problem = `Enter the deduction per ${unit}.`;
  else if (perNum > amt) problem = perMsg;

  const fe = showErrors ? {
    employee: emp ? '' : 'Choose the employee.',
    amount: !(amt > 0) ? 'Enter an amount.' : (overLimit ? limitMsg : ''),
    per: !(perNum > 0) ? `Enter the deduction per ${unit}.` : (perNum > amt ? perMsg : ''),
  } : {};

  const save = async () => {
    if (problem) { setShowErrors(true); flagErrors(); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id, kind: 'LOAN', purpose, principal: amt, perCutoff: perNum, date }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the loan.', 'error'); return; }
      toast(`Loan saved for ${emp.name}.`);
      onSaved?.();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally { savingRef.current = false; setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Loan" width={540}>
      <div className="space-y-3.5">
        <Field label="Employee" error={fe.employee}>
          <SearchSelect value={emp ? labelOf(emp) : ''} placeholder="Start typing a name…"
            options={people.map(labelOf)}
            onChange={(label) => { const e = byLabel.get(label); setEmpId(e ? e.id : null); setPer(''); }} />
        </Field>

        <Field label="Purpose">
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} style={inputStyle}>
            {LOAN_PURPOSES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Amount (₱)" error={fe.amount}>
            <div className="relative">
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(moneyInput(e.target.value))}
                className={inputCls} style={{ ...inputStyle, borderColor: overLimit ? T.brand : T.line, paddingRight: 112 }} aria-invalid={overLimit || undefined} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: T.soft }}>max {peso(LOAN_MAX_BALANCE)}</span>
            </div>
          </Field>
          <Field label={`Deduction per ${unit} (₱)`} error={fe.per}>
            <input inputMode="decimal" value={per} onChange={(e) => setPer(moneyInput(e.target.value))} className={inputCls} style={inputStyle} />
          </Field>
        </div>

        <Field label="Date given">
          <input type="date" value={date} max={todayYmdManila()} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>

        {overLimit && (
          <div role="alert" className="rounded-lg px-3.5 py-3 text-sm" style={{ backgroundColor: T.brandBg, color: T.brand, fontFamily: F_BODY, lineHeight: 1.45 }}>
            <b>Over the limit.</b> {problem}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn onClick={save} loading={busy} disabled={busy}>Save loan</Btn>
        </div>
      </div>
    </Modal>
  );
};