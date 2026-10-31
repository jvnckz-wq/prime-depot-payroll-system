'use client';
// A peso amount in even-width digits.

import { peso } from '@/lib/utils';
import { F_MONO, T } from '@/styles/theme';

export const Money = ({ value, size = 'text-sm', bold = false, tone }) => (
  <span className={`${size} tabular-nums`} style={{ fontFamily: F_MONO, fontWeight: bold ? 600 : 400, color: tone || T.ink }}>
    {peso(value)}
  </span>
);
