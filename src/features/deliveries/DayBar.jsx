'use client';
// The "Viewing" date picker above the Deliveries and Crew Payroll screens.

import React from 'react';
import { Btn, Skeleton } from '@/components/ui';
import { F_HEAD, F_MONO, T } from '@/styles/theme';

export const DayBar = ({ todayStr, viewDate, readOnly, histLoading, loadHistory }) => (
  <div className="flex items-center flex-wrap gap-2 mb-5">
    <span className="text-xs" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>VIEWING</span>
    <input type="date" max={todayStr} value={viewDate || todayStr}
      onChange={e => loadHistory(e.target.value === todayStr ? null : e.target.value)}
      className="px-3 py-2 rounded border text-sm" style={{ borderColor: T.line, fontFamily: F_MONO, minWidth: 168, colorScheme: 'light', color: T.ink, backgroundColor: T.surface }} />
    {readOnly && (
      <Btn variant="outline" onClick={() => loadHistory(null)}>Back to Today</Btn>
    )}
    {histLoading && <Skeleton w={72} h={11} />}
  </div>
);
