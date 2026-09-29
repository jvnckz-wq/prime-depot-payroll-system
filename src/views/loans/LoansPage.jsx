'use client';

// Loans: one row per active loan, click a row to open its ledger. Paid-off
// loans close by themselves and move to History, so there is no "Mark Paid".

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pause, Play, Plus } from 'lucide-react';
import { Btn, EmptyState, H1 } from '@/components/ui.jsx';
import { balanceOf, carryOf, dueFor, grantedBy, isOpen, nextCutoff, shortDate } from '@/lib/loan-rules';
import { peso } from '@/lib/utils';
import { F_BODY, F_MONO, T } from '@/components/theme';
import { BalanceBar, D, H, Kpi, Ledger, Person, Pill, SearchBox, Seg } from '@/views/loans/parts.jsx';
import { LoanFormModal } from '@/views/loans/LoanFormModal.jsx';

const STATUS_ORDER = { Deducting: 0, Scheduled: 1, Paused: 2 };

export const LoansPage = ({ staff, loans, reloadLoans, period, runKey, toast }) => {
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null); // null | { employeeId }
  const [busyId, setBusyId] = useState(null);

  const rows = useMemo(() => loans
    .filter((l) => l.kind === 'LOAN' && isOpen(l))
    .map((l) => {
      const balance = balanceOf(l);
      const appliedNow = !l.isCrew && l.entries.some((en) => en.type === 'deduction' && en.payslipId === runKey);
      const status = l.paused ? 'Paused' : !grantedBy(l, period.end) ? 'Scheduled' : 'Deducting';
      // Staff: the next payroll is this cutoff's, unless it was already taken.
      const nextEnd = appliedNow || status === 'Scheduled' ? nextCutoff(period.end).end : period.end;
      // Phase 2: a staff installment includes what the last cutoff could not
      // take (rule e). Crew are not stacked, so their due is the daily amount.
      const due = dueFor(l, { endYmd: l.isCrew ? null : nextEnd });
      const carry = l.isCrew ? { amount: 0, fromYmd: null } : carryOf(l, nextEnd);
      const left = l.perCutoff > 0 ? Math.ceil(balance / l.perCutoff - 1e-9) : null;
      return { l, balance, due, carry, status, nextEnd, left };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.due - a.due || a.l.person.localeCompare(b.l.person)),
  [loans, period.end, runKey]);

  const shown = rows.filter(({ l }) =>
    (who === 'all' || (who === 'crew' ? l.isCrew : !l.isCrew))
    && (!q.trim() || l.person.toLowerCase().includes(q.trim().toLowerCase())));

  const outstanding = rows.reduce((s, r) => s + r.balance, 0);
  const staffRows = rows.filter((r) => !r.l.isCrew);
  const toDeduct = staffRows.filter((r) => r.status === 'Deducting' && r.nextEnd === period.end);
  const pausedCount = staffRows.filter((r) => r.status === 'Paused').length;
  const crewRows = rows.filter((r) => r.l.isCrew && r.status === 'Deducting');

  const setPaused = async (l, paused) => {
    setBusyId(l.id);
    try {
      const res = await fetch(`/api/loans/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPaused: paused }) });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update the loan.', 'error'); return; }
      toast(paused ? `Deductions paused for ${l.person}.` : `Deductions resumed for ${l.person}.`);
      await reloadLoans();
    } catch { toast('Could not reach the server.', 'error'); } finally { setBusyId(null); }
  };

  // "Next deduction" text, shared by the table (desktop) and the cards (phone).
  const nextCell = ({ l, due, carry, status, nextEnd, left }) => (
    status === 'Paused' ? <span style={{ color: T.soft }}>None while paused</span> : (
      <>
        <div><b className="tabular-nums" style={{ fontFamily: F_MONO }}>{peso(due)}</b> · {l.isCrew ? 'daily' : shortDate(nextEnd)}</div>
        {carry.amount > 0 ? (
          // Where the extra comes from, so the Ops Head is not left wondering.
          <div className="text-xs" style={{ color: '#7A4B12' }}>
            incl. {peso(carry.amount)} short{carry.fromYmd ? ` from ${shortDate(carry.fromYmd)}` : ''}
          </div>
        ) : left != null && (
          <div className="text-xs" style={{ color: T.soft }}>
            {l.isCrew ? `about ${left} working day${left === 1 ? '' : 's'} left` : left === 1 ? 'last deduction' : `${left} cutoffs left`}
          </div>
        )}
      </>
    )
  );

  return (
    <div className="p-4 sm:p-6">
      <H1 action={<Btn variant="amber" icon={Plus} onClick={() => setForm({ employeeId: null })}>New Loan</Btn>}>Loans</H1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3.5 mb-4">
        <Kpi label="Outstanding balance" value={peso(outstanding)} sub={`${rows.length} active loan${rows.length === 1 ? '' : 's'}`} />
        <Kpi label={`To deduct on ${shortDate(period.end)} payroll`} value={peso(toDeduct.reduce((s, r) => s + r.due, 0))}
          sub={`${toDeduct.length} staff loan${toDeduct.length === 1 ? '' : 's'}${pausedCount ? ` · ${pausedCount} paused` : ''}`} />
        <Kpi label="Crew, deducted daily" value={peso(crewRows.reduce((s, r) => s + r.due, 0))} unit="/ day"
          sub={`${crewRows.length} crew loan${crewRows.length === 1 ? '' : 's'}`} />
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: T.surface, borderColor: T.line }}>
        <div className="flex items-center gap-2.5 flex-wrap px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <SearchBox value={q} onChange={setQ} />
          <Seg value={who} onChange={setWho} options={[['all', 'All'], ['staff', 'Staff'], ['crew', 'Crew']]} />
          <span className="ml-auto text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Sorted by next deduction</span>
        </div>

        {shown.length === 0 ? (
          <EmptyState title={rows.length ? 'No loans match this filter' : 'No active loans'}
            desc={rows.length ? 'Try another name or filter.' : 'Loans that are fully paid are in History.'} />
        ) : (
          <>
          {/* Phone: one card per loan with the money in view (balance, next
              deduction, status). Tap the card for its ledger; the action
              buttons are separate so a tap on the card never pauses or tops up. */}
          <div className="md:hidden">
            {shown.map(({ l, balance, due, carry, status, nextEnd, left }) => {
              const expanded = openId === l.id;
              const unit = l.isCrew ? 'day' : 'cutoff';
              return (
                <div key={l.id} style={{ borderBottom: `1px solid ${T.lineSoft}`, backgroundColor: expanded ? '#FCFBFA' : undefined }}>
                  <button type="button" className="pd-clickable w-full text-left px-3.5 pt-3 pb-2" aria-expanded={expanded}
                    onClick={() => setOpenId(expanded ? null : l.id)} style={{ fontFamily: F_BODY }}>
                    <div className="flex items-start justify-between gap-2">
                      <Person name={l.person} role={l.role} />
                      <Pill tone={status === 'Paused' ? 'amber' : status === 'Scheduled' ? 'slate' : 'green'}>{status}</Pill>
                    </div>
                    <div className="mt-2 text-xs" style={{ color: T.soft }}>
                      {l.purpose} · <span className="pd-num whitespace-nowrap">{peso(l.perCutoff)} / {unit}</span>
                    </div>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <div className="text-sm min-w-0" style={{ color: T.ink }}>
                        {nextCell({ l, due, carry, status, nextEnd, left })}
                      </div>
                      <BalanceBar balance={balance} principal={l.principal} />
                    </div>
                  </button>
                  <div className="px-3.5 pb-3 flex items-center gap-2 flex-wrap">
                    {status === 'Paused'
                      ? <Btn variant="outline" icon={Play} loading={busyId === l.id} onClick={() => setPaused(l, false)}>Resume</Btn>
                      : <Btn variant="outline" onClick={() => setForm({ employeeId: l.employeeId })}>Top-up</Btn>}
                    {expanded && status !== 'Paused' && (
                      <Btn variant="ghost" icon={Pause} loading={busyId === l.id} onClick={() => setPaused(l, true)}>Pause deductions</Btn>
                    )}
                    <span className="ml-auto text-xs flex items-center gap-1" style={{ color: T.soft }}>
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{expanded ? 'Hide ledger' : 'Ledger'}
                    </span>
                  </div>
                  {expanded && <div className="px-3.5 pb-3.5"><Ledger loan={l} /></div>}
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr>
                <H>Employee</H><H>Purpose</H><H right>Installment</H><H right>Balance / Principal</H><H>Next deduction</H><H>Status</H><H />
              </tr></thead>
              <tbody>
                {shown.map(({ l, balance, due, carry, status, nextEnd, left }) => {
                  const expanded = openId === l.id;
                  const unit = l.isCrew ? 'day' : 'cutoff';
                  return (
                    <React.Fragment key={l.id}>
                      <tr className="pd-clickable" style={{ backgroundColor: expanded ? '#FCFBFA' : undefined, cursor: 'pointer' }}
                        onClick={() => setOpenId(expanded ? null : l.id)} aria-expanded={expanded}>
                        <D>
                          <div className="flex items-center gap-1.5">
                            {expanded ? <ChevronDown size={14} color={T.soft} /> : <ChevronRight size={14} color={T.soft} />}
                            <Person name={l.person} role={l.role} />
                          </div>
                        </D>
                        <D>{l.purpose}</D>
                        <D right style={{ fontFamily: F_MONO, whiteSpace: 'nowrap' }}>{peso(l.perCutoff)} / {unit}</D>
                        <D right><BalanceBar balance={balance} principal={l.principal} /></D>
                        <D style={{ whiteSpace: 'nowrap' }}>
                          {nextCell({ l, due, carry, status, nextEnd, left })}
                        </D>
                        <D><Pill tone={status === 'Paused' ? 'amber' : status === 'Scheduled' ? 'slate' : 'green'}>{status}</Pill></D>
                        <D right>
                          <span onClick={(e) => e.stopPropagation()}>
                            {status === 'Paused'
                              ? <Btn size="sm" variant="outline" icon={Play} loading={busyId === l.id} onClick={() => setPaused(l, false)}>Resume</Btn>
                              : <Btn size="sm" variant="outline" onClick={() => setForm({ employeeId: l.employeeId })}>Top-up</Btn>}
                          </span>
                        </D>
                      </tr>
                      {expanded && (
                        <tr style={{ backgroundColor: '#FCFBFA' }}>
                          <td colSpan={7} className="px-3.5 pb-3 pt-1" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                            <div className="ml-6 space-y-2">
                              <Ledger loan={l} />
                              {status !== 'Paused' && (
                                <div className="flex justify-end">
                                  <Btn size="sm" variant="ghost" icon={Pause} loading={busyId === l.id} onClick={() => setPaused(l, true)}>Pause deductions</Btn>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {form && (
        <LoanFormModal key={form.employeeId || 'new'} open onClose={() => setForm(null)} staff={staff} loans={loans}
          presetEmployeeId={form.employeeId} toast={toast}
          onSaved={async () => { setForm(null); await reloadLoans(); }} />
      )}
    </div>
  );
};
