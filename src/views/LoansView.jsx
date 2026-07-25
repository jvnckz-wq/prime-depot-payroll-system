'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Pause, Play, Check, Save } from 'lucide-react';
import { Av, Badge, Btn, Eyebrow, Field, H1, Modal, Money, Panel, ProgressBar, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { loanBalance, loanLedger } from '../lib/payroll';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

const BLANK_LOAN = { person: '', type: 'Cash Advance (Bali)', principal: '', perCutoff: '', date: '' };

export const LoansView = ({ staff, loans, reloadLoans, toast }) => {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK_LOAN);
  const [busy, setBusy] = useState(false);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const people = useMemo(() => staff.map(s => s.name), [staff]);

  const addLoan = async () => {
    if (!form.person || !form.principal) { toast('Person and amount are required.', 'error'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: form.person, type: form.type, principal: form.principal, perCutoff: form.perCutoff, date: form.date }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not add the loan.', 'error'); return; }
      toast('Loan / advance added.');
      setModal(false); setForm(BLANK_LOAN);
      await reloadLoans();
    } catch { toast('Could not reach the server.', 'error'); }
    finally { setBusy(false); }
  };

  const togglePause = async (l) => {
    try {
      const res = await fetch(`/api/loans/${l.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: !l.paused }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update the loan.', 'error'); return; }
      await reloadLoans();
    } catch { toast('Could not reach the server.', 'error'); }
  };

  const markPaid = async (l) => {
    try {
      const res = await fetch(`/api/loans/${l.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settle: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update the loan.', 'error'); return; }
      toast('Loan marked as fully paid.');
      await reloadLoans();
    } catch { toast('Could not reach the server.', 'error'); }
  };

  return (
    <div className="p-6">
      <H1 sub="Staggered loans and daily advances (bali, allowances) — tracked separately from statutory micro-deductions."
        action={<Btn icon={Plus} onClick={() => setModal(true)}>Add Loan / Advance</Btn>}>Loans & Advances</H1>
      <div className="space-y-4">
        {loans.map(l => {
          const balance = loanBalance(l);
          const pct = l.principal > 0 ? ((l.principal - balance) / l.principal) * 100 : 100;
          const paid = balance <= 0;
          const ledger = loanLedger(l);
          return (
            <Panel key={l.id} className="p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Av name={l.person} size={32} tone={T.brand} />
                  <div>
                    <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>{l.person} <span className="font-normal text-xs" style={{ color: T.soft }}>· {l.type}</span></div>
                    <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>{l.role} · ₱{l.perCutoff} per cutoff</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <Eyebrow>Balance / Principal</Eyebrow>
                    <div className="flex items-center gap-2">
                      <Money value={balance} bold size="text-base" tone={paid ? T.green : T.ink} />
                      <span className="text-xs" style={{ fontFamily: F_MONO, color: T.soft }}>/ {peso(l.principal)}</span>
                    </div>
                    <div className="mt-1"><ProgressBar pct={pct} tone={paid ? T.green : T.brand} /></div>
                  </div>
                  {!paid && (
                    <div className="flex gap-2">
                      <button onClick={() => togglePause(l)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                        style={{ fontFamily: F_HEAD, backgroundColor: l.paused ? T.greenBg : T.amberBg, color: l.paused ? T.green : T.amber }}>
                        {l.paused ? <Play size={12} /> : <Pause size={12} />} {l.paused ? 'Resume' : 'Pause'}
                      </button>
                      <button onClick={() => markPaid(l)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: T.lineSoft, color: T.ink }}>
                        <Check size={12} /> Mark Paid
                      </button>
                    </div>
                  )}
                  {paid && <Badge tone="green">Fully Paid</Badge>}
                </div>
              </div>
              <table className="w-full">
                <thead><tr><Th>Date</Th><Th>Type</Th><Th>Remarks</Th><Th right>Amount</Th><Th right>Balance After</Th></tr></thead>
                <tbody>{ledger.map((en, i) => (
                  <tr key={i}>
                    <Td mono>{en.date}</Td>
                    <Td><Badge tone={en.type === 'grant' ? 'blue' : 'red'}>{en.type === 'grant' ? 'Given' : 'Deducted'}</Badge></Td>
                    <Td>{en.remark}</Td>
                    <Td right mono style={{ color: en.type === 'grant' ? T.blue : T.red, fontWeight: 600 }}>{en.type === 'grant' ? '+' : '-'}{peso(en.amount)}</Td>
                    <Td right mono>{peso(en.runningBalance)}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </Panel>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Loan / Advance">
        <div className="space-y-3">
          <Field label="Person*">
            <input list="people-list" value={form.person} onChange={e => ff('person', e.target.value)} placeholder="Start typing a name…" className={inputCls} style={inputStyle} />
            <datalist id="people-list">{people.map((p, i) => <option key={p + '-' + i} value={p} />)}</datalist>
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={e => ff('type', e.target.value)} className={inputCls} style={inputStyle}>
              {['Cash Advance (Bali)', 'Cash Advance', 'School Allowance', 'SSS Salary Loan', 'Pag-IBIG Multi-Purpose Loan', 'Company Cash Advance'].map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal (₱)*"><input type="number" value={form.principal} onChange={e => ff('principal', e.target.value)} className={inputCls} style={inputStyle} /></Field>
            <Field label="Per-cutoff deduction (₱)"><input type="number" value={form.perCutoff} onChange={e => ff('perCutoff', e.target.value)} placeholder="Blank = full amount" className={inputCls} style={inputStyle} /></Field>
          </div>
          <Field label="Date granted"><input type="date" value={form.date} onChange={e => ff('date', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)} disabled={busy}>Cancel</Btn>
            <Btn icon={Save} onClick={addLoan} disabled={busy}>{busy ? 'Saving…' : 'Add'}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ============================= REPORTS ============================= */
