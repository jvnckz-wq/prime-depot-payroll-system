'use client';

import { F_HEAD, T } from '@/styles/theme';

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
