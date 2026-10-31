'use client';
// The two read-only dialogs opened from Import History: one import's records, and one employee's DTR from it.

import React from 'react';
import { ClipboardList } from 'lucide-react';
import { Badge, Btn, EmptyState, Modal, SkeletonBlock, Td, Th } from '@/components/ui';
import { F_BODY, T } from '@/styles/theme';

export const HistoryModals = ({ viewBatch, setViewBatch, batchLoading, batchRows, openHistDtr, histDtr, setHistDtr, histDtrLoading }) => (
  <>
    <Modal open={!!viewBatch} onClose={() => setViewBatch(null)} title={viewBatch ? `Import: ${viewBatch.filename}` : ''} width={680}>
      {viewBatch && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
            <Badge tone="blue">{viewBatch.periodStart} → {viewBatch.periodEnd}</Badge>
            <span>Imported {new Date(viewBatch.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <Badge tone="amber">Locked, viewing only</Badge>
          </div>
          {batchLoading ? <SkeletonBlock avatar={false} />
            : batchRows.length === 0 ? <EmptyState icon={ClipboardList} title="No records" desc="No attendance rows fall in this import's date range." />
            : (
            <div className="overflow-x-auto pd-scroll-shadow" style={{ maxHeight: 380 }}>
              <table className="w-full">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                  <tr><Th>ID</Th><Th>Employee</Th><Th center>Present</Th><Th center>Days Late</Th><Th center>Late (minutes)</Th><Th center>Overtime (minutes)</Th><Th center>Absences</Th><Th center>Leave</Th><Th></Th></tr>
                </thead>
                <tbody>
                  {batchRows.map((s) => (
                    <tr key={s.id}>
                      <Td mono>{s.id}</Td>
                      <Td><span className="font-semibold text-sm" style={{ fontFamily: F_BODY }}>{s.name}</span></Td>
                      <Td center mono>{s.present}</Td>
                      <Td center mono>{s.daysLate || '--'}</Td>
                      <Td center mono>{s.lateMins > 0 ? `${s.lateMins}m` : '--'}</Td>
                      <Td center mono>{s.otMins > 0 ? `${s.otMins}m` : '--'}</Td>
                      <Td center mono>{s.absent || '--'}</Td>
                      <Td center mono>{s.leave || '--'}</Td>
                      <Td><Btn size="sm" variant="outline" onClick={() => openHistDtr(s)}>View</Btn></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>

    <Modal open={!!histDtr} onClose={() => setHistDtr(null)} title={histDtr ? `DTR: ${histDtr.name}` : ''} width={640}>
      {histDtr && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
            <Badge tone="blue">{histDtr.period}</Badge>
            <Badge tone="amber">Locked, viewing only</Badge>
          </div>
          {histDtrLoading ? <SkeletonBlock avatar={false} />
            : histDtr.rows.length === 0 ? <EmptyState icon={ClipboardList} title="No records" desc="No daily records for this employee in this period." />
            : (
            <div className="overflow-x-auto pd-scroll-shadow" style={{ maxHeight: 400 }}>
              <table className="w-full">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                  <tr><Th>Date</Th><Th>Day</Th><Th>Time In</Th><Th>Time Out</Th><Th center>Late</Th><Th center>Overtime</Th><Th>Status</Th></tr>
                </thead>
                <tbody>
                  {histDtr.rows.map((r, i) => (
                    <tr key={i}>
                      <Td mono>{r.date}</Td>
                      <Td>{r.weekday}</Td>
                      <Td mono>{r.absent || r.leave ? '--' : (r.in || '--')}</Td>
                      <Td mono>{r.absent || r.leave ? '--' : (r.out || '--')}</Td>
                      <Td center mono>{r.late > 0 ? `${r.late}m` : '--'}</Td>
                      <Td center mono>{r.ot > 0 ? `${r.ot}m` : '--'}</Td>
                      <Td>{r.leave ? <Badge tone="blue">On Leave</Badge> : r.absent ? <Badge tone="red">Absent</Badge> : <Badge tone="green">Present</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  </>
);
