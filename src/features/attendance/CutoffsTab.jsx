'use client';
// The Employee DTR tab: one cutoff's attendance summary per employee, with device pull and file import.

import React from 'react';
import { Upload, Loader2, CalendarX, Users } from 'lucide-react';
import { Badge, Btn, EmptyState, Panel, SkeletonBlock, Td, Th } from '@/components/ui';
import { F_BODY, F_HEAD, T } from '@/styles/theme';
import { MAX_IMPORT_MB } from '@/lib/import-limits';
import { cutoffLabel, shiftCutoff } from '@/features/attendance/attendance-helpers';
import { UnregisteredBanner } from '@/features/attendance/UnregisteredBanner.jsx';

export const CutoffsTab = ({
  pullSel, setPullSel, pullActive, canGoNext, data, pullDevice, queuePull, pullBusy, pullReq,
  showImport, setShowImport, dragOver, setDragOver, onDrop, importing, fileRef, goUnmapped,
  loading, staff, onNavigate, setSelectedId, setView,
}) => (
  <>
    <div className="rounded-xl mb-4 overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
      <div className="flex items-center justify-between gap-4 flex-wrap" style={{ padding: '16px 18px' }}>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setPullSel(shiftCutoff(pullSel, -1))} disabled={pullActive} className="rounded-lg flex items-center justify-center pd-clickable" style={{ width: 30, height: 30, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 16, lineHeight: 1 }} aria-label="Previous cutoff">&lsaquo;</button>
          <button onClick={() => setPullSel(shiftCutoff(pullSel, 1))} disabled={pullActive || !canGoNext} className="rounded-lg flex items-center justify-center pd-clickable" style={{ width: 30, height: 30, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 16, lineHeight: 1, opacity: canGoNext ? 1 : 0.35 }} aria-label="Next cutoff">&rsaquo;</button>
          <div style={{ minWidth: 190 }}>
            <div className="flex items-center gap-2" style={{ fontFamily: F_HEAD, fontWeight: 700, fontSize: 17, color: T.ink }}>{cutoffLabel(pullSel)}{data.finalized && <Badge tone="green">Finalized</Badge>}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {(() => {
            const connected = pullDevice.status === 'live';
            const stale = pullDevice.status === 'stale';
            const color = connected ? T.green : stale ? T.warn : T.soft;
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '7px 12px', fontFamily: F_HEAD, fontWeight: 600, fontSize: 12.5, color: connected ? T.ink : T.soft, background: T.surface, border: `1px solid ${connected ? T.green : T.line}`, boxShadow: connected ? `0 0 0 3px ${T.greenBg}` : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                {connected ? 'Device connected' : stale ? 'Reconnecting' : 'Device offline'}
              </span>
            );
          })()}
          {!data.finalized && <Btn onClick={queuePull} loading={pullBusy || pullActive} disabled={pullBusy || pullActive}>{pullReq?.status === 'RUNNING' ? 'Pulling…' : pullBusy || pullActive ? 'Queued…' : 'Pull from device'}</Btn>}
          {!data.finalized && <Btn variant="outline" onClick={() => setShowImport(true)}>Import file</Btn>}
        </div>
      </div>
      {showImport && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="border-2 border-dashed flex flex-col items-center justify-center text-center gap-2 px-4 py-6 m-4 rounded-md transition-colors"
          style={{ borderColor: dragOver ? T.brand : T.line, backgroundColor: dragOver ? T.brandBg : T.surface }}>
          {importing ? <Loader2 size={22} color={T.brand} className="pd-spin" /> : <Upload size={22} color={dragOver ? T.brand : T.soft} />}
          <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{importing ? 'Reading and matching the attendance file…' : 'Drag & drop the biometric file here'}</div>
          <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Accepted files: .dat, .xls, .xlsx (up to {MAX_IMPORT_MB} MB)</div>
          <div className="flex gap-2">
            <Btn variant="outline" onClick={() => fileRef.current?.click()} loading={importing} disabled={importing}>{importing ? 'Importing…' : 'Browse for a file'}</Btn>
            {!importing && <Btn variant="outline" onClick={() => setShowImport(false)}>Cancel</Btn>}
          </div>
        </div>
      )}
    </div>
    <UnregisteredBanner count={data.unregisteredInPeriod || 0} onOpen={goUnmapped} />
    <Panel className="overflow-hidden">
      {loading ? <SkeletonBlock />
        : data.summaries.length === 0 ? (staff.length === 0
          ? <EmptyState icon={Users} title="No employees registered yet" desc="Scans are matched to employees by their biometric ID. Register them first, then pull from the device." action={onNavigate ? <Btn variant="outline" onClick={() => onNavigate('employees')}>Go to Employees</Btn> : null} />
          : <EmptyState icon={CalendarX} title="No attendance for this cutoff yet" desc="Press Pull from device above to read this cutoff's scans from the scanner." />)
        : (
        <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
          <thead><tr><Th>ID</Th><Th>Employee</Th><Th center>Present</Th><Th center>Days Late</Th><Th center>Late (minutes)</Th><Th center>Overtime (minutes)</Th><Th center>Absences</Th><Th center>Leave</Th><Th>Action</Th></tr></thead>
          <tbody>
            {data.summaries.map(s => (
              <tr key={s.id}>
                <Td mono>{s.id}</Td>
                <Td>
                  <div className="font-semibold" style={{ fontFamily: F_BODY }}>{s.name}</div>
                </Td>
                <Td center mono>{s.present}</Td>
                <Td center mono><span style={{ color: s.daysLate > 0 ? T.red : T.soft, fontWeight: s.daysLate > 0 ? 700 : 400 }}>{s.daysLate || '--'}</span></Td>
                <Td center mono><span style={{ color: s.lateMins > 0 ? T.red : T.soft, fontWeight: s.lateMins > 0 ? 700 : 400 }}>{s.lateMins > 0 ? `${s.lateMins}m` : '--'}</span></Td>
                <Td center mono><span style={{ color: s.otMins > 0 ? T.green : T.soft, fontWeight: s.otMins > 0 ? 700 : 400 }}>{s.otMins > 0 ? `${s.otMins}m` : '--'}</span></Td>
                <Td center mono><span style={{ color: s.absent > 0 ? T.amber : T.soft, fontWeight: s.absent > 0 ? 700 : 400 }}>{s.absent || '--'}</span></Td>
                <Td center mono>{s.leave || '--'}</Td>
                <Td><Btn size="sm" variant="outline" onClick={() => { setSelectedId(s.id); setView('dtr'); }}>View</Btn></Td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Panel>
  </>
);
