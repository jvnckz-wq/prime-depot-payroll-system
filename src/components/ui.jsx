'use client';

import React from 'react';
// Package is the fallback icon for EmptyState when a caller doesn't pass one.
import { X, Check, Package, Loader2 } from 'lucide-react';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const Badge = ({ children, tone = 'neutral' }) => {
  const map = {
    green: [T.greenBg, T.green], amber: [T.amberBg, T.amber],
    red: [T.redBg, T.red], blue: [T.blueBg, T.blue],
    neutral: [T.lineSoft, T.soft],
  };
  const [bg, fg] = map[tone];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
      style={{ backgroundColor: bg, color: fg, fontFamily: F_HEAD, letterSpacing: '0.04em' }}>
      {children}
    </span>
  );
};

export const Money = ({ value, size = 'text-sm', bold = false, tone }) => (
  <span className={`${size} tabular-nums`} style={{ fontFamily: F_MONO, fontWeight: bold ? 600 : 400, color: tone || T.ink }}>
    {peso(value)}
  </span>
);

export const Panel = ({ children, className = '', style = {}, ...rest }) => (
  <div className={`rounded-md border ${className}`} style={{ backgroundColor: T.surface, borderColor: T.line, ...style }} {...rest}>
    {children}
  </div>
);

export const Eyebrow = ({ children }) => (
  <div className="text-xs font-semibold uppercase mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.08em' }}>
    {children}
  </div>
);

export const H1 = ({ children, action }) => (
  <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 className="text-2xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{children}</h1>
    </div>
    {action}
  </div>
);

export const Th = ({ children, right = false, center = false, colSpan }) => (
  <th colSpan={colSpan} className={`text-xs font-semibold uppercase px-3 py-2 ${center ? 'text-center' : right ? 'text-right' : 'text-left'}`}
    style={{ fontFamily: F_HEAD, color: T.soft, borderBottom: `1px solid ${T.line}`, letterSpacing: '0.04em' }}>
    {children}
  </th>
);
export const Td = ({ children, right = false, center = false, mono = false, colSpan, style = {} }) => (
  <td colSpan={colSpan} className={`px-3 py-2 text-sm ${center ? 'text-center' : right ? 'text-right' : 'text-left'}${mono ? ' pd-num' : ''}`}
    style={{ fontFamily: mono ? F_MONO : F_BODY, color: T.ink, borderBottom: `1px solid ${T.lineSoft}`, ...style }}>
    {children}
  </td>
);

