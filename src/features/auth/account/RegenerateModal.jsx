'use client';
// Dialog to replace all two-factor backup codes with a new set of ten.

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Btn, Field, Modal } from '@/components/ui';
import { F_BODY, T } from '@/styles/theme';
import { PasswordInput } from '@/features/auth/AccountView.jsx';
import CodeBoxes from '@/components/CodeBoxes';
import { flagEmptyRequired } from '@/lib/field-rules';
import { BackupCodeList } from '@/features/auth/account/BackupCodeList.jsx';

const REGEN_URL = '/api/auth/2fa/backup-codes/regenerate';

export const RegenerateModal = ({ open, toast, onClose, onDone }) => {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newCodes, setNewCodes] = useState(null);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!password) { setError('Enter your current password.'); flagEmptyRequired(); return; }
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); flagEmptyRequired(); return; }
    setBusy(true);
    try {
      const res = await fetch(REGEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not regenerate the codes.'); return; }
      setNewCodes(data.backupCodes || []);
      if (onDone) onDone();
    } catch { setError('Could not reach the server. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Regenerate backup codes" width={440}>
      {newCodes ? (
        <>
          <BackupCodeList codes={newCodes} toast={toast} />
          <div className="mt-4"><Btn full onClick={onClose}>Done</Btn></div>
        </>
      ) : (
        <>
          <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            This replaces all your current backup codes with a new set of ten. The old codes stop working.
          </div>
          <Field label="Current password">
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <div className="mt-3">
            <Field label="Authenticator code">
              <CodeBoxes value={code} onChange={setCode} label="Code" />
            </Field>
          </div>
          {error && (
            <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
              style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Btn onClick={submit} loading={busy} disabled={busy}>{busy ? 'Working...' : 'Regenerate'}</Btn>
            <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
          </div>
        </>
      )}
    </Modal>
  );
};
