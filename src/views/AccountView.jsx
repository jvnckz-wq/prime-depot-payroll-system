'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { Btn, Confirm, Eyebrow, Field, Panel, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

/// The change-password form itself. Used both inside Settings and on the
/// forced-change screen, so the rules and messages stay identical in both.
export const ChangePasswordPanel = ({ onDone, toast, compact = false }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');

    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
      setError('New password must contain both letters and numbers.'); return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not change password.'); return; }

      setCurrent(''); setNext(''); setConfirm('');
      if (toast) toast('Password changed. Other devices have been signed out.');
      if (onDone) onDone();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Field label="Current password">
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
          autoComplete="current-password" className={inputCls} style={inputStyle} />
      </Field>
      <div className="mt-3">
        <Field label="New password">
          <input type="password" value={next} onChange={e => setNext(e.target.value)}
            autoComplete="new-password" className={inputCls} style={inputStyle} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Confirm new password">
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password" className={inputCls} style={inputStyle} />
        </Field>
      </div>

      <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
        At least 8 characters, with both letters and numbers. Changing your password signs out every
        other device using this account.
      </div>

      {error && (
        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
          style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className={compact ? 'mt-4' : 'mt-4 flex'}>
        <Btn onClick={submit} icon={Check} disabled={busy} full={compact}>
          {busy ? 'Saving...' : 'Change password'}
        </Btn>
      </div>
    </div>
  );
};

/// Shown immediately after signing in with a temporary password. There is no
/// way past it other than choosing a real password — a temporary one handed
/// over verbally should never survive the first session.
export const ForcedPasswordChange = ({ user, onDone }) => (
  <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: T.sidebar }}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ backgroundColor: '#fff' }}>
          <KeyRound size={22} color={T.brand} />
        </div>
        <div className="text-xl font-bold text-white" style={{ fontFamily: F_HEAD }}>Choose your password</div>
        <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: T.sidebarSoft, lineHeight: 1.6 }}>
          Signed in as <span style={{ fontFamily: F_MONO, color: '#fff' }}>{user.username}</span>.
          You are using a temporary password, so please set your own before continuing.
        </div>
      </div>
      <Panel className="p-6">
        <ChangePasswordPanel onDone={onDone} compact />
      </Panel>
    </div>
  </div>
);

/// "My Account" — profile and security, the one Settings section a Checker
/// can reach. Laid out the way people expect from any account page: who you
/// are at the top, what protects that account below it.
export const AccountView = ({ user, toast, onUserChange, onSignedOut }) => {
  const [name, setName] = useState(user.displayName);
  const [savingName, setSavingName] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const initials = (user.displayName || user.username)
    .split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const nameChanged = name.trim() && name.trim() !== user.displayName;

  const saveName = async () => {
    setSavingName(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update your name.', 'error'); return; }
      if (onUserChange) onUserChange(data.user);
      toast('Profile updated.');
    } catch {
      toast('Could not reach the server.', 'error');
    } finally { setSavingName(false); }
  };

  const signOutEverywhere = async () => {
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      if (!res.ok) { toast('Could not sign out.', 'error'); return; }
      if (onSignedOut) onSignedOut();
    } catch { toast('Could not reach the server.', 'error'); }
  };

  const fmt = (iso) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  return (
    <div className="max-w-lg">
      {/* ---------------- Profile ---------------- */}
      <Panel className="p-5 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <div className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 56, height: 56, backgroundColor: T.brand, color: '#fff', fontFamily: F_HEAD, fontSize: 20, fontWeight: 700 }}>
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold truncate" style={{ fontFamily: F_HEAD, color: T.ink }}>{user.displayName}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>{user.username}</span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ fontFamily: F_HEAD, backgroundColor: T.brandBg, color: T.brandDark }}>
                {user.role === 'ADMIN' ? 'Operations Head' : 'Checker'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${T.lineSoft}` }} className="pt-4">
          <Field label="Display name">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <div className="text-xs mt-2" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            Your username cannot be changed — it is your sign-in identity and is attached to every
            record this account has created.
          </div>
          {nameChanged && (
            <div className="mt-3 flex gap-2">
              <Btn size="sm" icon={Check} onClick={saveName} disabled={savingName}>
                {savingName ? 'Saving...' : 'Save name'}
              </Btn>
              <Btn size="sm" variant="outline" onClick={() => setName(user.displayName)}>Cancel</Btn>
            </div>
          )}
        </div>
      </Panel>

      {/* ---------------- Security ---------------- */}
      <Panel className="p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={15} color={T.brand} />
          <span className="text-base font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>Change password</span>
        </div>
        <div className="text-xs mb-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          Your password is stored as a one-way hash — nobody can read it back, not even the
          administrator. If you forget it, it has to be reset rather than looked up.
        </div>
        <ChangePasswordPanel toast={toast} />
      </Panel>

      <Panel className="p-5">
        <Eyebrow>Sessions</Eyebrow>
        <div className="flex items-center justify-between gap-4 mt-2 flex-wrap">
          <div className="text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
            Last sign-in
            <div className="text-xs mt-0.5" style={{ fontFamily: F_MONO, color: T.soft }}>{fmt(user.lastLoginAt)}</div>
          </div>
          <Btn size="sm" variant="outline" icon={LogOut} onClick={() => setConfirmSignOut(true)}>
            Sign out everywhere
          </Btn>
        </div>
        <div className="text-xs mt-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          Use this if you signed in on a shared computer and are not sure you signed out. It ends
          every session for this account, including this one.
        </div>
      </Panel>

      <Confirm
        open={confirmSignOut}
        title="Sign out everywhere?"
        message="Every device signed in as this account will be signed out, including this one. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => { setConfirmSignOut(false); signOutEverywhere(); }}
      />
    </div>
  );
};
