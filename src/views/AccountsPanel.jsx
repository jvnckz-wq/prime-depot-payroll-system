'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { Badge, Btn, Confirm, Eyebrow, Field, Modal, Panel, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

/// Account management, Operations Head only.
///
/// The whole flow exists because there is no public registration: the admin
/// creates an account, the system generates a temporary password, the admin
/// hands it over in person, and the new user is forced to replace it on first
/// sign-in.
export const AccountsPanel = ({ currentUser, toast }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', role: 'CHECKER' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [handover, setHandover] = useState(null); // { username, tempPassword, isReset }
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) setUsers(data.users);
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
      setForm({ username: '', displayName: '', role: 'CHECKER' });
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

  const copy = (text) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('Copied.'), () => {});
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>System Accounts</Eyebrow>
        <Btn size="sm" icon={Plus} onClick={() => { setError(''); setAddOpen(true); }}>Create Account</Btn>
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr><Th>Username</Th><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th right>Actions</Th></tr>
            </thead>
            <tbody>
              {loading && (
                <tr><Td colSpan={6}><span style={{ color: T.soft }}>Loading accounts...</span></Td></tr>
              )}
              {!loading && users.map(u => (
                <tr key={u.id}>
                  <Td mono>{u.username}</Td>
                  <Td>{u.displayName}</Td>
                  <Td>
                    <Badge tone={u.role === 'ADMIN' ? 'amber' : 'blue'}>
                      {u.role === 'ADMIN' ? 'Operations Head' : 'Delivery entry only'}
                    </Badge>
                  </Td>
                  <Td>
                    {!u.isActive
                      ? <Badge tone="red">Disabled</Badge>
                      : u.mustChangePassword
                        ? <Badge tone="amber">Temp password</Badge>
                        : <Badge tone="green">Active</Badge>}
                  </Td>
                  <Td mono>
                    <span style={{ color: T.soft }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'Never'}
                    </span>
                  </Td>
                  <Td right>
                    <div className="flex items-center justify-end gap-1.5">
                      <button title="Reset password"
                        onClick={() => setConfirm({
                          title: `Reset password for ${u.username}?`,
                          message: 'A new temporary password will be generated. Any session this account currently has will be signed out immediately.',
                          onConfirm: () => act(u, 'reset-password'),
                        })}>
                        <KeyRound size={14} color={T.soft} />
                      </button>
                      {u.id !== currentUser.id && (
                        u.isActive ? (
                          <button title="Disable account"
                            onClick={() => setConfirm({
                              title: `Disable ${u.username}?`,
                              message: 'They will be signed out and cannot sign in again until re-enabled. Their past delivery records stay intact — this is why accounts are disabled rather than deleted.',
                              danger: true,
                              confirmLabel: 'Disable account',
                              onConfirm: () => act(u, 'disable'),
                            })}>
                            <UserX size={14} color={T.red} />
                          </button>
                        ) : (
                          <button title="Re-enable account" onClick={() => act(u, 'enable')}>
                            <UserCheck size={14} color={T.green} />
                          </button>
                        )
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs mt-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
        Checkers can log deliveries for any truck. They cannot open employee records, personal details,
        attendance, payroll, loans, reports, or these settings — the server checks the role on every
        request, so the restriction holds even if someone calls the API directly.
      </p>

      {/* Create account */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Account" width={420}>
        <Field label="Full name">
          <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
            placeholder="Dela Cruz, Juan P." className={inputCls} style={inputStyle} />
        </Field>
        <div className="mt-3">
          <Field label="Username">
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
              placeholder="checker2" autoCapitalize="none" spellCheck={false}
              className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Role">
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className={inputCls} style={inputStyle}>
              <option value="CHECKER">Checker — delivery entry only</option>
              <option value="ADMIN">Operations Head — full access</option>
            </select>
          </Field>
        </div>
        <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          A temporary password will be generated and shown once. Give it to the person directly — they
          will be asked to choose their own password when they first sign in.
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Btn onClick={create} icon={Check} disabled={busy}>{busy ? 'Creating...' : 'Create account'}</Btn>
          <Btn variant="outline" onClick={() => setAddOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      {/* Temporary password handover — shown once, never retrievable again */}
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
                This is shown only once. It is stored as a one-way hash, so it cannot be looked up later —
                if it is lost, reset the password again.
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
