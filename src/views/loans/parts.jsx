'use client';

// Small building blocks shared by the Loans, Cash Advances and History pages,
// so the three screens look and read the same way.

import React from 'react';
import { Search } from 'lucide-react';
import { loanLedger } from '../../lib/payroll';
import { peso } from '../../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../../theme';

// Status pill (sentence case, rounded) as in the approved mockups.
const PILL = {
  green: [T.greenBg, T.green],
  amber: [T.warnBg, T.warn],
  slate: [T.blueBg, T.soft],
  red: [T.brandBg, T.brand],
  ink: [T.ink, '#FFFFFF'],
};
export const Pill = ({ tone = 'slate', children }) => {
  const [bg, fg] = PILL[tone] || PILL.slate;
  return (
    <span className="inline-block rounded-full whitespace-nowrap" style={{ backgroundColor: bg, color: fg, fontFamily: F_HEAD, fontWeight: 600, fontSize: 11.5, padding: '3px 8px' }}>
      {children}
    </span>
  );
};

const initials = (name) => String(name || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export const Person = ({ name, role }) => (
  <div className="flex items-center gap-2.5">
    <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 30, height: 30, backgroundColor: T.brandBg, color: T.brand, fontFamily: F_HEAD, fontWeight: 700, fontSize: 11.5 }}>
      {initials(name)}
    </div>
    <div className="min-w-0">
      <div className="text-sm font-semibold truncate" style={{ fontFamily: F_BODY, color: T.ink }}>{name}</div>
      {role && <div className="text-xs truncate" style={{ fontFamily: F_BODY, color: T.soft }}>{role}</div>}
    </div>
  </div>
);

export const Kpi = ({ label, value, unit, sub }) => (
  <div className="rounded-lg border px-4 py-3.5" style={{ backgroundColor: T.surface, borderColor: T.line }}>
    <div className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.06em' }}>{label}</div>
    <div className="mt-1.5 tabular-nums" style={{ fontFamily: F_HEAD, color: T.ink, fontSize: 24, fontWeight: 700 }}>
      {value}{unit && <span style={{ fontSize: 14, fontWeight: 500, color: T.soft }}> {unit}</span>}
    </div>
    {sub && <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>{sub}</div>}
  </div>
);

// Segmented filter (All / Staff / Crew, All / Loans / Cash Advances).
export const Seg = ({ value, onChange, options }) => (
  <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: T.line }} role="tablist">
    {options.map(([key, label]) => {
      const on = value === key;
      return (
        <button key={key} type="button" role="tab" aria-selected={on} onClick={() => onChange(key)}
          className="px-3 py-1.5 text-sm"
          style={{ fontFamily: F_BODY, backgroundColor: on ? T.ink : 'transparent', color: on ? '#FFFFFF' : T.soft, fontWeight: on ? 600 : 400 }}>
          {label}
        </button>
      );
    })}
  </div>
);

export const SearchBox = ({ value, onChange, placeholder = 'Search employee…' }) => (
  <label className="flex items-center gap-2 rounded-lg border px-3 py-2 flex-1" style={{ borderColor: T.line, maxWidth: 340 }}>
    <Search size={14} color={T.soft} aria-hidden="true" />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      className="w-full text-sm outline-none bg-transparent" style={{ fontFamily: F_BODY, color: T.ink }} />
  </label>
);

// Table header cell with the tinted header row from the mockups.
export const H = ({ children, right = false, center = false }) => (
  <th className={`text-xs font-semibold uppercase px-3.5 py-2.5 whitespace-nowrap ${center ? 'text-center' : right ? 'text-right' : 'text-left'}`}
    style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.05em', backgroundColor: '#FAF8F7', borderBottom: `1px solid ${T.line}` }}>
    {children}
  </th>
);
export const D = ({ children, right = false, center = false, style = {}, colSpan }) => (
  <td colSpan={colSpan} className={`px-3.5 py-2.5 text-sm align-middle ${center ? 'text-center' : right ? 'text-right' : 'text-left'}`}
    style={{ fontFamily: F_BODY, color: T.ink, borderBottom: `1px solid ${T.lineSoft}`, ...style }}>
    {children}
  </td>
);

// Balance with a thin progress bar (share already paid back).
export const BalanceBar = ({ balance, principal }) => {
  const pct = principal > 0 ? Math.min(100, Math.max(0, ((principal - balance) / principal) * 100)) : 100;
  return (
    <div className="text-right">
      <div className="whitespace-nowrap">
        <span className="tabular-nums" style={{ fontFamily: F_MONO, fontWeight: 700 }}>{peso(balance)}</span>{' '}
        <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>of {peso(principal)}</span>
      </div>
      <div className="h-1.5 rounded-full mt-1 ml-auto overflow-hidden" style={{ width: 120, backgroundColor: T.lineSoft }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: T.brand }} />
      </div>
    </div>
  );
};

// The loan's ledger, bank-statement style. The first grant is "Given"; any
// later grant is a "Top-up" on the same loan.
export const Ledger = ({ loan }) => {
  const rows = loanLedger(loan);
  let grants = 0;
  return (
    <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: T.line, backgroundColor: T.surface }}>
      <table className="w-full">
        <thead><tr>
          <H>Date</H><H>Entry</H><H>Remarks</H><H right>Amount</H><H right>Balance after</H>
        </tr></thead>
        <tbody>
          {rows.map((en, i) => {
            const isGrant = en.type === 'grant';
            const label = isGrant ? (grants++ === 0 ? 'Given' : 'Top-up') : 'Deducted';
            const tone = label === 'Given' ? 'slate' : label === 'Top-up' ? 'ink' : 'red';
            const last = i === rows.length - 1;
            return (
              <tr key={i}>
                <D style={{ whiteSpace: 'nowrap' }}>{en.date}</D>
                <D><Pill tone={tone}>{label}</Pill></D>
                <D>{en.remark}</D>
                <D right style={{ fontFamily: F_MONO, fontWeight: 600, color: isGrant ? T.soft : T.red, whiteSpace: 'nowrap' }}>{isGrant ? '+' : '-'}{peso(en.amount)}</D>
                <D right style={{ fontFamily: F_MONO, whiteSpace: 'nowrap', color: last && en.runningBalance <= 0.004 ? T.green : T.ink, fontWeight: last && en.runningBalance <= 0.004 ? 700 : 400 }}>{peso(en.runningBalance)}</D>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Local 'YYYY-MM-DD' for a date input's default (the browser's own day).
export const todayLocalYmd = () => new Date().toLocaleDateString('en-CA');
