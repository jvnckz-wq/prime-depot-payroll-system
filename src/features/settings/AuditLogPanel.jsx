'use client';

import React, { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Btn, EmptyState, H1, Panel, SkeletonRows, Td, Th, inputCls, inputStyle } from '@/components/ui';
import { F_BODY, F_MONO, T } from '@/styles/theme';
import { exportXLSX } from '@/lib/utils';

export const ACTION_LABELS = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILURE: 'Failed sign-in',
  LOGIN_THROTTLED: 'Sign-in locked',
  LOGIN_2FA_PENDING: 'Password accepted',
  LOGIN_2FA_FAILURE: 'Wrong 2FA code',
  LOGOUT: 'Signed out',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET: 'Password reset',
  ACCOUNT_CREATED: 'Account created',
  ACCOUNT_DISABLED: 'Account disabled',
  ACCOUNT_ENABLED: 'Account enabled',
  ACCOUNT_LINKED: 'Account linked',
  USERNAME_CHANGED: 'Username changed',
  SESSIONS_REVOKED: 'Signed out everywhere',
  TWO_FACTOR_ENABLED: '2FA turned on',
  TWO_FACTOR_DISABLED: '2FA turned off',
  TWO_FACTOR_REENROLLED: 'Phone changed',
  BACKUP_CODES_REGENERATED: 'Backup codes renewed',
  RECOVERY_EMAIL_CHANGED: 'Recovery email changed',
  PAYROLL_FINALIZED: 'Payroll finalized',
  PAYROLL_UNFINALIZED: 'Payroll un-finalized',
  DELIVERY_VOIDED: 'Delivery voided',
  DELIVERY_UNVOIDED: 'Delivery restored',
  CREW_RATES_UPDATED: 'Rates changed',
  LOAN_PAUSED: 'Loan paused',
  LOAN_RESUMED: 'Loan resumed',
};
const labelOf = (a) => ACTION_LABELS[a] || (a.charAt(0) + a.slice(1).replace(/_/g, ' ').toLowerCase());
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const ymd = (d) => d.toISOString().slice(0, 10);

export const AuditLogPanel = ({ toast }) => {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ rows: [], users: [], capped: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from, to });
    if (action) params.set('action', action);
    if (user) params.set('user', user);
    if (query) params.set('q', query);
    fetch(`/api/audit?${params}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Could not load the audit log.'); return d; })
      .then((d) => { if (!cancelled) setData({ rows: d.rows || [], users: d.users || [], capped: !!d.capped }); })
      .catch((err) => { if (!cancelled) toast && toast(err.message, 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, action, user, query, toast]);

  const change = (setter) => (e) => { setLoading(true); setter(e.target.value); };

  const exportRows = () => exportXLSX(`Audit-Log-${from}-to-${to}.xlsx`, [{
    name: 'Audit Log',
    rows: data.rows.map((r) => ({ 'Date and time': fmtWhen(r.at), User: r.user, Action: labelOf(r.action), Details: r.detail })),
  }]);

  const ctrl = { ...inputStyle, height: 38 };

  return (
    <div className="p-4 sm:p-6">
      <H1 action={<Btn variant="outline" onClick={exportRows} disabled={!data.rows.length}>Export</Btn>}>Audit Log</H1>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input type="date" value={from} max={to} onChange={change(setFrom)} aria-label="From" className={inputCls} style={{ ...ctrl, width: 160 }} />
        <span className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>to</span>
        <input type="date" value={to} min={from} onChange={change(setTo)} aria-label="To" className={inputCls} style={{ ...ctrl, width: 160 }} />
        <select value={action} onChange={change(setAction)} aria-label="Action" className={inputCls} style={{ ...ctrl, width: 'auto' }}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={user} onChange={change(setUser)} aria-label="User" className={inputCls} style={{ ...ctrl, width: 'auto' }}>
          <option value="">All users</option>
          {data.users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input value={q} onChange={(e) => { setLoading(true); setQ(e.target.value); }} maxLength={80} placeholder="Search details..." aria-label="Search details"
          className={inputCls} style={{ ...ctrl, flex: 1, minWidth: 180 }} />
      </div>
      <Panel className="overflow-hidden">
        {!loading && !data.rows.length ? (
          <EmptyState icon={ScrollText} title="No entries for these filters" />
        ) : (
          <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
            <thead><tr><Th>Date and time</Th><Th>User</Th><Th>Action</Th><Th>Details</Th></tr></thead>
            <tbody>
              {loading ? <SkeletonRows cols={4} rows={6} /> : data.rows.map((r) => (
                <tr key={r.id}>
                  <Td><span style={{ whiteSpace: 'nowrap' }}>{fmtWhen(r.at)}</span></Td>
                  <Td><span style={{ fontFamily: F_MONO }}>{r.user || '--'}</span></Td>
                  <Td><span style={{ fontFamily: F_BODY, whiteSpace: 'nowrap' }}>{labelOf(r.action)}</span></Td>
                  <Td><span style={{ fontFamily: F_BODY }}>{r.detail}</span></Td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>
      {data.capped && <div className="text-xs mt-2" style={{ fontFamily: F_BODY, color: T.soft }}>Showing the latest 500. Narrow the dates to see older entries.</div>}
    </div>
  );
};
