'use client';

import { X } from 'lucide-react';
import { F_BODY, F_HEAD, T } from '@/styles/theme';
import { Btn } from './Button';

export const Modal = ({ open, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div className="pd-overlay fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(27,36,48,0.55)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="pd-modal w-full rounded-lg overflow-hidden flex flex-col" style={{ backgroundColor: T.surface, maxWidth: width, maxHeight: '88vh' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <span className="text-sm font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="pd-icon-btn -my-3 -mr-3 w-10 h-10 shrink-0"><X size={16} color={T.soft} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const Confirm = ({ open, onConfirm, onCancel, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false, confirmDisabled = false, children = null }) => {
  if (!open) return null;
  return (
    <div className="pd-overlay fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(27,36,48,0.55)' }}>
      <div className="pd-modal w-full rounded-lg p-6" style={{ backgroundColor: T.surface, maxWidth: 360 }}>
        <div className="text-base font-bold mb-2" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</div>
        <div className="text-sm mb-5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>{message}</div>
        {children && <div className="-mt-2 mb-5 flex flex-col gap-2">{children}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Btn>
          <Btn variant={danger ? 'amber' : 'dark'} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
};
