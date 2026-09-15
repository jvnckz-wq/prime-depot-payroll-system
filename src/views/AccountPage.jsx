'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Camera, Copy, Download, Eye, EyeOff,
  KeyRound, Pencil, RefreshCw, ShieldCheck, Smartphone, User, Users,
} from 'lucide-react';
import { Btn, Confirm, Field, Modal, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';
import { ChangePasswordPanel, EMAIL_RE, PasswordInput } from './AccountView.jsx';
import { AccountsPanel } from './AccountsPanel.jsx';
/* eslint-disable @next/next/no-img-element -- avatars and TOTP QR codes are base64 data URIs; next/image cannot optimize data URIs and adds no value */

// Endpoints the two-factor management calls. The recovery-email, password,
// picture, name, and sessions actions all use endpoints that already exist; the
// two below are added in the backend batch that follows this UI.
const REGEN_URL = '/api/auth/2fa/backup-codes/regenerate';
const REENROLL_START_URL = '/api/auth/2fa/reenroll/start';
const REENROLL_CONFIRM_URL = '/api/auth/2fa/reenroll/confirm';

/// Shows the account holder's picture, or their initials when none is set.
const Avatar = ({ user, size = 64 }) => {
  const initials = (user.displayName || user.username)
    .split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  if (user.avatar) {
    return (
      <img src={user.avatar} alt="" className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: `2px solid ${T.line}` }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: T.brand, color: '#fff', fontFamily: F_HEAD, fontWeight: 700, fontSize: size / 2.7 }}>
      {initials}
    </div>
  );
};

// j•••@gmail.com, enough to recognise your own address, not enough to read out.
const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}\u2022\u2022\u2022@${domain}`;
};

/// One settings line: a bold label on the left, and a value plus its action on
/// the right. The shared shape is what keeps the whole page aligned.
const Row = ({ label, children, last = false }) => (
  <div className="flex items-center gap-4 sm:gap-6 flex-wrap py-4"
    style={{ borderBottom: last ? 'none' : `1px solid ${T.lineSoft}` }}>
    <div className="text-sm font-semibold flex-1 min-w-0" style={{ fontFamily: F_HEAD, color: T.ink }}>{label}</div>
    <div className="flex items-center gap-3 flex-shrink-0">{children}</div>
  </div>
);

// A two-factor detail line, indented under the Two-factor row.
const SubRow = ({ label, children }) => (
  <div className="flex items-center gap-4 flex-wrap py-3 pl-4"
    style={{ borderLeft: `2px solid ${T.lineSoft}`, marginLeft: 2 }}>
    <div className="text-sm font-semibold flex-1 min-w-0" style={{ fontFamily: F_HEAD, color: T.ink }}>{label}</div>
    <div className="flex items-center gap-3 flex-shrink-0">{children}</div>
  </div>
);

const roleName = (role) => (role === 'ADMIN' ? 'Operations Head' : 'Checker');

/// Recovery email change, current password, then a code sent to the new address
/// must be entered before it replaces the old one, so a mistyped or someone
/// else's address can never be saved. Shown in a dialog off the Account page.
const RecoveryEmailModal = ({ open, user, toast, onClose, onUserChange }) => {
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
    if (!EMAIL_RE.test(addr)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your current password.'); return; }
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
    if (code.length !== 6) { setError('Enter the 6-digit code sent to your email.'); return; }
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
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
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
              <input value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="------"
                className={inputCls} style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: F_MONO }} />
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
              className="underline" style={{ color: T.brand, opacity: busy ? 0.6 : 1 }}>
              Didn&apos;t receive the code? Resend it
            </button>
          )}
        </div>
      )}
    </Modal>
  );
};

/// The one-time list of new backup codes, with copy and download. Shown once,
/// after enabling or regenerating, and never retrievable again.
const BackupCodeList = ({ codes, toast }) => {
  const copyAll = () => {
    if (navigator?.clipboard) navigator.clipboard.writeText(codes.join('\n')).then(() => toast('Codes copied.'), () => {});
  };
  const download = () => {
    const blob = new Blob([`Prime Depot backup codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'prime-depot-backup-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 p-3 rounded" style={{ backgroundColor: T.bg }}>
        {codes.map((c, i) => (
          <div key={i} className="text-sm text-center py-1" style={{ fontFamily: F_MONO, color: T.ink }}>{c}</div>
        ))}
      </div>
      <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
        style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
        <AlertTriangle size={13} color={T.warn} className="mt-0.5 shrink-0" />
        <span>Save these somewhere safe. They are shown only once and replace any earlier codes.</span>
      </div>
      <div className="flex gap-2 mt-3">
        <Btn size="sm" variant="outline" icon={Copy} onClick={copyAll}>Copy</Btn>
        <Btn size="sm" variant="outline" icon={Download} onClick={download}>Download</Btn>
      </div>
    </div>
  );
};

