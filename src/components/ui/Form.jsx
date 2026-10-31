'use client';
// Form pieces: a labelled Field with its error, shared input styles, and a searchable dropdown.

import React from 'react';
import { F_BODY, T } from '@/styles/theme';
import { Eyebrow } from './Heading';

export const Field = ({ label, children, error }) => (
  <div data-invalid={error ? '' : undefined}>
    {label && <Eyebrow>{label}</Eyebrow>}
    {children}
    {error && <div role="alert" data-field-error className="text-xs mt-1" style={{ fontFamily: F_BODY, color: T.brandDark, lineHeight: 1.5 }}>{error}</div>}
  </div>
);
export const inputCls = "w-full px-3 py-2 rounded text-sm outline-none border min-h-11 sm:min-h-0";
export const inputStyle = { fontFamily: F_BODY, borderColor: T.line, color: T.ink };

export const SearchSelect = ({ value, onChange, options, placeholder, disabled = false, allowCustom = false }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const boxRef = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (q ? options.filter(o => o.toLowerCase().includes(q)) : options).slice(0, 60);
  const canAddCustom = allowCustom && q && !options.some(o => o.toLowerCase() === q);
  const pick = (v) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className={inputCls} style={inputStyle} disabled={disabled}
        placeholder={placeholder}
        value={open ? query : (value || '')}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(value || ''); } }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && !disabled && (
        <div style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 224, overflowY: 'auto', backgroundColor: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.14)' }}>
          {filtered.length === 0 && !canAddCustom && (
            <div className="px-3 py-2 text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>No match</div>
          )}
          {canAddCustom && (
            <button type="button" className="w-full text-left px-3 py-2 text-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(query.trim())}
              style={{ fontFamily: F_BODY, color: T.brand, fontWeight: 600 }}>Use &ldquo;{query.trim()}&rdquo;</button>
          )}
          {filtered.map(o => (
            <button key={o} type="button" className="w-full text-left px-3 py-2 text-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
              style={{ fontFamily: F_BODY, color: T.ink, backgroundColor: o === value ? T.bg : 'transparent' }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
};
