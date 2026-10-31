'use client';

import { F_HEAD, T } from '@/styles/theme';

export const Av = ({ name = '?', size = 32, tone = T.ink }) => {
  const initials = name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-white font-semibold"
      style={{ width: size, height: size, backgroundColor: tone, fontFamily: F_HEAD, fontSize: size * 0.36 }}>
      {initials || '?'}
    </div>
  );
};
