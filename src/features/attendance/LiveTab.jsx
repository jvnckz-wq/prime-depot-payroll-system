'use client';
// The Live tab: who scanned in on one day, with the device sync status.

import React from 'react';
import { ClipboardList } from 'lucide-react';
import { Badge, EmptyState, Panel, SkeletonBlock } from '@/components/ui';
import { F_BODY, F_HEAD, T } from '@/styles/theme';
import { positionLabel } from '@/lib/constants';
import { agoFrom, asUTC, fmtDay, liveTdBase, liveThBase, shiftYmd } from '@/features/attendance/attendance-helpers';

export const LiveTab = ({ liveData, setLiveDate, liveLoading }) => (
  <Panel className="overflow-hidden">
    <div className="flex items-center justify-between gap-4 flex-wrap" style={{ padding: '18px 18px 0' }}>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setLiveDate(shiftYmd(liveData.date || liveData.today, -1))}
          disabled={!liveData.date}
          className="rounded-lg flex items-center justify-center pd-clickable"
          style={{ width: 30, height: 30, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 16, lineHeight: 1 }}
          aria-label="Previous day"
        >&lsaquo;</button>
        <button
          onClick={() => { const next = shiftYmd(liveData.date, 1); setLiveDate(next >= liveData.today ? null : next); }}
          disabled={liveData.isToday}
          className="rounded-lg flex items-center justify-center pd-clickable"
          style={{ width: 30, height: 30, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 16, lineHeight: 1, opacity: liveData.isToday ? 0.35 : 1 }}
          aria-label="Next day"
        >&rsaquo;</button>
        <div style={{ minWidth: 200 }}>
          <div className="flex items-center gap-2" style={{ fontFamily: F_HEAD, fontWeight: 700, fontSize: 17, color: T.ink }}>{liveData.isToday ? 'Today' : (liveData.date ? fmtDay(liveData.date) : ' ')}{liveData.finalized && <Badge tone="green">Finalized</Badge>}</div>
          <div style={{ fontFamily: F_BODY, fontSize: 12, color: T.soft, marginTop: 1 }}>
            {liveData.date ? asUTC(liveData.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ' '}
          </div>
          {liveData.finalized && liveData.isToday && <div className="text-xs mt-1" style={{ fontFamily: F_BODY, color: T.warn, maxWidth: 360, lineHeight: 1.5 }}>This cutoff’s payroll is finalized. New scans stay on the device and are not added.</div>}
        </div>
        {!liveData.isToday && (
          <button onClick={() => setLiveDate(null)} className="pd-link text-sm" style={{ fontFamily: F_BODY }}>Back to today</button>
        )}
      </div>
      {(() => {
        if (!liveData.isToday) {
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.lineSoft, border: `1px solid ${T.line}`, borderRadius: 999, padding: '7px 13px', fontFamily: F_HEAD, fontWeight: 600, fontSize: 13, color: T.soft }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.soft }} />
              Viewing past day
            </div>
          );
        }
        const sync = liveData.sync || {};
        const ago = agoFrom(sync.lastSyncAt);
        const cfg = sync.status === 'live'
          ? { color: T.green, glow: true, label: 'Live', text: `synced ${ago}` }
          : sync.status === 'stale'
            ? { color: T.warn, glow: false, label: 'Reconnecting', text: ago ? `last sync ${ago}` : 'no sync yet' }
            : { color: T.soft, glow: false, label: 'Offline', text: ago ? `last sync ${ago}` : 'no sync yet' };
        return (
          <div
            title={sync.lastSyncAt ? `Last device sync: ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : 'No device sync yet'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: T.surface, border: `1px solid ${cfg.color}`,
              borderRadius: 999, padding: '7px 13px',
              fontFamily: F_HEAD, fontWeight: 600, fontSize: 13,
              boxShadow: cfg.glow ? `0 0 0 3px ${T.greenBg}` : 'none',
              transition: 'box-shadow .3s ease, border-color .3s ease',
            }}
          >
            <span style={{ position: 'relative', width: 9, height: 9, flex: '0 0 9px' }}>
              {cfg.glow && <span className="pd-live-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: cfg.color }} />}
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: cfg.color }} />
            </span>
            <span style={{ color: sync.status === 'live' ? T.ink : T.soft }}>{cfg.label}</span>
            <span style={{ color: T.line }}>·</span>
            <span style={{ color: T.soft, fontWeight: 500 }}>{cfg.text}</span>
          </div>
        );
      })()}
    </div>

    <div className="grid grid-cols-3 sm:flex sm:flex-wrap" style={{ gap: 10, padding: '16px 18px' }}>
      {[
        [liveData.isToday ? 'Present today' : 'Present', liveData.stats.present, T.ink, false],
        ['Late', liveData.stats.late, T.red, false],
        [liveData.isToday ? 'Not yet in' : 'Absent / no scan', liveData.stats.notYetIn, T.soft, true],
      ].map(([label, n, color, dashed]) => (
        <div key={label} className="sm:min-w-32" style={{ background: dashed ? 'transparent' : T.surface, border: `1px ${dashed ? 'dashed' : 'solid'} ${T.line}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontFamily: F_HEAD, fontWeight: 700, fontSize: 23, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
          <div style={{ fontFamily: F_HEAD, fontWeight: 600, fontSize: 11.5, color: T.soft, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>{label}</div>
        </div>
      ))}
    </div>

    {liveLoading ? <SkeletonBlock />
      : liveData.rows.length === 0 ? <EmptyState icon={ClipboardList} title={liveData.isToday ? 'No one has scanned yet today' : 'No records for this day'} desc={liveData.isToday ? 'Scans show up here in real time as employees clock in on the device.' : 'No one scanned on this date, or the sync agent was not running.'} />
      : (
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 640 }}>
          <thead><tr>
            <th style={{ ...liveThBase, width: '40%' }}>Employee</th>
            <th style={{ ...liveThBase, width: '16%' }}>Time In</th>
            <th style={{ ...liveThBase, width: '16%' }}>Time Out</th>
            <th style={{ ...liveThBase, width: '14%', textAlign: 'center' }}>Late (minutes)</th>
            <th style={{ ...liveThBase, width: '14%', textAlign: 'center' }}>Status</th>
          </tr></thead>
          <tbody>
            {liveData.rows.map(r => (
              <tr key={r.id}>
                <td style={liveTdBase}>
                  <div style={{ fontFamily: F_BODY, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontFamily: F_BODY, fontSize: 12, color: T.soft, marginTop: 1 }}>{r.position ? `${positionLabel(r.position)} · ${r.id}` : r.id}</div>
                </td>
                <td style={{ ...liveTdBase, fontVariantNumeric: 'tabular-nums' }}>{r.in || <span style={{ color: T.line }}>--</span>}{r.assumedIn && <span style={{ marginLeft: 8, fontSize: 11, color: T.soft }}>assumed</span>}</td>
                <td style={{ ...liveTdBase, fontVariantNumeric: 'tabular-nums' }}>{r.out || <span style={{ color: T.line }}>--</span>}</td>
                <td style={{ ...liveTdBase, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.late > 0 ? <span style={{ color: T.red, fontWeight: 700 }}>{r.late}m</span> : <span style={{ color: T.line }}>--</span>}</td>
                <td style={{ ...liveTdBase, textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: F_HEAD, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 10px', color: r.status === 'in' ? T.green : T.soft, background: r.status === 'in' ? T.greenBg : T.lineSoft }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.status === 'in' ? T.green : T.soft }} />
                    {r.status === 'in' ? 'In' : 'Out'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Panel>
);
