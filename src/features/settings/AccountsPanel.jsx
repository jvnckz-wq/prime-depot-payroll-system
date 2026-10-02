'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, KeyRound, Link2, Plus, UserCheck, UserX } from 'lucide-react';
import { Av, Badge, Btn, Confirm, Eyebrow, Field, Modal, Skeleton, inputCls, inputStyle } from '@/components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '@/components/theme';
import { suggestUsername } from '@/lib/checker-accounts';

const NoCheckers = ({ onGoToEmployees }) => (
  <div className="p-3.5 rounded" style={{ backgroundColor: T.bg }}>
    <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Register the checker first</div>
    <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
      Every checker account belongs to an employee whose position is Checker. None are available: either no one
      is registered as Checker yet, or all of them already have an account.
    </div>
    {onGoToEmployees && (
      <div className="mt-3">
        <Btn size="sm" variant="outline" onClick={onGoToEmployees}>Go to Employees</Btn>
      </div>
    )}
  </div>
);

const CheckerSelect = ({ checkers, value, onChange }) => (
  <Field label="Checker">
    <select value={value} onChange={e => onChange(e.target.value)} className={inputCls} style={inputStyle}>
      <option value="">Choose a checker</option>
      {checkers.map(c => <option key={c.id} value={c.id}>{c.name} (ID {c.id})</option>)}
    </select>
    <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>
      Only employees whose position is Checker and who have no account yet.
    </div>
  </Field>
);

