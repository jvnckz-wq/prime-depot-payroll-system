'use client';
// The Unmapped IDs tab: biometric IDs on the device with no registered employee, with Resolve and Register.

import React from 'react';
import { AlertTriangle, CircleCheck } from 'lucide-react';
import { Badge, Btn, EmptyState, Panel, SkeletonBlock, Td, Th } from '@/components/ui';
import { F_BODY, F_HEAD, T } from '@/styles/theme';

export const UnmappedTab = ({ unmappedLoading, unmappedError, loadUnmapped, unmapped, enrolled, resolvingId, resolveId, onRegister }) => (
  <Panel className="overflow-hidden">
    <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Unmapped Biometric IDs</div>
    </div>
    {!unmappedLoading && unmappedError && (
      <div role="alert" className="m-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: T.brandBg, color: T.brandDark, fontFamily: F_BODY }}>
        <span className="flex items-center gap-2"><AlertTriangle size={15} aria-hidden="true" /> {unmappedError}</span>
        <Btn size="sm" variant="outline" onClick={loadUnmapped}>Try again</Btn>
      </div>
    )}
    {(() => {
      if (unmappedLoading) return <SkeletonBlock avatar={false} />;
      const byId = new Map(unmapped.map((g) => [g.biometricId, { ...g }]));
      for (const u of enrolled) {
        const g = byId.get(u.userId);
        if (g) { if (!g.biometricName && u.name) g.biometricName = u.name; }
        else byId.set(u.userId, { biometricId: u.userId, biometricName: u.name, punchCount: 0, firstDate: null, lastDate: null, hasEmployee: false });
      }
      const list = [...byId.values()].sort((a, b) => Number(a.biometricId) - Number(b.biometricId) || String(a.biometricId).localeCompare(String(b.biometricId)));
      if (!list.length) return unmappedError ? null : <EmptyState icon={CircleCheck} title="All scans are matched" desc="Every scan from the device is linked to a registered employee." />;
      return (
        <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
          <thead><tr><Th>Biometric ID</Th><Th>Name</Th><Th center>Scans</Th><Th center>Dates</Th><Th center>Action</Th></tr></thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.biometricId}>
                <Td mono><span className="font-bold" style={{ color: T.ink }}>{g.biometricId}</span></Td>
                <Td>
                  <span style={{ fontFamily: F_BODY, color: T.ink }}>{g.biometricName || '--'}</span>
                  {g.hasEmployee && <span className="ml-2"><Badge tone="green">registered</Badge></span>}
                </Td>
                <Td center mono>{g.punchCount > 0 ? g.punchCount : <span style={{ color: T.soft }}>--</span>}</Td>
                <Td center mono>
                  <span className="text-xs" style={{ color: T.soft }}>
                    {!g.firstDate ? 'No scans yet' : g.firstDate === g.lastDate ? g.firstDate : `${g.firstDate} → ${g.lastDate}`}
                  </span>
                </Td>
                <Td center>
                  {g.hasEmployee ? (
                    <Btn size="sm" disabled={resolvingId === g.biometricId} onClick={() => resolveId(g.biometricId)}>
                      {resolvingId === g.biometricId ? 'Resolving…' : 'Resolve'}
                    </Btn>
                  ) : (
                    <Btn size="sm" variant="outline" onClick={() => onRegister && onRegister(g.biometricId, g.biometricName)}>Register</Btn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table></div>
      );
    })()}
  </Panel>
);
