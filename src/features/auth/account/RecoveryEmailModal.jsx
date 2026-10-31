'use client';
// Dialog to add or change the recovery email: send a code to the new address, then confirm it.

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Btn, Field, Modal, inputCls, inputStyle } from '@/components/ui';
import { F_BODY, T } from '@/styles/theme';
import { PasswordInput } from '@/features/auth/AccountView.jsx';
import { isEmail } from '@/lib/email-format';
import CodeBoxes from '@/components/CodeBoxes';
import { flagEmptyRequired } from '@/lib/field-rules';

export const RecoveryEmailModal = ({ open, user, toast, onClose, onUserChange }) => {
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('edit');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const addr = email.trim().toLowerCase();

  const sendCode = async () => {
    if (busy) return;
    setError('');
    if (!isEmail(addr)) { setError('Enter a valid email address.'); flagEmptyRequired(); return; }
    if (!password) { setError('Enter your current password.'); flagEmptyRequired(); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-email/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, email: addr }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send the code.'); return; }
      setStep('verify'); setCode(''); setCooldown(60);
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    if (busy) return;
    setError('');
    if (code.length !== 6) { setError('Enter the 6-digit code sent to your email.'); flagEmptyRequired(); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-email/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, email: addr, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'That code did not match. Try again.'); return; }
      const saved = data.email || addr;
      if (onUserChange) onUserChange({ email: saved });
      toast('Recovery email updated.');
      onClose();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Recovery email" width={440}>
      {step === 'edit' ? (
        <>
          <Field label="Recovery email">
            <input required data-field="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false}
              className={inputCls} style={inputStyle} />
          </Field>
          <div className="text-xs mt-2" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            A code is sent to this address; the new address is saved only after you enter it.
          </div>
          <div className="mt-3">
            <Field label="Current password">
              <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          </div>
        </>
      ) : (
        <>
          <div className="text-xs px-3 py-2.5 rounded"
            style={{ backgroundColor: '#EAF2FB', color: '#1B4E8A', fontFamily: F_BODY, lineHeight: 1.5 }}>
            We sent a 6-digit code to <span style={{ fontWeight: 700 }}>{addr}</span>. Enter it to confirm this inbox is yours.
          </div>
          <div className="mt-3">
            <Field label="Verification code">
              <CodeBoxes value={code} onChange={setCode} label="Code" />
            </Field>
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
          style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {step === 'edit' ? (
          <Btn onClick={sendCode} loading={busy} disabled={busy}>{busy ? 'Sending...' : 'Send code'}</Btn>
        ) : (
          <Btn onClick={verify} loading={busy} disabled={busy}>{busy ? 'Verifying...' : 'Verify and save'}</Btn>
        )}
        <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
      </div>

      {step === 'verify' && (
        <div className="text-xs mt-3" style={{ fontFamily: F_BODY, color: T.soft }}>
          {cooldown > 0 ? (
            <span>Didn&apos;t receive it? You can resend in {cooldown}s.</span>
          ) : (
            <button type="button" onClick={sendCode} disabled={busy}
              className="pd-link" style={{ opacity: busy ? 0.6 : 1 }}>
              Didn&apos;t receive the code? Resend it
            </button>
          )}
        </div>
      )}
    </Modal>
  );
};
