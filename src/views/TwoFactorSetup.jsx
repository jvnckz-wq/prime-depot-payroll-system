'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, Check } from 'lucide-react';
import { Btn, Field, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';
import { GateShell } from './AccountView.jsx';

// Enforced two-factor enrollment, shown to an admin who has not set it up yet.
// Step 1: scan the QR (or key it in) and confirm a code. Step 2: save the
// one-time backup codes. Only after finishing does the app become reachable.
export default function TwoFactorSetup({ user, onDone }) {
  const [step, setStep] = useState('setup');
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The server refuses setup once two-factor is on (it will not replace a
  // working secret). Seen only when this page is out of date, e.g. setup was
  // finished in another tab; there is nothing to set up, so let them through.
  const [alreadyOn, setAlreadyOn] = useState(false);

  // Fetch a fresh secret + QR when the screen opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 409) { setAlreadyOn(true); return; }
        if (!res.ok) { setError(data.error || 'Could not start setup.'); return; }
        setSecret(data.secret);
        setQr(data.qrDataUrl);
      } catch {
        if (!cancelled) setError('Could not reach the server. Refresh and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    if (busy) return;
    setError('');
    if (code.trim().length < 6) { setError('Enter the 6-digit code from your app.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not enable two-factor.'); return; }
      setCodes(data.backupCodes || []);
      setStep('backup');
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const copyCodes = () => {
    try { navigator.clipboard.writeText(codes.join('\n')); } catch { /* clipboard blocked — the Download option still works */ }
  };

  const downloadCodes = () => {
    try {
      const blob = new Blob(
        [`Prime Depot Payroll — backup codes for ${user.username}\n\n${codes.join('\n')}\n\nEach code works once. Keep them somewhere safe and private.\n`],
        { type: 'text/plain' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'prime-depot-backup-codes.txt';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* download blocked — the Copy option still works */ }
  };

  const errorBox = error && (
    <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
      style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
    </div>
  );

  if (alreadyOn) {
    return (
      <GateShell username={user.username} icon="shield" title="Two-factor is already on"
        subtitle="This account is already protected by two-factor login.">
        <Btn onClick={() => onDone && onDone()} full>Continue to dashboard</Btn>
      </GateShell>
    );
  }

  if (step === 'backup') {
    return (
      <GateShell username={user.username} icon="shield" title="Save your backup codes"
        subtitle="If you lose your phone, these are the only way back in.">
        <div className="grid grid-cols-2 gap-2 mb-3">
          {codes.map((c) => (
            <span key={c} className="text-center rounded py-2 text-sm"
              style={{ fontFamily: F_MONO, letterSpacing: '0.06em', backgroundColor: '#F4F5F7', color: T.ink }}>
              {c}
            </span>
          ))}
        </div>
        <div className="flex items-start gap-2 px-3 py-2.5 rounded text-xs mb-3"
          style={{ backgroundColor: '#FBF1DC', color: '#8a5a00', fontFamily: F_BODY, lineHeight: 1.5 }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Each code works once. Store them somewhere safe and private. They will not be shown again.</span>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={copyCodes} className="pd-clickable flex-1 rounded border text-sm font-semibold py-2"
            style={{ fontFamily: F_HEAD, borderColor: T.line, color: T.ink, backgroundColor: '#fff' }}>Copy</button>
          <button type="button" onClick={downloadCodes} className="pd-clickable flex-1 rounded border text-sm font-semibold py-2"
            style={{ fontFamily: F_HEAD, borderColor: T.line, color: T.ink, backgroundColor: '#fff' }}>Download .txt</button>
        </div>
        <button type="button" onClick={() => setSaved(s => !s)}
          className="pd-clickable flex items-center gap-2 mt-3 text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
          <span className="inline-flex items-center justify-center rounded" style={{
            width: 16, height: 16, border: `1.5px solid ${saved ? T.brand : T.soft}`,
            backgroundColor: saved ? T.brand : 'transparent',
          }}>{saved && <Check size={11} color="#fff" />}</span>
          I have saved these codes somewhere safe.
        </button>
        <div className="mt-4">
          <Btn onClick={() => onDone && onDone()} disabled={!saved} full>Finish and go to dashboard</Btn>
        </div>
      </GateShell>
    );
  }

  return (
    <GateShell username={user.username} icon="shield" title="Set up two-factor login"
      subtitle="Scan the code with an authenticator app, then enter the 6-digit code it shows.">
      {loading ? (
        <div className="flex items-center justify-center py-10" style={{ color: T.soft }}>
          <Loader2 size={20} className="pd-spin" />
        </div>
      ) : (
        <>
          {qr && (
            <div className="flex justify-center mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR is a generated data URL, next/image adds nothing */}
              <img src={qr} alt="Two-factor QR code" width={176} height={176}
                style={{ border: `6px solid #fff`, borderRadius: 8 }} />
            </div>
          )}
          <span className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: T.soft, letterSpacing: '0.06em' }}>
            Or enter this key manually
          </span>
          <div className="text-center rounded px-3 py-2 mb-3 text-sm break-all"
            style={{ fontFamily: F_MONO, letterSpacing: '0.06em', backgroundColor: '#F4F5F7', color: T.ink }}>
            {secret}
          </div>
          <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.55 }}>
            Use Google Authenticator, Microsoft Authenticator, or any TOTP app.
          </div>
          <Field label="6-digit code from your app">
            <input
              value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="------"
              className={inputCls} style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: F_MONO }}
            />
          </Field>
          {errorBox}
          <div className="mt-4">
            <Btn onClick={enable} loading={busy} disabled={busy} full>
              {busy ? 'Enabling...' : 'Enable two-factor login'}
            </Btn>
          </div>
        </>
      )}
      {loading && errorBox}
    </GateShell>
  );
}
