'use client';

import React, { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, Check, LogOut, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Btn, Confirm, Eyebrow, Field, Panel, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';
import { ChangePasswordPanel } from './AccountView.jsx';
import { AccountsPanel } from './AccountsPanel.jsx';
/* eslint-disable @next/next/no-img-element -- user avatars are base64 data URIs; next/image adds no value and cannot optimize data URIs */

/// Everything about the person using the system, in one place: their picture
/// and name, the password protecting the account, and — for the Operations
/// Head — the accounts of everyone else.
///
/// Kept separate from Settings on purpose. Settings holds company
/// configuration: statutory tables, the fleet, double-rate areas. Those are
/// facts about the business. This page is about a person.

const Avatar = ({ user, size = 96 }) => {
  const initials = (user.displayName || user.username)
    .split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (user.avatar) {
    return (
      <img src={user.avatar} alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: `2px solid ${T.line}` }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: T.brand, color: '#fff', fontFamily: F_HEAD, fontWeight: 700, fontSize: size / 2.8 }}>
      {initials}
    </div>
  );
};

export const AccountPage = ({ user, toast, onBack, onUserChange, onSignedOut }) => {
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState(user.displayName);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmRemovePic, setConfirmRemovePic] = useState(false);
  const fileRef = useRef(null);

  const nameChanged = name.trim() && name.trim() !== user.displayName;

  const patch = async (body, okMessage) => {
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not save.', 'error'); return false; }
    if (onUserChange) onUserChange(data.user);
    if (okMessage) toast(okMessage);
    return true;
  };

  const saveName = async () => {
    setSavingName(true);
    try { await patch({ displayName: name }, 'Name updated.'); }
    catch { toast('Could not reach the server.', 'error'); }
    finally { setSavingName(false); }
  };

  /// Shrinks the picture in the browser before it is ever sent.
  ///
  /// A phone photo is several megabytes; an avatar is displayed at 96px.
  /// Resizing here means the database stores a few kilobytes instead of
  /// several megabytes, and the upload finishes on a slow connection.
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
        // Square crop from the centre, so portraits are not squashed.
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
    e.target.value = ''; // let the same file be chosen again after a failure
    if (!file) return;

    if (!/^image\//.test(file.type)) { toast('Choose an image file.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('That image is very large. Choose one under 10MB.', 'error'); return; }

    setUploading(true);
    try {
      const dataUrl = await resize(file);
      await patch({ avatar: dataUrl }, 'Profile picture updated.');
    } catch (err) {
      toast(err.message || 'Could not process that image.', 'error');
    } finally { setUploading(false); }
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

  const tabs = [['profile', 'Profile'], ['security', 'Security']];
  if (user.role === 'ADMIN') tabs.push(['accounts', 'Account Access']);

  return (
    <div className="p-6">
      {onBack && (
        <div className="mb-4">
          <Btn variant="outline" size="sm" icon={ArrowLeft} onClick={onBack}>Back</Btn>
        </div>
      )}

      {/* Identity header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Avatar user={user} size={72} />
        <div className="min-w-0">
          <div className="text-2xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{user.displayName}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>{user.username}</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: T.brandBg, color: T.brandDark }}>
              {user.role === 'ADMIN' ? 'Operations Head' : 'Checker'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b overflow-x-auto" style={{ borderColor: T.lineSoft }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
            style={{
              fontFamily: F_HEAD,
              color: tab === k ? T.ink : T.soft,
              borderBottom: tab === k ? `2px solid ${T.brand}` : '2px solid transparent',
            }}>{label}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="max-w-lg">
          <Panel className="p-5 mb-4">
            <Eyebrow>Profile Picture</Eyebrow>
            <div className="flex items-center gap-5 mt-3 flex-wrap">
              <Avatar user={user} size={96} />
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
                <Btn size="sm" icon={Camera} onClick={() => fileRef.current?.click()} loading={uploading} disabled={uploading}>
                  {uploading ? 'Working...' : user.avatar ? 'Change picture' : 'Upload picture'}
                </Btn>
                {user.avatar && (
                  <Btn size="sm" variant="outline" icon={Trash2} onClick={() => setConfirmRemovePic(true)} disabled={uploading}>
                    Remove
                  </Btn>
                )}
              </div>
            </div>
            <div className="text-xs mt-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              The image is cropped square and shrunk to 128px before it is saved, so a photo straight
              from a phone is fine.
            </div>
          </Panel>

          <Panel className="p-5">
            <Eyebrow>Details</Eyebrow>
            <div className="mt-3">
              <Field label="Display name">
                <input value={name} onChange={e => setName(e.target.value)} className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Username">
                <input value={user.username} readOnly className={inputCls}
                  style={{ ...inputStyle, fontFamily: F_MONO, backgroundColor: T.bg, color: T.soft }} />
              </Field>
              <Field label="Role">
                <input value={user.role === 'ADMIN' ? 'Operations Head' : 'Checker'} readOnly className={inputCls}
                  style={{ ...inputStyle, backgroundColor: T.bg, color: T.soft }} />
              </Field>
            </div>
            <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Your username and role cannot be changed here. The username is your sign-in identity and is
              attached to every record this account has created; only the Operations Head can change a role.
            </div>
            {nameChanged && (
              <div className="mt-4 flex gap-2">
                <Btn size="sm" icon={Check} onClick={saveName} loading={savingName} disabled={savingName}>
                  {savingName ? 'Saving...' : 'Save changes'}
                </Btn>
                <Btn size="sm" variant="outline" onClick={() => setName(user.displayName)}>Cancel</Btn>
              </div>
            )}
          </Panel>
        </div>
      )}

      {tab === 'security' && (
        <div className="max-w-lg">
          <Panel className="p-5 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={15} color={T.brand} />
              <span className="text-base font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>Change password</span>
            </div>
            <div className="text-xs mb-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Your password is stored as a one-way hash — nobody can read it back, not even the
              administrator. If you forget it, it has to be reset rather than looked up.
            </div>
            <ChangePasswordPanel toast={toast} />
          </Panel>

          <Panel className="p-5">
            <Eyebrow>Sessions</Eyebrow>
            <div className="flex items-center justify-between gap-4 mt-2 flex-wrap">
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
                Last sign-in
                <div className="text-xs mt-0.5" style={{ fontFamily: F_MONO, color: T.soft }}>{fmt(user.lastLoginAt)}</div>
              </div>
              <Btn size="sm" variant="outline" icon={LogOut} onClick={() => setConfirmSignOut(true)}>
                Sign out everywhere
              </Btn>
            </div>
            <div className="text-xs mt-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Use this if you signed in on a shared computer and are not sure you signed out. It ends
              every session for this account, including this one.
            </div>
          </Panel>
        </div>
      )}

      {tab === 'accounts' && user.role === 'ADMIN' && (
        <div>
          <div className="flex items-start gap-2 mb-4 p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Users size={15} color={T.soft} className="mt-0.5 shrink-0" />
            <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Accounts for everyone who signs in. There is no public registration — every account is
              created here by hand, and issued with a temporary password the person replaces on first use.
            </span>
          </div>
          <AccountsPanel currentUser={user} toast={toast} />
        </div>
      )}

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

export { Avatar as UserAvatar };
