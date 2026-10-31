'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { F_MONO, T } from '@/styles/theme';

const BACKUP_CHARS = /[ABCDEFGHJKMNPQRSTUVWXYZ23456789]/;

export const cleanCode = (raw, backup) => {
  const s = String(raw || '').toUpperCase();
  return backup
    ? [...s].filter((c) => BACKUP_CHARS.test(c)).join('').slice(0, 8)
    : s.replace(/[^0-9]/g, '').slice(0, 6);
};

export const formatBackup = (v) => (v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v);

export default function CodeBoxes({ value = '', onChange, backup = false, disabled = false, autoFocus = false, onEnter, label = 'Code', invalid = false, field = 'code' }) {
  const length = backup ? 8 : 6;
  const group = backup ? 4 : 3;
  const refs = useRef([]);
  const clean = cleanCode(value, backup);
  const current = useRef(clean);
  useLayoutEffect(() => { current.current = clean; }, [clean]);
  const chars = clean.padEnd(length, ' ').split('');
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const onFieldError = (e) => {
      if (!Array.isArray(e.detail) || !e.detail.includes(field)) return;
      current.current = '';
      onChangeRef.current('');
      const first = refs.current[0];
      if (first) first.focus();
    };
    window.addEventListener('pd-field-error', onFieldError);
    return () => window.removeEventListener('pd-field-error', onFieldError);
  }, [field]);

  const focusAt = (i) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) { el.focus(); el.select(); }
  };

  const commit = (next) => { current.current = next; onChange(next); };

  const write = (start, text) => {
    const incoming = cleanCode(text, backup);
    if (!incoming) return;
    const cur = current.current;
    const at = Math.min(start, cur.length);
    const next = (cur.slice(0, at) + incoming + cur.slice(at + incoming.length)).slice(0, length);
    commit(next);
    focusAt(at + incoming.length);
  };

  const onKeyDown = (i, e) => {
    const cur = current.current;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (i < cur.length) commit(cur.slice(0, i) + cur.slice(i + 1));
      else if (cur.length) { commit(cur.slice(0, -1)); focusAt(cur.length - 1); }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(Math.min(i + 1, cur.length)); }
    else if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
  };

  return (
    <div role="group" aria-label={label} className="flex items-center justify-center w-full" style={{ gap: 8 }}>
      {chars.map((c, i) => (
        <React.Fragment key={i}>
          {i === group && <span aria-hidden="true" className="shrink-0" style={{ width: backup ? 10 : 12, height: 2, backgroundColor: backup ? T.line : 'transparent', borderRadius: 1 }} />}
          <input
            ref={(el) => { refs.current[i] = el; }}
            value={c === ' ' ? '' : c}
            onChange={(e) => { const v = e.target.value; write(i, v.length > 2 ? v : v.slice(-1)); }}
            onPaste={(e) => { e.preventDefault(); write(0, e.clipboardData.getData('text')); }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => { if (i > Math.min(current.current.length, length - 1)) focusAt(current.current.length); else e.target.select(); }}
            disabled={disabled}
            required
            autoFocus={autoFocus && i === 0}
            inputMode={backup ? 'text' : 'numeric'}
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={`${label}, character ${i + 1} of ${length}`}
            aria-invalid={invalid && c === ' ' ? true : undefined}
            data-field={field}
            className="pd-codebox text-center outline-none min-w-0"
            style={{
              flex: '1 1 0', maxWidth: 48, height: 54, borderRadius: 10,
              border: `1.5px solid ${c === ' ' ? T.line : T.soft}`,
              backgroundColor: disabled ? T.bg : T.surface, color: T.ink,
              fontFamily: F_MONO, fontSize: 22, fontWeight: 600,
            }}
          />
        </React.Fragment>
      ))}
      <style>{`.pd-codebox:focus{border-color:${T.brand}!important;box-shadow:0 0 0 3px ${T.brandBg}}`}</style>
    </div>
  );
}
