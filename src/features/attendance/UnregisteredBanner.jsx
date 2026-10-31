'use client';
// Warning bar shown when scans come from biometric IDs that no employee is registered to.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { F_BODY, F_HEAD, T } from '@/styles/theme';

export const UnregisteredBanner = ({ count, onOpen }) => (count > 0 ? (
  <button type="button" onClick={onOpen} className="pd-clickable w-full text-left mb-3 flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: T.warnBg, border: `1px solid ${T.line}` }}>
    <AlertTriangle size={16} color={T.warn} className="shrink-0" aria-hidden="true" />
    <span className="flex-1 min-w-0 text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>
      {count} {count === 1 ? 'employee is' : 'employees are'} not registered
    </span>
    <span className="text-xs font-semibold shrink-0" style={{ fontFamily: F_HEAD, color: T.brand }}>View Unmapped IDs →</span>
  </button>
) : null);
