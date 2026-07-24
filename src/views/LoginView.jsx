'use client';

import React, { useState } from 'react';
import { AlertTriangle, Fingerprint, Lock } from 'lucide-react';
import { Eyebrow, Panel } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

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

  const field = {
    fontFamily: F_BODY, backgroundColor: T.surface,
    borderColor: error ? T.brand : T.line, color: T.ink,
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: T.sidebar }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ backgroundColor: '#fff' }}>
            <Fingerprint size={24} color={T.brand} />
          </div>
          <div className="text-xs font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.1em' }}>
            Prime Depot Hardware &amp; Construction Supply
          </div>
          <div className="text-2xl font-bold text-white mt-1" style={{ fontFamily: F_HEAD }}>Payroll System</div>
        </div>

        <Panel className="p-6" style={{ backgroundColor: T.surface, borderColor: T.line }}>
          <Eyebrow>Username</Eyebrow>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
            placeholder="e.g. admin"
            className="w-full mb-4 px-3 py-2 rounded text-sm outline-none border"
            style={{ ...field, fontFamily: F_MONO }}
          />

          <Eyebrow>Password</Eyebrow>
          <div className="relative mb-4">
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              type="password"
              autoComplete="current-password"
              disabled={busy}
              placeholder="********"
              className="w-full px-3 py-2 pr-9 rounded text-sm outline-none border"
              style={field}
            />
            <Lock size={14} className="absolute right-3 top-3" color={T.soft} />
          </div>

          {error && (
            <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded text-xs" style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-2.5 rounded text-sm font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-xs mt-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            No public sign-up. Accounts are issued only by the Operations Head. If you have forgotten your
            password, ask the Operations Head to reset it.
          </p>
        </Panel>

        <p className="text-center text-xs mt-5" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
          By signing in you agree to the{' '}
          <button onClick={() => onShowLegal('terms')} className="underline" style={{ color: '#fff' }}>Terms and Conditions</button>
          {' '}and{' '}
          <button onClick={() => onShowLegal('privacy')} className="underline" style={{ color: '#fff' }}>Privacy Policy</button>.
        </p>
      </div>
    </div>
  );
};
