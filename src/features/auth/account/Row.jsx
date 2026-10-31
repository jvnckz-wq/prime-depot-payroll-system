'use client';
// One labelled row on My Account, with its buttons on the right.

import React from 'react';
import { F_HEAD, T } from '@/styles/theme';

export const Row = ({ label, children, last = false }) => (
  <div className="flex items-center gap-4 sm:gap-6 flex-wrap py-4"
    style={{ borderBottom: last ? 'none' : `1px solid ${T.lineSoft}` }}>
    <div className="text-sm font-semibold flex-1 min-w-0" style={{ fontFamily: F_HEAD, color: T.ink }}>{label}</div>
    <div className="flex items-center gap-3 shrink-0">{children}</div>
  </div>
);
