'use client';
// Table header and cell with shared alignment and number styling.

import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';

export const Th = ({ children, right = false, center = false, num = false, money = false, action = false, colSpan, style = {} }) => {
  const align = money || right ? 'text-right' : num || action || center ? 'text-center' : 'text-left';
  return (
    <th colSpan={colSpan} className={`text-xs font-semibold uppercase px-4 py-2.5 ${align}${action ? ' whitespace-nowrap' : ''}`}
      style={{ fontFamily: F_HEAD, color: T.soft, borderBottom: `1px solid ${T.line}`, letterSpacing: '0.04em', backgroundColor: '#FAF8F7', ...style }}>
      {children}
    </th>
  );
};
export const Td = ({ children, right = false, center = false, mono = false, num = false, money = false, action = false, colSpan, style = {} }) => {
  const align = money || right ? 'text-right' : num || action || center ? 'text-center' : 'text-left';
  const digits = mono || num || money;
  return (
    <td colSpan={colSpan} className={`px-4 py-2.5 text-sm ${align}${digits ? ' pd-num whitespace-nowrap' : ''}${action ? ' whitespace-nowrap' : ''}`}
      style={{ fontFamily: digits ? F_MONO : F_BODY, color: T.ink, borderBottom: `1px solid ${T.lineSoft}`, ...(digits ? { fontVariantNumeric: 'tabular-nums' } : {}), ...style }}>
      {action ? <div className="pd-actions inline-flex items-center justify-center gap-2">{children}</div> : children}
    </td>
  );
};
