'use client';
// An indented row under a My Account heading, such as the two-factor settings.

import React from 'react';
import { F_HEAD, T } from '@/styles/theme';

export const SubRow = ({ label, children }) => (
  <div className="flex items-center gap-4 flex-wrap py-3 pl-4"
    style={{ borderLeft: `2px solid ${T.lineSoft}`, marginLeft: 2 }}>
    <div className="text-sm font-semibold flex-1 min-w-0" style={{ fontFamily: F_HEAD, color: T.ink }}>{label}</div>
    <div className="flex items-center gap-3 shrink-0">{children}</div>
  </div>
);
