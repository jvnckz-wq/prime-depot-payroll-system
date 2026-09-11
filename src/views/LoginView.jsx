'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

// Remembers, on this device, that the person already accepted the Terms — so a
// returning user finds the box pre-checked instead of ticking it every sign-in.
const TERMS_KEY = 'pd_terms_agreed';

// Decorative Canva line-art for the crimson half (files live in /public/login).
// Positions are percentages of the panel: the worker sits centre, tools scatter around it.
const ART = [
  { src: 'saw',         left: '30%',  top: '-16%', w: '45%', rot: 20, op: 0.5 },
  { src: 'hammer',      left: '66%',  top: '3%',  w: '45%', rot: 0,  op: 0.5 },
  { src: 'screw',       left: '-16%',  top: '-10%',  w: '45%', rot: 0,  op: 0.5 },
  { src: 'level',       left: '-20%',  top: '33%', w: '45%', rot: 0,  op: 0.5 },
  { src: 'wrench',      left: '3%',  top: '69%', w: '47%', rot: 0, op: 0.5 },
  { src: 'drill',       left: '50%',  top: '69%', w: '45%', rot: 0,   op: 0.5 },
  { src: 'screwdriver', left: '73%',  top: '45%', w: '47%', rot: 0,  op: 0.5 },
  { src: 'worker',      left: '27%',  top: '25%', w: '45%', rot: 0,   op: 0.9 },
];

// Password rules shown live on the reset screen. Kept in step with
// validatePassword() on the server (lib/auth.js) — same five checks.
const PW_RULES = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['One uppercase letter', (p) => /[A-Z]/.test(p)],
  ['One lowercase letter', (p) => /[a-z]/.test(p)],
  ['One number', (p) => /[0-9]/.test(p)],
  ['One symbol (! # @ ? ^ *)', (p) => /[^A-Za-z0-9]/.test(p)],
];
const pwMeetsAll = (p) => PW_RULES.every(([, test]) => test(p));

