'use client';

import { F_HEAD, T } from '@/styles/theme';

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
