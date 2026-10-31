'use client';

import { F_HEAD, F_MONO, T } from '@/styles/theme';
import { Panel } from './Panel';
import { Eyebrow } from './Heading';

export const StatCard = ({ label, value, tone = 'neutral', icon: Icon, onClick, compact = false }) => {
  const fg = { green: T.green, amber: T.amber, red: T.red, blue: T.blue, neutral: T.ink }[tone];
  const clickable = typeof onClick === 'function';
  return (
    <Panel
      className={`${compact ? 'px-4 py-2.5 sm:p-4 flex items-center justify-between gap-3 sm:block' : 'p-4'}${clickable ? ' cursor-pointer pd-card-hover' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className={`flex items-center justify-between ${compact ? 'sm:mb-2' : 'mb-2'}`}>
        <Eyebrow>{label}</Eyebrow>
        {Icon && <Icon size={16} color={T.soft} className={compact ? 'hidden sm:block' : ''} />}
      </div>
      <div className={`${compact ? 'text-lg sm:text-2xl whitespace-nowrap' : 'text-2xl'} font-bold pd-num`} style={{ fontFamily: F_MONO, color: fg }}>{value}</div>
    </Panel>
  );
};

export const BigStat = ({ value, label, tone = T.ink }) => (
  <div className="text-center px-2">
    <div className="text-2xl sm:text-3xl font-bold leading-none tabular-nums" style={{ fontFamily: F_MONO, color: tone }}>{value}</div>
    <div className="text-xs mt-2 sm:whitespace-nowrap font-semibold uppercase" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>{label}</div>
  </div>
);
