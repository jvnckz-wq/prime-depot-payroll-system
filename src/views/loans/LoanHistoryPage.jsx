'use client';

// History: fully paid loans and cash advances that were deducted. Read-only.
// A mistake is corrected with a new ledger entry that says why, never by
// editing or deleting the record (the same void-not-delete rule as deliveries).

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Btn, EmptyState, H1, inputCls, inputStyle } from '@/components/ui.jsx';
import { isOpen, shortDate } from '@/lib/loan-rules';
import { exportXLSX, peso } from '@/lib/utils';
import { F_MONO, T } from '@/theme';
import { D, H, Ledger, Person, Pill, SearchBox, Seg } from '@/views/loans/parts.jsx';

// The day it was fully paid: when it was closed, or (for records closed before
// auto-settle existed) the date of its last ledger entry.
const paidOn = (l) => l.settledAt || [...l.entries].reverse().find((e) => e.ymd)?.ymd || l.dateGranted || null;

export const LoanHistoryPage = ({ loans }) => {
  const done = useMemo(() => loans
    .filter((l) => l.entries.length > 0 && !isOpen(l))
    .map((l) => ({ l, paid: paidOn(l), deductions: l.entries.filter((e) => e.type === 'deduction' && e.amount > 0.004).length }))
    .sort((a, b) => String(b.paid).localeCompare(String(a.paid))), [loans]);

  const years = useMemo(() => [...new Set(done.map((r) => String(r.paid || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [done]);
  const thisYear = String(new Date().getFullYear());
  const [year, setYear] = useState(years.includes(thisYear) ? thisYear : 'all');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);

  const shown = done.filter(({ l, paid }) =>
    (year === 'all' || String(paid || '').startsWith(year))
    && (kind === 'all' || l.kind === kind)
    && (!q.trim() || l.person.toLowerCase().includes(q.trim().toLowerCase())));

  const exportRows = () => exportXLSX(`loans-history-${year}.xlsx`, [{
    name: 'History',
    rows: shown.map(({ l, paid, deductions }) => ({
      Employee: l.person,
      Position: l.role,
      Type: l.kind === 'CASH_ADVANCE' ? 'Cash Advance' : 'Loan',
      Purpose: l.purpose || '',
      Amount: l.principal,
      Given: l.dateGranted || '',
      'Fully paid': paid || '',
      Deductions: deductions,
    })),
  }]);

  return (
    <div className="p-4 sm:p-6">
      <H1 action={<Btn variant="outline" icon={Download} onClick={exportRows} disabled={shown.length === 0}>Export</Btn>}>History</H1>

      <div className="rounded-lg border overflow-hidden" style={{ backgroundColor: T.surface, borderColor: T.line }}>
        <div className="flex items-center gap-2.5 flex-wrap px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <SearchBox value={q} onChange={setQ} />
          <Seg value={kind} onChange={setKind} options={[['all', 'All'], ['LOAN', 'Loans'], ['CASH_ADVANCE', 'Cash Advances']]} />
          <select value={year} onChange={(e) => setYear(e.target.value)} className={`${inputCls} ml-auto`} style={{ ...inputStyle, width: 'auto' }} aria-label="Year">
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>Year: {y}</option>)}
          </select>
        </div>

        {shown.length === 0 ? (
          <EmptyState title="Nothing here yet" desc="Loans move here once fully paid, and cash advances once deducted." />
        ) : (
          <div className="overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr><H>Employee</H><H>Type</H><H>Purpose</H><H right>Amount</H><H>Given</H><H>Fully paid</H><H center>Deductions</H></tr></thead>
              <tbody>
                {shown.map(({ l, paid, deductions }) => {
                  const expanded = openId === l.id;
                  return (
                    <React.Fragment key={l.id}>
                      <tr className="pd-clickable" style={{ cursor: 'pointer', backgroundColor: expanded ? '#FCFBFA' : undefined }}
                        onClick={() => setOpenId(expanded ? null : l.id)} aria-expanded={expanded}>
                        <D>
                          <div className="flex items-center gap-1.5">
                            {expanded ? <ChevronDown size={14} color={T.soft} /> : <ChevronRight size={14} color={T.soft} />}
                            <Person name={l.person} role={l.role} />
                          </div>
                        </D>
                        <D>{l.kind === 'CASH_ADVANCE' ? <Pill tone="slate">Cash Advance</Pill> : <Pill tone="ink">Loan</Pill>}</D>
                        <D style={{ color: l.purpose ? T.ink : T.soft }}>{l.purpose || 'n/a'}</D>
                        <D right style={{ fontFamily: F_MONO, whiteSpace: 'nowrap' }}>{peso(l.principal)}</D>
                        <D style={{ whiteSpace: 'nowrap' }}>{shortDate(l.dateGranted, true)}</D>
                        <D style={{ whiteSpace: 'nowrap' }}>{shortDate(paid, true)}</D>
                        <D center>{deductions}</D>
                      </tr>
                      {expanded && (
                        <tr style={{ backgroundColor: '#FCFBFA' }}>
                          <td colSpan={7} className="px-3.5 pb-3 pt-1" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                            <div className="ml-6"><Ledger loan={l} /></div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
