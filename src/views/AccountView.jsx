'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { Btn, Confirm, Eyebrow, Field, Panel, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

// Password strength rules shown live as the user types. These MUST stay in step
// with validatePassword() on the server (lib/auth.js) — the server is the real
// gate, so if these drift the meter would say "Strong" on a password the API
// rejects. A show/hide toggle and a strength bar round out the reference design.
const PASSWORD_RULES = [
  { key: 'len', label: 'Minimum of 8 characters', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'At least one Upper case character', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'At least one Lower case character', test: (p) => /[a-z]/.test(p) },
  { key: 'number', label: 'At least one number [0-9]', test: (p) => /[0-9]/.test(p) },
  { key: 'symbol', label: 'At least one of these symbols: ! # @ ? ^ *', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// True only when every rule passes — used as the submit gate and "Strong" state.
const passwordMeetsAll = (p) => PASSWORD_RULES.every((r) => r.test(p));

// Password field with a show/hide (eye) toggle. Flipping the type keeps the
// value; the toggle is skipped by Tab so it never steals focus from the form.
function PasswordInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${inputCls} pr-10`}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-3"
        style={{ color: T.soft }}
      >
        {/* Icon shows the STATE: hidden password → covered eye (EyeOff);
            visible password → open eye (Eye). */}
        {show ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
    </div>
  );
}

// Live strength bar + requirements checklist, modelled on the reference design.
// Each rule turns green with a filled check the moment it is satisfied.
function PasswordStrength({ value }) {
  const passed = PASSWORD_RULES.filter((r) => r.test(value)).length;
  const pct = (passed / PASSWORD_RULES.length) * 100;
  const [barColor, word] =
    passed === 0 ? [T.line, '']
    : passed <= 2 ? [T.red, 'Weak']
    : passed <= 4 ? [T.amber, 'Fair']
    : [T.green, 'Strong'];
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3 mb-2.5">
        <div className="h-1.5 rounded-full flex-1 overflow-hidden" style={{ backgroundColor: T.lineSoft }}>
          <div className="h-full rounded-full pd-progress-fill" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        </div>
        {word && <span className="text-xs font-semibold shrink-0" style={{ fontFamily: F_HEAD, color: barColor }}>{word}</span>}
      </div>
      {/* #A1 — the requirements checklist has done its job once every rule
          passes, so it collapses into a single confirmation line instead of
          staying on screen as a wall of green ticks. */}
      {passwordMeetsAll(value) ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.green }}>
          <CheckCircle2 size={13} className="shrink-0" /><span>All password requirements met</span>
        </div>
      ) : (
        <>
          <div className="text-xs font-semibold mb-1.5" style={{ fontFamily: F_HEAD, color: T.soft }}>
            Your password must contain:
          </div>
          <ul className="space-y-1">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.key} className="flex items-center gap-1.5 text-xs" style={{ fontFamily: F_BODY, color: ok ? T.green : T.soft }}>
                  {ok ? <CheckCircle2 size={13} className="shrink-0" /> : <Circle size={13} className="shrink-0" />}
                  <span>{r.label}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

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
    if (!passwordMeetsAll(next)) { setError('Your new password does not meet all the requirements below.'); return; }

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
        <PasswordInput value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <div className="mt-3">
        <Field label="New password">
          <PasswordInput value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        {next && <PasswordStrength value={next} />}
      </div>
      <div className="mt-3">
        <Field label="Confirm new password">
          <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {confirm && next !== confirm && (
          <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: T.red }}>Passwords do not match yet.</div>
        )}
      </div>

      <div className="text-xs mt-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
        Changing your password signs out every other device using this account.
      </div>

      {error && (
        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
          style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className={compact ? 'mt-4' : 'mt-4 flex'}>
        <Btn onClick={submit} loading={busy} disabled={busy} full={compact}>
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
              <Btn size="sm" onClick={saveName} loading={savingName} disabled={savingName}>
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
          <Btn size="sm" variant="outline" onClick={() => setConfirmSignOut(true)}>
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
