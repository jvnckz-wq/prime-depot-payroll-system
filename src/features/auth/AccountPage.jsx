'use client';
// My Account page: profile, password, recovery email, two-factor, sessions, and checker accounts for the admin.

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, Eye, EyeOff,
  KeyRound, Pencil, RefreshCw, ShieldCheck, Smartphone, User, Users,
} from 'lucide-react';
import { Btn, Confirm, Modal, inputCls, inputStyle } from '@/components/ui';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { ChangePasswordPanel } from '@/features/auth/AccountView.jsx';
import { AccountsPanel } from '@/features/settings/AccountsPanel.jsx';
import { personNameError } from '@/lib/field-rules';
import { AccountAvatar } from '@/features/auth/account/AccountAvatar.jsx';
import { Row } from '@/features/auth/account/Row.jsx';
import { SubRow } from '@/features/auth/account/SubRow.jsx';
import { RecoveryEmailModal } from '@/features/auth/account/RecoveryEmailModal.jsx';
import { RegenerateModal } from '@/features/auth/account/RegenerateModal.jsx';
import { ReenrollModal } from '@/features/auth/account/ReenrollModal.jsx';

const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}\u2022\u2022\u2022@${domain}`;
};

const roleName = (role) => (role === 'ADMIN' ? 'Operations Head' : 'Checker');

export const AccountPage = ({ user, toast, onBack, onUserChange, onSignedOut, onGoToEmployees }) => {
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

  const loadBackupCount = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      const n = data?.user?.backupCodesRemaining;
      if (typeof n === 'number') setBackupRemaining(n);
    } catch { }
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
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (trimmed === user.displayName) { setEditingName(false); return; }
    const nameErr = personNameError(trimmed, 'Name');
    if (nameErr) { toast(nameErr, 'error'); return; }
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

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 sm:px-10 py-8 mx-auto" style={{ maxWidth: 820 }}>

          {section === 'account' && (
            <>
              <h1 className="text-2xl font-bold mb-5" style={{ fontFamily: F_HEAD, color: T.ink }}>Account</h1>

              <div className="flex items-center gap-5 flex-wrap pb-5" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                <div className="relative shrink-0">
                  <AccountAvatar user={user} size={68} />
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
                      <input value={name} maxLength={80} onChange={e => setName(e.target.value)} autoFocus
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
                          className="pd-icon-btn" aria-label="Edit name">
                          <Pencil size={15} color={T.soft} />
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
                    className="pd-link text-xs" style={{ fontFamily: F_BODY }}>
                    Remove picture
                  </button>
                )}
              </div>

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
                        className="pd-icon-btn" aria-label={revealEmail ? 'Hide email' : 'Show email'}>
                        {revealEmail ? <EyeOff size={15} color={T.soft} /> : <Eye size={15} color={T.soft} />}
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
            <AccountsPanel currentUser={user} toast={toast} onGoToEmployees={onGoToEmployees} />
          )}
        </div>
      </div>

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
        confirmLabel="Remove picture" danger
        onCancel={() => setConfirmRemovePic(false)}
        onConfirm={() => { setConfirmRemovePic(false); removePicture(); }}
      />
    </div>
  );
};