/// Regenerate backup codes, proves it is really you (current password plus a
/// current authenticator or backup code), then issues ten fresh codes.
const RegenerateModal = ({ open, toast, onClose, onDone }) => {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newCodes, setNewCodes] = useState(null);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!password) { setError('Enter your current password.'); return; }
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
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
              <input value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="------"
                className={inputCls} style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: F_MONO }} />
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

/// Re-enroll a new authenticator (a replaced or lost phone). Step one proves it
/// is you; step two enrols the new app and only then swaps the secret, so a
/// half-finished re-enrol never locks the account out.
const ReenrollModal = ({ open, toast, onClose }) => {
  const [step, setStep] = useState('auth');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    if (busy) return;
    setError('');
    if (!password) { setError('Enter your current password.'); return; }
    if (!code.trim()) { setError('Enter a code from your current app, or a backup code.'); return; }
    setBusy(true);
    try {
      const res = await fetch(REENROLL_START_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, code }),
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
    if (code.length !== 6) { setError('Enter the 6-digit code from your new authenticator app.'); return; }
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
            <Field label="Current authenticator code or a backup code">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, '').slice(0, 9))}
                autoComplete="one-time-code" placeholder="000000 or XXXX-XXXX"
                className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
            </Field>
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
            <input value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="------"
              className={inputCls} style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: F_MONO }} />
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

