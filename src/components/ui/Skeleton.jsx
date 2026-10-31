'use client';
// Grey placeholder shapes shown while data loads.

import { Td } from './Table';

export const Skeleton = ({ w = '100%', h = 12, r = 6, className = '', style = {} }) => (
  <span className={`pd-skeleton ${className}`} aria-hidden="true"
    style={{ display: 'inline-block', width: w, height: h, borderRadius: r, ...style }} />
);

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
