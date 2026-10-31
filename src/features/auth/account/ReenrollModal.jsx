'use client';
// Dialog to move two-factor sign-in to a new phone: confirm it is you, then scan a new code.

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Btn, Field, Modal } from '@/components/ui';
import { F_BODY, F_MONO, T } from '@/styles/theme';
import { PasswordInput } from '@/features/auth/AccountView.jsx';
import CodeBoxes, { formatBackup } from '@/components/CodeBoxes';
import { flagEmptyRequired } from '@/lib/field-rules';
/* eslint-disable @next/next/no-img-element -- avatars and TOTP QR codes are base64 data URIs; next/image cannot optimize data URIs and adds no value */

const REENROLL_START_URL = '/api/auth/2fa/reenroll/start';
const REENROLL_CONFIRM_URL = '/api/auth/2fa/reenroll/confirm';

export const ReenrollModal = ({ open, toast, onClose }) => {
  const [step, setStep] = useState('auth');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const start = async () => {
    if (busy) return;
    setError('');
    if (!password) { setError('Enter your current password.'); flagEmptyRequired(); return; }
    if (code.length !== (useBackupCode ? 8 : 6)) { setError(useBackupCode ? 'Enter all 8 characters of a backup code.' : 'Enter all 6 digits of your code.'); return; }
    setBusy(true);
    try {
      const res = await fetch(REENROLL_START_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, code: useBackupCode ? formatBackup(code) : code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not start re-enrollment.'); return; }
      setSecret(data.secret || ''); setQr(data.qrDataUrl || ''); setCode(''); setStep('scan');
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (busy) return;
    setError('');
    if (code.length !== 6) { setError('Enter the 6-digit code from your new authenticator app.'); flagEmptyRequired(); return; }
    setBusy(true);
    try {
      const res = await fetch(REENROLL_CONFIRM_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'That code did not match. Try again.'); return; }
      toast('New authenticator enrolled.');
      onClose();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Re-enroll authenticator" width={440}>
      {step === 'auth' ? (
        <>
          <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            Confirm it is you, then scan the new code with your new phone. Your current authenticator keeps
            working until the new one is confirmed.
          </div>
          <Field label="Current password">
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <div className="mt-3">
            <Field label={useBackupCode ? 'Backup code' : 'Current authenticator code'}>
              <CodeBoxes key={useBackupCode ? 'b' : 't'} value={code} onChange={setCode} backup={useBackupCode} label={useBackupCode ? 'Backup code' : 'Authenticator code'} />
            </Field>
            <button type="button" onClick={() => { setUseBackupCode(!useBackupCode); setCode(''); }} className="pd-link text-xs mt-2" style={{ fontFamily: F_BODY }}>
              {useBackupCode ? 'Use your authenticator app instead' : 'Use a backup code instead'}
            </button>
          </div>
          {error && (
            <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
              style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Btn onClick={start} loading={busy} disabled={busy}>{busy ? 'Checking...' : 'Continue'}</Btn>
            <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          </div>
        </>
      ) : (
        <>
          <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            Scan this with your new authenticator app, then enter the 6-digit code it shows.
          </div>
          <div className="flex justify-center mb-3">
            {qr
              ? <img src={qr} alt="Authenticator QR code" style={{ width: 176, height: 176 }} />
              : <div style={{ width: 176, height: 176, backgroundColor: T.bg, borderRadius: 8 }} />}
          </div>
          {secret && (
            <div className="text-xs text-center mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>
              Or enter this key: <span style={{ fontFamily: F_MONO, color: T.ink }}>{secret}</span>
            </div>
          )}
          <Field label="Code from the new app">
            <CodeBoxes value={code} onChange={setCode} label="Code from the new app" />
          </Field>
          {error && (
            <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
              style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Btn onClick={confirm} loading={busy} disabled={busy}>{busy ? 'Confirming...' : 'Confirm new device'}</Btn>
            <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          </div>
        </>
      )}
    </Modal>
  );
};
