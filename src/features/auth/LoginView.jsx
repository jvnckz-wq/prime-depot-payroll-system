'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { AlertTriangle, Loader2, Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react';
import { F_BODY, F_HEAD, F_MONO, T } from '@/components/theme';
import { isEmail } from '@/lib/email-format';

const TERMS_KEY = 'pd_terms_agreed';

const subscribeNoop = () => () => {};
const readTermsAgreed = () => {
  try { return localStorage.getItem(TERMS_KEY) === '1'; } catch { return false; } // storage blocked: leave unchecked
};
const serverTermsAgreed = () => false;

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

const PW_RULES = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['One uppercase letter', (p) => /[A-Z]/.test(p)],
  ['One lowercase letter', (p) => /[a-z]/.test(p)],
  ['One number', (p) => /[0-9]/.test(p)],
  ['One symbol (! # @ ? ^ *)', (p) => /[^A-Za-z0-9]/.test(p)],
];
const pwMeetsAll = (p) => PW_RULES.every(([, test]) => test(p));

function ForgotPassword({ onBack }) {
  const [step, setStep] = useState('username');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const field = {
    fontFamily: F_BODY, backgroundColor: '#F4F5F7', color: T.ink,
    border: `1px solid ${error ? T.brand : 'transparent'}`,
  };

  const post = async (payload) => {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  const checkUsername = async () => {
    if (busy) return;
    setError('');
    const name = username.trim().toLowerCase();
    if (!name) { setError('Enter your username.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await post({ username: name });
      if (!ok) { setError(data.error || 'Could not continue. Try again.'); return; }
      if (data.next === 'email') { setStep('email'); return; }
      setNotice(data.message || '');
      setStep('info');
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const confirmEmail = async () => {
    if (busy) return;
    setError('');
    const addr = email.trim().toLowerCase();
    if (!isEmail(addr)) { setError('Enter a valid email address, for example name@gmail.com.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await post({ username: username.trim().toLowerCase(), email: addr });
      if (!ok) { setError(data.error || 'Could not continue. Try again.'); return; }
      setNotice(data.message || '');
      setStep('code');
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
        body: JSON.stringify({ username: username.trim().toLowerCase(), email: email.trim().toLowerCase(), code, newPassword: pw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not reset the password.'); return; }
      onBack('Password reset. Please sign in with your new password.');
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const onEnter = (fn) => (e) => { if (e.key === 'Enter') fn(); };
  const intro = {
    username: 'Enter your username to start.',
    email: 'Confirm the recovery email registered to this account. The code is sent only if it matches.',
    code: 'Enter the code from your email and choose a new password.',
    info: '',
  }[step];
  const action = { username: [checkUsername, 'Continue'], email: [confirmEmail, 'Send code'], code: [reset, 'Reset password'] }[step];

  return (
    <>
      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: F_HEAD, color: T.ink }}>Reset password</h1>
      {intro && (
        <p className="text-sm mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{intro}</p>
      )}

      {step === 'info' && (
        <div role="status" className="flex items-start gap-2 mt-4 mb-2 px-3 py-3 rounded-lg text-sm" style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: '#7A4B12', lineHeight: 1.5 }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      )}

      {step === 'code' && notice && (
        <div className="mb-4 px-3 py-2.5 rounded-lg text-xs" style={{ backgroundColor: '#EAF2FB', fontFamily: F_BODY, color: '#1B4E8A' }}>
          {notice}
        </div>
      )}

      {step === 'username' && (
        <>
          <label className="block text-sm mb-1.5" style={{ color: T.soft }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={onEnter(checkUsername)} autoComplete="username" autoCapitalize="none" spellCheck={false}
            disabled={busy} aria-label="Username" className="w-full px-4 py-2.5 rounded-lg text-sm outline-none" style={field} />
        </>
      )}

      {step === 'email' && (
        <>
          <label className="block text-sm mb-1.5" style={{ color: T.soft }}>Recovery email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onEnter(confirmEmail)} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            placeholder="name@gmail.com" disabled={busy} aria-label="Recovery email" className="w-full px-4 py-2.5 rounded-lg text-sm outline-none" style={field} />
        </>
      )}

      {step === 'code' && (
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
        <div role="alert" className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg text-xs" style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {action && (
        <button onClick={action[0]} disabled={busy} data-variant="amber"
          className="pd-btn w-full py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 mt-6"
          style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff', opacity: busy ? 0.6 : 1 }}>
          {busy && <Loader2 size={14} className="pd-spin" />}
          {busy ? 'Please wait…' : action[1]}
        </button>
      )}

      {step === 'code' && (
        <div className="text-center mt-4 text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
          {cooldown > 0 ? (
            <span>Didn&apos;t receive it? You can resend in {cooldown}s.</span>
          ) : (
            <button type="button" onClick={confirmEmail} disabled={busy}
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

export const LoginView = ({ onSignedIn, onShowLegal, notice = '' }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const storedAgreed = useSyncExternalStore(subscribeNoop, readTermsAgreed, serverTermsAgreed);
  const [agreedChoice, setAgreed] = useState(null);
  const agreed = agreedChoice ?? storedAgreed;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('login');
  const [resetDone, setResetDone] = useState('');
  const [awaiting2FA, setAwaiting2FA] = useState(false);
  const [tfaCode, setTfaCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

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
      try { localStorage.setItem(TERMS_KEY, '1'); } catch { /* storage blocked — no memory, box just re-ticks next time */ }
      if (data.twoFactorRequired) { setAwaiting2FA(true); setPassword(''); return; }
      onSignedIn(data.user);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => { if (e.key === 'Enter') submit(); };

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

          {notice && !resetDone && (
            <div role="status" className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg text-xs"
              style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: '#7A4B12' }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

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
