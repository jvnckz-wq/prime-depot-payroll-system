'use client';
// Short pop-up messages in the corner of the screen.

import { X, Check } from 'lucide-react';
import { F_BODY, T } from '@/styles/theme';

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