export const StatCard = ({ label, value, tone = 'neutral', icon: Icon, onClick }) => {
  const fg = { green: T.green, amber: T.amber, red: T.red, blue: T.blue, neutral: T.ink }[tone];
  const clickable = typeof onClick === 'function';
  return (
    <Panel
      className={`p-4${clickable ? ' cursor-pointer pd-card-hover' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <Eyebrow>{label}</Eyebrow>
        {Icon && <Icon size={16} color={T.soft} />}
      </div>
      <div className="text-2xl font-bold pd-num" style={{ fontFamily: F_MONO, color: fg }}>{value}</div>
    </Panel>
  );
};

export const BigStat = ({ value, label, tone = T.ink }) => (
  <div className="text-center px-2">
    <div className="text-3xl font-bold leading-none tabular-nums" style={{ fontFamily: F_MONO, color: tone }}>{value}</div>
    <div className="text-xs mt-2 whitespace-nowrap font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>{label}</div>
  </div>
);

export const Av = ({ name = '?', size = 32, tone = T.ink }) => {
  const initials = name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-white font-semibold"
      style={{ width: size, height: size, backgroundColor: tone, fontFamily: F_HEAD, fontSize: size * 0.36 }}>
      {initials || '?'}
    </div>
  );
};

export const EmptyState = ({ icon: Icon = Package, title, desc, action }) => (
  <div className="text-center py-12 px-6">
    <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: T.lineSoft }}>
      <Icon size={20} color={T.soft} />
    </div>
    <div className="text-sm font-semibold mb-1" style={{ fontFamily: F_BODY, color: T.ink }}>{title}</div>
    {desc && <div className="text-xs max-w-xs mx-auto mb-4" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{desc}</div>}
    {action}
  </div>
);

export const ProgressBar = ({ pct, tone = T.green }) => (
  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.lineSoft, width: 100 }}>
    <div className="h-full rounded-full pd-progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: tone }} />
  </div>
);

// Shimmering placeholder used while data loads (see .pd-skeleton in globals.css).
export const Skeleton = ({ w = '100%', h = 12, r = 6, className = '', style = {} }) => (
  <span className={`pd-skeleton ${className}`} aria-hidden="true"
    style={{ display: 'inline-block', width: w, height: h, borderRadius: r, ...style }} />
);

// Skeleton placeholders for tables (rows of cells) and panels (stacked lines).
export const SkeletonRows = ({ cols = 4, rows = 3 }) =>
  Array.from({ length: rows }).map((_, r) => (
    <tr key={`skr-${r}`}>
      {Array.from({ length: cols }).map((_, c) => (
        <Td key={c}><Skeleton w={c === 0 ? 110 : 64} /></Td>
      ))}
    </tr>
  ));

export const SkeletonBlock = ({ lines = 4, avatar = true }) => (
  <div className="p-4 flex flex-col gap-3" aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        {avatar && <Skeleton w={30} h={30} r="50%" />}
        <Skeleton w={140} />
        <div style={{ flex: 1 }} />
        <Skeleton w={70} />
      </div>
    ))}
  </div>
);

export const Btn = ({ children, onClick, variant = 'dark', icon: Icon, size = 'md', disabled = false, full = false, loading = false }) => {
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 12 : 14;
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-2 text-sm' };
  const variants = {
    dark: { backgroundColor: T.ink, color: '#fff' },
    outline: { backgroundColor: 'transparent', color: T.ink, border: `1.5px solid ${T.line}` },
    amber: { backgroundColor: T.amber, color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: T.soft },
  };
  return (
    <button onClick={onClick} disabled={isDisabled} data-variant={variant}
      className={`pd-btn inline-flex items-center gap-1.5 rounded font-semibold ${sizes[size]} ${full ? 'w-full justify-center' : ''}`}
      style={{ fontFamily: F_HEAD, opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer', ...variants[variant] }}>
      {loading ? <Loader2 size={iconSize} className="pd-spin" /> : (Icon && <Icon size={iconSize} />)}
      {children}
    </button>
  );
};

export const Field = ({ label, children }) => (
  <div>
    {label && <Eyebrow>{label}</Eyebrow>}
    {children}
  </div>
);
export const inputCls = "w-full px-3 py-2 rounded text-sm outline-none border";
export const inputStyle = { fontFamily: F_BODY, borderColor: T.line, color: T.ink };

export const Modal = ({ open, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div className="pd-overlay fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(27,36,48,0.55)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="pd-modal w-full rounded-lg overflow-hidden flex flex-col" style={{ backgroundColor: T.surface, maxWidth: width, maxHeight: '88vh' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <span className="text-sm font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</span>
          <button onClick={onClose}><X size={16} color={T.soft} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const Confirm = ({ open, onConfirm, onCancel, title, message, confirmLabel = 'Confirm', danger = false, busy = false }) => {
  if (!open) return null;
  return (
    <div className="pd-overlay fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(27,36,48,0.55)' }}>
      <div className="pd-modal w-full rounded-lg p-6" style={{ backgroundColor: T.surface, maxWidth: 360 }}>
        <div className="text-base font-bold mb-2" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</div>
        <div className="text-sm mb-5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{message}</div>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onCancel} disabled={busy}>Cancel</Btn>
          <Btn variant={danger ? 'amber' : 'dark'} onClick={onConfirm} loading={busy}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
};

export const Toasts = ({ toasts }) => (
  <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2" style={{ maxWidth: 320 }}>
    {toasts.map(t => (
      <div key={t.id} className="pd-toast px-4 py-3 rounded-md text-sm flex items-center gap-2 shadow-lg"
        style={{ fontFamily: F_BODY, backgroundColor: t.type === 'error' ? T.red : T.ink, color: '#fff' }}>
        {t.type === 'error' ? <X size={14} /> : <Check size={14} />} {t.msg}
      </div>
    ))}
  </div>
);

/* ============================= NAV ============================= */