export const AccountsPanel = ({ currentUser, toast, onGoToEmployees }) => {
  const [users, setUsers] = useState([]);
  const [checkers, setCheckers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', username: '' });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [linkFor, setLinkFor] = useState(null);
  const [linkEmployeeId, setLinkEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [handover, setHandover] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) { setUsers(data.users); setCheckers(data.availableCheckers || []); }
      else toast(data.error || 'Could not load accounts.', 'error');
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- deps intentionally limited to avoid re-running this load; intentional: load/sync state on mount or when deps change
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not create the account.'); return; }

      setAddOpen(false);
      setForm({ employeeId: '', username: '' });
      setUsernameTouched(false);
      setHandover({ username: data.user.username, tempPassword: data.tempPassword, isReset: false });
      load();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (user, action) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update the account.', 'error'); return; }

      if (action === 'reset-password') {
        setHandover({ username: user.username, tempPassword: data.tempPassword, isReset: true });
      } else {
        toast(action === 'disable' ? `${user.username} can no longer sign in.` : `${user.username} can sign in again.`);
      }
      load();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  const pickChecker = (employeeId) => {
    const c = checkers.find(x => x.id === employeeId);
    setForm(f => ({
      ...f,
      employeeId,
      username: usernameTouched ? f.username : (c ? suggestUsername(c.name) : ''),
    }));
  };

  const openCreate = () => {
    setError('');
    setForm({ employeeId: '', username: '' });
    setUsernameTouched(false);
    setAddOpen(true);
  };

  const link = async () => {
    if (!linkFor) return;
    setError(''); setBusy(true);
    try {
      const res = await fetch(`/api/users/${linkFor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', employeeId: linkEmployeeId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not link the account.'); return; }
      toast(`${linkFor.username} is now linked.`);
      setLinkFor(null);
      load();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const copy = (text) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('Copied.'), () => {});
    }
  };

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : 'Never';

  const roleLabel = (role) => (role === 'ADMIN' ? 'Operations Head' : 'Delivery entry only');

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>Account Access</h1>
        <Btn size="sm" icon={Plus} onClick={openCreate}>Create account</Btn>
      </div>

      <div className="mt-4">
        {loading && [0, 1, 2].map((i) => (
          <div key={`sk-${i}`} className="flex items-center gap-4 py-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <Skeleton w={40} h={40} r={20} />
            <div className="flex-1">
              <Skeleton w={110} /><div className="mt-1.5"><Skeleton w={180} /></div>
            </div>
            <Skeleton w={90} />
          </div>
        ))}

        {!loading && users.map(u => {
          const statusBadge = !u.isActive
            ? <Badge tone="red">Disabled</Badge>
            : u.mustChangePassword
              ? <Badge tone="amber">Temp password</Badge>
              : <Badge tone="green">Active</Badge>;

          return (
            <div key={u.id} className="flex items-center gap-4 py-4"
              style={{ borderBottom: `1px solid ${T.lineSoft}`, opacity: u.isActive ? 1 : 0.65 }}>
              <Av name={u.displayName} size={40} tone={u.role === 'ADMIN' ? T.brand : T.soft} />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ fontFamily: F_MONO, color: T.ink }}>{u.username}</div>
                <div className="text-xs mt-0.5 truncate" style={{ fontFamily: F_BODY, color: T.soft }}>
                  {u.employee ? `${u.employee.name}, ID ${u.employee.id}` : u.displayName} <span aria-hidden="true">&middot;</span> last sign-in {fmtDate(u.lastLoginAt)}
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 shrink-0">
                {u.role === 'CHECKER' && !u.employee && <Badge tone="amber">Not linked</Badge>}
                <Badge tone={u.role === 'ADMIN' ? 'amber' : 'blue'}>{roleLabel(u.role)}</Badge>
                {statusBadge}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {u.role === 'CHECKER' && !u.employee && (
                  <button className="pd-clickable p-2 rounded" title="Link to a checker" aria-label={`Link ${u.username} to a checker`}
                    style={{ border: `1px solid ${T.line}` }}
                    onClick={() => { setError(''); setLinkEmployeeId(''); setLinkFor(u); }}>
                    <Link2 size={14} color={T.brand} />
                  </button>
                )}
                <button className="pd-clickable p-2 rounded" title="Reset password"
                  style={{ border: `1px solid ${T.line}` }}
                  onClick={() => setConfirm({
                    title: `Reset password for ${u.username}?`,
                    message: 'A new temporary password will be generated. Any session this account currently has will be signed out immediately.',
                    onConfirm: () => act(u, 'reset-password'),
                  })}>
                  <KeyRound size={14} color={T.soft} />
                </button>
                {u.id !== currentUser.id && (
                  u.isActive ? (
                    <button className="pd-clickable p-2 rounded" title="Disable account"
                      style={{ border: `1px solid ${T.line}` }}
                      onClick={() => setConfirm({
                        title: `Disable ${u.username}?`,
                        message: 'They will be signed out and cannot sign in again until re-enabled. Their past delivery records stay intact, which is why accounts are disabled rather than deleted.',
                        danger: true,
                        confirmLabel: 'Disable account',
                        onConfirm: () => act(u, 'disable'),
                      })}>
                      <UserX size={14} color={T.red} />
                    </button>
                  ) : (
                    <button className="pd-clickable p-2 rounded" title="Re-enable account"
                      style={{ border: `1px solid ${T.line}` }}
                      onClick={() => act(u, 'enable')}>
                      <UserCheck size={14} color={T.green} />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Account" width={420}>
        {checkers.length === 0 ? (
          <NoCheckers onGoToEmployees={onGoToEmployees} />
        ) : (
          <CheckerSelect checkers={checkers} value={form.employeeId} onChange={pickChecker} />
        )}
        <div className="mt-3">
          <Field label="Username">
            <input value={form.username} onChange={e => { setUsernameTouched(true); setForm(f => ({ ...f, username: e.target.value.toLowerCase() })); }}
              placeholder="checker2" autoCapitalize="none" spellCheck={false} disabled={checkers.length === 0}
              className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
        </div>
        <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          A temporary password will be generated and shown once. Give it to the person directly. They
          will be asked to choose their own password when they first sign in.
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Btn onClick={create} loading={busy} disabled={busy || !form.employeeId}>{busy ? 'Creating...' : 'Create account'}</Btn>
          <Btn variant="outline" onClick={() => setAddOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={!!linkFor} onClose={() => setLinkFor(null)} title={linkFor ? `Link ${linkFor.username}` : 'Link account'} width={420}>
        <div className="text-sm mb-3" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
          Pick the employee who uses this account. Their name replaces the one typed when the account was made.
        </div>
        {checkers.length === 0 ? (
          <NoCheckers onGoToEmployees={onGoToEmployees} />
        ) : (
          <CheckerSelect checkers={checkers} value={linkEmployeeId} onChange={setLinkEmployeeId} />
        )}
        {error && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <Btn onClick={link} loading={busy} disabled={busy || !linkEmployeeId}>{busy ? 'Linking...' : 'Link account'}</Btn>
          <Btn variant="outline" onClick={() => setLinkFor(null)}>Cancel</Btn>
        </div>
      </Modal>

      <Modal open={!!handover} onClose={() => setHandover(null)}
        title={handover?.isReset ? 'Password reset' : 'Account created'} width={420}>
        {handover && (
          <div>
            <div className="text-sm mb-3" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
              Give these to <span style={{ fontFamily: F_MONO, fontWeight: 600 }}>{handover.username}</span> directly.
            </div>
            <div className="p-3 rounded mb-3" style={{ backgroundColor: T.bg }}>
              <Eyebrow>Username</Eyebrow>
              <div className="text-base font-semibold mb-3" style={{ fontFamily: F_MONO, color: T.ink }}>{handover.username}</div>
              <Eyebrow>Temporary password</Eyebrow>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold" style={{ fontFamily: F_MONO, color: T.brand }}>{handover.tempPassword}</span>
                <button onClick={() => copy(handover.tempPassword)} title="Copy"><Copy size={13} color={T.soft} /></button>
              </div>
            </div>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded text-xs mb-4"
              style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
              <AlertTriangle size={13} color={T.warn} className="mt-0.5 shrink-0" />
              <span>
                This is shown only once. It is stored as a one-way hash, so it cannot be looked up later. If it is
                lost, reset the password again.
              </span>
            </div>
            <Btn onClick={() => setHandover(null)} full>Done</Btn>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.onConfirm?.(); setConfirm(null); }}
      />
    </div>
  );
};
