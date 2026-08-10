'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { F_BODY, F_HEAD, T } from '../theme';

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

export const LoginView = ({ onSignedIn, onShowLegal }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
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
      onSignedIn(data.user);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Enter submits, which is what anyone typing a password expects.
  const onKeyDown = (e) => { if (e.key === 'Enter') submit(); };

  const fieldStyle = {
    fontFamily: F_BODY, backgroundColor: '#F4F5F7', color: T.ink,
    border: `1px solid ${error ? T.brand : 'transparent'}`,
  };

  return (
    <div className="min-h-screen flex bg-white" style={{ fontFamily: F_BODY }}>
      {/* ---------- Form half (centered) ---------- */}
      <div className="w-full lg:w-1/2 relative flex items-center justify-center px-6">
        <span
          className="absolute top-8 left-8"
          style={{ fontFamily: F_HEAD, fontWeight: 800, fontSize: 30, letterSpacing: '-0.015em', color: T.brand }}
        >
          Prime Depot
        </span>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: F_HEAD, color: T.ink }}>Sign In</h1>

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
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Password"
            type="password"
            autoComplete="current-password"
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={fieldStyle}
          />

          {error && (
            <div
              className="flex items-start gap-2 mt-4 px-3 py-2.5 rounded-lg text-xs"
              style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy}
            data-variant="amber"
            className="pd-btn w-full py-3 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 mt-6"
            style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff', opacity: busy ? 0.6 : 1 }}
          >
            {busy && <Loader2 size={14} className="pd-spin" />}
            {busy ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-xs mt-5" style={{ fontFamily: F_BODY, color: T.soft }}>
            By signing in you agree to the{' '}
            <button onClick={() => onShowLegal('terms')} className="underline" style={{ color: T.brand }}>Terms and Conditions</button>
            {' '}and{' '}
            <button onClick={() => onShowLegal('privacy')} className="underline" style={{ color: T.brand }}>Privacy Policy</button>.
          </p>
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