// The "forgot password" flow, shown inside the sign-in panel. Two steps:
// request a code (username → email), then verify it and set a new password.
// The API answers the request step generically, so this screen never reveals
// whether an account or a recovery email exists.
function ForgotPassword({ onBack }) {
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Seconds until another code may be requested. Mirrors the server's 60s
  // resend throttle, so the "Resend" link is only offered once it will work.
  const [cooldown, setCooldown] = useState(0);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const field = {
    fontFamily: F_BODY, backgroundColor: '#F4F5F7', color: T.ink,
    border: `1px solid ${error ? T.brand : 'transparent'}`,
  };

  // Handles the first send and every resend. A resend keeps the user on the
  // verify step and just refreshes the notice and the cooldown.
  const request = async () => {
    if (busy) return;
    setError('');
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) { setError('Enter the recovery email you registered.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
      const data = await res.json();
      // The server answers the same way whether or not the address is on file,
      // so the notice is worded to be true either way.
      setNotice(data.message || 'If that account has a recovery email on file, a reset code has been sent.');
      setStep('verify');
      setCooldown(60);
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    if (busy) return;
    setError('');
    if (!code.trim()) { setError('Enter the 6-digit code from your email.'); return; }
    if (!pwMeetsAll(pw)) { setError('Your new password does not meet all the requirements below.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code, newPassword: pw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not reset the password.'); return; }
      onBack('Password reset. Please sign in with your new password.');
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: F_HEAD, color: T.ink }}>Reset password</h1>
      <p className="text-sm mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
        {step === 'request'
          ? 'Enter your recovery email and a one-time code will be sent to it.'
          : 'Enter the code from your email and choose a new password.'}
      </p>

      {step === 'verify' && notice && (
        <div className="mb-4 px-3 py-2.5 rounded-lg text-xs" style={{ backgroundColor: '#EAF2FB', fontFamily: F_BODY, color: '#1B4E8A' }}>
          {notice}
        </div>
      )}

      {step === 'request' ? (
        <>
          <label className="block text-sm mb-1.5" style={{ color: T.soft }}>Recovery email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            placeholder="you@example.com" disabled={busy}
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none" style={field} />
        </>
      ) : (
        <>
          <label className="block text-sm mb-1.5" style={{ color: T.soft }}>Reset code</label>
          <input value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="6-digit code" disabled={busy}
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none" style={{ ...field, fontFamily: F_MONO, letterSpacing: '0.3em' }} />

          <label className="block text-sm mb-1.5 mt-4" style={{ color: T.soft }}>New password</label>
          <div className="relative">
            <input value={pw} onChange={e => setPw(e.target.value)} type={showPw ? 'text' : 'password'} autoComplete="new-password" disabled={busy}
              className="w-full px-4 py-2.5 pr-11 rounded-lg text-sm outline-none" style={field} />
            <button type="button" onClick={() => setShowPw(s => !s)} tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: T.soft }}>
              {showPw ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>

          {/* Requirements — same five the server enforces. Collapses to a single
              line once the password satisfies all of them. */}
          {pw && (
            <div className="mt-2">
              {pwMeetsAll(pw) ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.green }}>
                  <CheckCircle2 size={13} className="shrink-0" /><span>All password requirements met</span>
                </div>
              ) : (
                <ul className="space-y-1">
                  {PW_RULES.map(([label, test]) => {
                    const ok = test(pw);
                    return (
                      <li key={label} className="flex items-center gap-1.5 text-xs" style={{ fontFamily: F_BODY, color: ok ? T.green : T.soft }}>
                        {ok ? <CheckCircle2 size={13} className="shrink-0" /> : <Circle size={13} className="shrink-0" />}
                        <span>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <label className="block text-sm mb-1.5 mt-4" style={{ color: T.soft }}>Confirm new password</label>
          <div className="relative">
            <input value={pw2} onChange={e => setPw2(e.target.value)} type={showPw ? 'text' : 'password'} autoComplete="new-password" disabled={busy}
              className="w-full px-4 py-2.5 pr-11 rounded-lg text-sm outline-none" style={field} />
            <button type="button" onClick={() => setShowPw(s => !s)} tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3" style={{ color: T.soft }}>
              {showPw ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          {pw2 && pw !== pw2 && (
            <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: T.red }}>Passwords do not match yet.</div>
          )}
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg text-xs" style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <button onClick={step === 'request' ? () => request() : reset} disabled={busy} data-variant="amber"
        className="pd-btn w-full py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 mt-6"
        style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff', opacity: busy ? 0.6 : 1 }}>
        {busy && <Loader2 size={14} className="pd-spin" />}
        {busy ? 'Please wait…' : (step === 'request' ? 'Send code' : 'Reset password')}
      </button>

      {step === 'verify' && (
        <div className="text-center mt-4 text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
          {cooldown > 0 ? (
            <span>Didn&apos;t receive it? You can resend in {cooldown}s.</span>
          ) : (
            <button type="button" onClick={() => request()} disabled={busy}
              className="underline" style={{ color: T.brand, opacity: busy ? 0.6 : 1 }}>
              Didn&apos;t receive the code? Resend it
            </button>
          )}
        </div>
      )}

      <div className="text-center mt-3">
        <button type="button" onClick={() => onBack()} className="text-xs underline" style={{ fontFamily: F_BODY, color: T.soft }}>
          Back to sign in
        </button>
      </div>
    </>
  );
}

export const LoginView = ({ onSignedIn, onShowLegal }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'login' or 'forgot' — the sign-in panel doubles as the password-reset flow.
  const [mode, setMode] = useState('login');
  const [resetDone, setResetDone] = useState('');
  // After a correct password on a 2FA account, the panel switches to a code step
  // instead of signing straight in.
  const [awaiting2FA, setAwaiting2FA] = useState(false);
  const [tfaCode, setTfaCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  // Pre-check the Terms box if this device accepted them on a past sign-in.
  // Read after mount so server and client render the same first paint.
  useEffect(() => {
    try { if (localStorage.getItem(TERMS_KEY) === '1') setAgreed(true); } catch { /* storage blocked — leave unchecked */ }
  }, []);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms and Conditions and Privacy Policy first.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not sign in.');
        setPassword('');
        return;
      }
      // Remember the acceptance on this device for next time.
      try { localStorage.setItem(TERMS_KEY, '1'); } catch { /* storage blocked — no memory, box just re-ticks next time */ }
      if (data.twoFactorRequired) { setAwaiting2FA(true); setPassword(''); return; }
      onSignedIn(data.user);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Enter submits, which is what anyone typing a password expects.
  const onKeyDown = (e) => { if (e.key === 'Enter') submit(); };

  // Second step for a 2FA account: send the authenticator code (or a backup
  // code) to complete the pending session.
  const verify2FA = async () => {
    if (busy) return;
    setError('');
    if (!tfaCode.trim()) { setError(useBackup ? 'Enter a backup code.' : 'Enter your 6-digit code.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/2fa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: tfaCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The pending sign-in is gone (expired, or ended after too many wrong
        // codes), so the only way on is the password again.
        if (res.status === 401 || res.status === 429) { setAwaiting2FA(false); setUseBackup(false); }
        setError(data.error || 'Could not verify the code.');
        setTfaCode('');
        return;
      }
      onSignedIn(data.user);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const backToSignIn = () => {
    setAwaiting2FA(false); setTfaCode(''); setUseBackup(false); setError(''); setPassword('');
  };

  const fieldStyle = {
    fontFamily: F_BODY, backgroundColor: '#F4F5F7', color: T.ink,
    border: `1px solid ${error ? T.brand : 'transparent'}`,
  };

  return (
    <div className="min-h-screen flex bg-white" style={{ fontFamily: F_BODY }}>
      {/* ---------- Form half (centered) ---------- */}
      <div className="w-full lg:w-1/2 relative flex items-center justify-center px-6">
        <span
          className="absolute top-8 left-8 inline-flex items-center gap-2.5"
          style={{ fontFamily: F_HEAD, fontWeight: 800, fontSize: 30, letterSpacing: '-0.015em', color: T.brand }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo from /public; next/image adds no value here */}
          <img src="/logo.png" alt="" style={{ width: 40, height: 40 }} />
          Prime Depot
        </span>

        <div className="w-full max-w-sm">
        {awaiting2FA ? (
        <>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: F_HEAD, color: T.ink }}>Two-factor login</h1>
          <p className="text-sm mb-6" style={{ color: T.soft, lineHeight: 1.6 }}>
            {useBackup
              ? 'Enter one of your backup codes to finish signing in.'
              : 'Enter the 6-digit code from your authenticator app to finish signing in.'}
          </p>

          <label className="block text-sm mb-1.5" style={{ color: T.soft }}>
            {useBackup ? 'Backup code' : 'Authentication code'}
          </label>
          <input
            value={tfaCode}
            onChange={e => setTfaCode(useBackup
              ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9)
              : e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            onKeyDown={e => { if (e.key === 'Enter') verify2FA(); }}
            inputMode={useBackup ? 'text' : 'numeric'}
            autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} disabled={busy}
            placeholder={useBackup ? 'XXXX-XXXX' : '------'}
            className="w-full px-4 py-2.5 rounded-lg text-base outline-none"
            style={{ ...fieldStyle, textAlign: 'center', letterSpacing: '0.34em', fontFamily: F_MONO }}
          />

          {error && (
            <div className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg text-xs" style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          <button onClick={verify2FA} disabled={busy} data-variant="amber"
            className="pd-btn w-full py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 mt-6"
            style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff', opacity: busy ? 0.6 : 1 }}>
            {busy && <Loader2 size={14} className="pd-spin" />}
            {busy ? 'Please wait…' : 'Verify'}
          </button>

          <div className="text-center mt-4">
            <button type="button" onClick={() => { setUseBackup(!useBackup); setTfaCode(''); setError(''); }}
              className="text-xs underline" style={{ fontFamily: F_BODY, color: T.brand }}>
              {useBackup ? 'Use your authenticator app instead' : 'Use a backup code instead'}
            </button>
          </div>
          <div className="text-center mt-2">
            <button type="button" onClick={backToSignIn} className="text-xs underline" style={{ fontFamily: F_BODY, color: T.soft }}>
              Back to sign in
            </button>
          </div>
        </>
        ) : mode === 'forgot' ? (
          <ForgotPassword
            onBack={(msg) => { setMode('login'); setError(''); if (msg) setResetDone(msg); }}
          />
        ) : (
        <>
          <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: F_HEAD, color: T.ink }}>Sign In</h1>

          {resetDone && (
            <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg text-xs"
              style={{ backgroundColor: '#E9F7EF', fontFamily: F_BODY, color: '#1B7A43' }}>
              <span>{resetDone}</span>
            </div>
          )}

          <label className="block text-sm mb-1.5" style={{ color: T.soft }}>Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={fieldStyle}
          />

          <label className="block text-sm mb-1.5 mt-4" style={{ color: T.soft }}>Password</label>
          <div className="relative">
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              disabled={busy}
              className="w-full px-4 py-2.5 pr-11 rounded-lg text-sm outline-none"
              style={fieldStyle}
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3"
              style={{ color: T.soft }}
            >
              {/* Icon shows the STATE: hidden → covered eye; visible → open eye. */}
              {showPw ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg text-xs"
              style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Explicit consent the panel asked for. Ticked automatically on a
              device that has accepted before, so it is a one-time step per
              browser rather than a friction on every sign-in. */}
          <div className="flex items-start gap-2 mt-5 text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
            <input
              id="agree-terms"
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              disabled={busy}
              className="mt-0.5 shrink-0"
              style={{ accentColor: T.brand, width: 15, height: 15 }}
            />
            <label htmlFor="agree-terms" className="cursor-pointer leading-snug">
              I agree to the{' '}
              <button type="button" onClick={() => onShowLegal('terms')} className="underline" style={{ color: T.brand }}>Terms and Conditions</button>
              {' '}and{' '}
              <button type="button" onClick={() => onShowLegal('privacy')} className="underline" style={{ color: T.brand }}>Privacy Policy</button>.
            </label>
          </div>

          <button
            onClick={submit}
            disabled={busy || !agreed}
            data-variant="amber"
            className="pd-btn w-full py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 mt-4"
            style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff', opacity: (busy || !agreed) ? 0.6 : 1, cursor: (busy || !agreed) ? 'not-allowed' : 'pointer' }}
          >
            {busy && <Loader2 size={14} className="pd-spin" />}
            {busy ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="text-center mt-4">
            <button type="button" onClick={() => { setMode('forgot'); setError(''); setResetDone(''); }}
              className="text-xs underline" style={{ fontFamily: F_BODY, color: T.soft }}>
              Forgot your password?
            </button>
          </div>
        </>
        )}
        </div>
      </div>

      {/* ---------- Crimson half (full-bleed, no white) ---------- */}
      <div className="hidden lg:block lg:w-1/2">
        <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: T.brand }}>
          {ART.map((t) => (
            <div
              key={t.src}
              aria-hidden="true"
              className="absolute select-none"
              style={{
                left: t.left, top: t.top, width: t.w, aspectRatio: '1',
                backgroundImage: `url(/login/${t.src}.svg)`,
                backgroundSize: 'contain', backgroundRepeat: 'no-repeat',
                transform: `rotate(${t.rot}deg)`, opacity: t.op,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