/// The whole account, on one full-screen surface: a left rail with the sections
/// and a Back out to the app, and the settings themselves on the right.
export const AccountPage = ({ user, toast, onBack, onUserChange, onSignedOut }) => {
  const isAdmin = user.role === 'ADMIN';
  const [section, setSection] = useState('account');

  const [name, setName] = useState(user.displayName);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [revealEmail, setRevealEmail] = useState(false);
  const [backupRemaining, setBackupRemaining] = useState(null);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [reenrollOpen, setReenrollOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmRemovePic, setConfirmRemovePic] = useState(false);
  const fileRef = useRef(null);

  // How many one-time backup codes are still unused. Comes from /me; stays null
  // (and the count simply isn't shown) until that field is available.
  const loadBackupCount = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      const n = data?.user?.backupCodesRemaining;
      if (typeof n === 'number') setBackupRemaining(n);
    } catch { /* leave the count hidden */ }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- run once on mount for the admin's 2FA card
  useEffect(() => { if (isAdmin && user.totpEnabled) loadBackupCount(); }, []);

  const patch = async (body, okMessage) => {
    const res = await fetch('/api/auth/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not save.', 'error'); return false; }
    if (onUserChange) onUserChange(data.user);
    if (okMessage) toast(okMessage);
    return true;
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.displayName) { setEditingName(false); setName(user.displayName); return; }
    setSavingName(true);
    try { if (await patch({ displayName: trimmed }, 'Name updated.')) setEditingName(false); }
    catch { toast('Could not reach the server.', 'error'); }
    finally { setSavingName(false); }
  };

  const resize = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image.'));
      img.onload = () => {
        const SIZE = 128;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Choose an image file.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('That image is very large. Choose one under 10MB.', 'error'); return; }
    setUploading(true);
    try {
      const dataUrl = await resize(file);
      await patch({ avatar: dataUrl }, 'Profile picture updated.');
    } catch (err) { toast(err.message || 'Could not process that image.', 'error'); }
    finally { setUploading(false); }
  };

  const removePicture = async () => {
    setUploading(true);
    try { await patch({ avatar: null }, 'Profile picture removed.'); }
    finally { setUploading(false); }
  };

  const signOutEverywhere = async () => {
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      if (!res.ok) { toast('Could not sign out.', 'error'); return; }
      if (onSignedOut) onSignedOut();
    } catch { toast('Could not reach the server.', 'error'); }
  };

  const fmt = (iso) => iso
    ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never';

  const nav = [['account', 'Account', User]];
  if (isAdmin) nav.push(['access', 'Account Access', Users]);

  const RailItem = ({ id, label, Icon }) => {
    const active = section === id;
    return (
      <button onClick={() => setSection(id)}
        aria-current={active ? 'page' : undefined}
        className="pd-nav-item relative w-full flex items-center gap-3 pl-5 pr-3 py-3 text-sm text-left"
        style={{
          fontFamily: F_BODY,
          fontWeight: active ? 600 : 400,
          color: active ? '#FFFFFF' : T.sidebarSoft,
          backgroundColor: active ? T.sidebarActiveBg : undefined,
        }}>
        {active && (
          <span aria-hidden="true"
            style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: '0 3px 3px 0', backgroundColor: T.sidebarAccent }} />
        )}
        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} color={active ? T.sidebarAccent : 'currentColor'} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: T.bg, fontFamily: F_BODY }}>
      {/* Left rail, same crimson as the app sidebar, for a seamless hand-off */}
      <aside className="shrink-0 flex flex-col h-full" style={{ width: 236, backgroundColor: T.sidebar, borderRight: `1px solid ${T.sidebarLine}` }}>
        <div className="py-3">
          <button onClick={onBack}
            className="pd-nav-item w-full flex items-center gap-3 pl-5 pr-3 py-3 text-sm text-left"
            style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>
            <ArrowLeft size={17} strokeWidth={1.9} />
            <span className="truncate">Back</span>
          </button>
          <div className="mt-2 flex flex-col">
            {nav.map(([id, label, Icon]) => <RailItem key={id} id={id} label={label} Icon={Icon} />)}
          </div>
        </div>
      </aside>

      {/* Right, the settings themselves */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 sm:px-10 py-8 mx-auto" style={{ maxWidth: 820 }}>

          {section === 'account' && (
            <>
              <h1 className="text-2xl font-bold mb-5" style={{ fontFamily: F_HEAD, color: T.ink }}>Account</h1>

              {/* Identity block, no card, no banner */}
              <div className="flex items-center gap-5 flex-wrap pb-5" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                <div className="relative shrink-0">
                  <Avatar user={user} size={68} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Change picture"
                    className="absolute -right-1 -bottom-1 rounded-full flex items-center justify-center pd-clickable"
                    style={{ width: 28, height: 28, backgroundColor: '#fff', border: `1px solid ${T.line}`, color: T.soft }}>
                    <Camera size={14} />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
                </div>

                <div className="min-w-0 flex-1">
                  {editingName ? (
                    <div className="max-w-sm">
                      <input value={name} onChange={e => setName(e.target.value)} autoFocus
                        className={inputCls} style={{ ...inputStyle, fontSize: 18, fontWeight: 600 }} />
                      <div className="mt-2 flex gap-2">
                        <Btn size="sm" onClick={saveName} loading={savingName} disabled={savingName}>
                          {savingName ? 'Saving...' : 'Save'}
                        </Btn>
                        <Btn size="sm" variant="outline" onClick={() => { setEditingName(false); setName(user.displayName); }}>Cancel</Btn>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl font-bold truncate" style={{ fontFamily: F_HEAD, color: T.ink }}>{user.displayName}</span>
                        <button onClick={() => { setName(user.displayName); setEditingName(true); }} title="Edit name"
                          className="rounded-md flex items-center justify-center pd-clickable"
                          style={{ width: 27, height: 27, border: `1px solid ${T.line}`, color: T.soft }}>
                          <Pencil size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2.5 mt-1.5">
                        <span className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>{user.username}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ fontFamily: F_HEAD, backgroundColor: T.brandBg, color: T.brandDark }}>{roleName(user.role)}</span>
                      </div>
                    </>
                  )}
                </div>

                {user.avatar && !editingName && (
                  <button onClick={() => setConfirmRemovePic(true)} disabled={uploading}
                    className="text-xs pd-clickable" style={{ fontFamily: F_BODY, color: T.soft }}>
                    Remove picture
                  </button>
                )}
              </div>

              {/* Security rows */}
              <Row label="Password">
                <Btn size="sm" variant="outline" icon={KeyRound} onClick={() => setPwdOpen(true)}>Change</Btn>
              </Row>

              {isAdmin && user.totpEnabled && (
                <>
                  <div className="flex items-center gap-4 flex-wrap pt-4 pb-1">
                    <div className="text-sm font-semibold flex-1 min-w-0 flex items-center gap-2" style={{ fontFamily: F_HEAD, color: T.ink }}>
                      <ShieldCheck size={15} color={T.brand} />Two-factor authentication
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                      style={{ fontFamily: F_HEAD, backgroundColor: T.greenBg, color: T.green, letterSpacing: '0.02em' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: T.green }} />On
                    </span>
                  </div>
                  <div className="pb-2" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                    <SubRow label="Authenticator app">
                      <Btn size="sm" variant="outline" icon={Smartphone} onClick={() => setReenrollOpen(true)}>Re-enroll device</Btn>
                    </SubRow>
                    <SubRow label="Backup codes">
                      {typeof backupRemaining === 'number' && (
                        <span className="text-sm" style={{ fontFamily: F_MONO, color: backupRemaining <= 3 ? T.warn : T.soft }}>
                          <span className="font-bold">{backupRemaining}</span> of 10 left
                        </span>
                      )}
                      <Btn size="sm" variant="outline" icon={RefreshCw} onClick={() => setRegenOpen(true)}>Regenerate</Btn>
                    </SubRow>
                  </div>
                </>
              )}

              {isAdmin && (
                <Row label="Recovery email">
                  {user.email ? (
                    <>
                      <span className="text-sm" style={{ fontFamily: F_MONO, color: T.ink }}>
                        {revealEmail ? user.email : maskEmail(user.email)}
                      </span>
                      <button onClick={() => setRevealEmail(v => !v)} title={revealEmail ? 'Hide' : 'Reveal'}
                        className="pd-clickable" style={{ color: T.brand }}>
                        {revealEmail ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </>
                  ) : (
                    <span className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>Not set</span>
                  )}
                  <Btn size="sm" variant="outline" onClick={() => setEmailOpen(true)}>{user.email ? 'Change' : 'Add'}</Btn>
                </Row>
              )}

              <Row label="Sessions" last>
                <span className="text-sm hidden sm:inline" style={{ fontFamily: F_BODY, color: T.soft }}>Last sign-in {fmt(user.lastLoginAt)}</span>
                <Btn size="sm" variant="outline" onClick={() => setConfirmSignOut(true)}>Sign out everywhere</Btn>
              </Row>
            </>
          )}

          {section === 'access' && isAdmin && (
            <AccountsPanel currentUser={user} toast={toast} />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Change password" width={440}>
        <ChangePasswordPanel toast={toast} twoFactor={!!user.totpEnabled} onDone={() => setPwdOpen(false)} />
      </Modal>

      <RecoveryEmailModal key={emailOpen ? 'em-1' : 'em-0'} open={emailOpen} user={user} toast={toast}
        onClose={() => setEmailOpen(false)} onUserChange={onUserChange} />

      <RegenerateModal key={regenOpen ? 'rg-1' : 'rg-0'} open={regenOpen} toast={toast}
        onClose={() => setRegenOpen(false)} onDone={loadBackupCount} />

      <ReenrollModal key={reenrollOpen ? 're-1' : 're-0'} open={reenrollOpen} toast={toast} onClose={() => setReenrollOpen(false)} />

      <Confirm
        open={confirmSignOut}
        title="Sign out everywhere?"
        message="Every device signed in as this account will be signed out, including this one. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => { setConfirmSignOut(false); signOutEverywhere(); }}
      />
      <Confirm
        open={confirmRemovePic}
        title="Remove profile picture?"
        message="Your initials will be shown instead. You can upload a new picture anytime."
        confirmLabel="Remove picture"
        onCancel={() => setConfirmRemovePic(false)}
        onConfirm={() => { setConfirmRemovePic(false); removePicture(); }}
      />
    </div>
  );
};
