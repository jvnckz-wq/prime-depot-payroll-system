'use client';
// The signed-in user's round picture on My Account, or their initials when there is none.

import React from 'react';
import { F_HEAD, T } from '@/styles/theme';
/* eslint-disable @next/next/no-img-element -- avatars and TOTP QR codes are base64 data URIs; next/image cannot optimize data URIs and adds no value */

export const AccountAvatar = ({ user, size = 64 }) => {
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
