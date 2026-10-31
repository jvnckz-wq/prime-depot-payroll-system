'use client';

import { Loader2 } from 'lucide-react';
import { F_BODY, F_HEAD, T } from '@/styles/theme';

export const Btn = ({ children, onClick, variant = 'dark', icon: Icon, size = 'md', disabled = false, full = false, fullMobile = false, loading = false }) => {
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 12 : 14;
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-2 text-sm min-h-11 sm:min-h-0' };
  const variants = {
    dark: { backgroundColor: T.ink, color: '#fff' },
    outline: { backgroundColor: 'transparent', color: T.ink, border: `1.5px solid ${T.line}` },
    amber: { backgroundColor: T.amber, color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: T.ink, border: `1.5px solid ${T.line}` },
  };
  return (
    <button onClick={onClick} disabled={isDisabled} data-variant={variant}
      className={`pd-btn inline-flex items-center gap-1.5 rounded font-semibold ${sizes[size]} ${full ? 'w-full justify-center' : fullMobile ? 'w-full justify-center sm:w-auto' : ''}`}
      style={{ fontFamily: F_HEAD, opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer', ...variants[variant] }}>
      {loading ? <Loader2 size={iconSize} className="pd-spin" /> : (Icon && <Icon size={iconSize} />)}
      {children}
    </button>
  );
};

export const Chip = ({ on = false, onClick, disabled = false, children, title, ariaLabel }) => (
  <button type="button" className="pd-chip" data-on={on ? 'true' : 'false'} aria-pressed={on} onClick={onClick} disabled={disabled}
    title={title} aria-label={ariaLabel} style={{ fontFamily: F_BODY }}>
    {children}
  </button>
);
