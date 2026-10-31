'use client';
// One employee's Daily Time Record for the selected cutoff, with the dialog to correct a day.

import React from 'react';
import { ArrowLeft, Pencil, CalendarX } from 'lucide-react';
import { Avatar, Badge, BigStat, Btn, Chip, EmptyState, Field, Modal, Panel, SkeletonBlock, Td, Th, inputCls, inputStyle } from '@/components/ui';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { fmtPeriod } from '@/features/attendance/attendance-helpers';

export const EmployeeDtr = ({
  staff, selectedId, setSelectedId, setView, data, dtr, dtrLoading,
  openEdit, editDay, setEditDay, editForm, setEditForm, savingEdit, saveEdit,
}) => {
  const emp = staff.find(s => s.id === selectedId);
  const isCrew = !!emp?.crew;
  const summary = data.summaries.find(s => s.id === selectedId);
  const name = emp?.name || summary?.name || selectedId;
  const rows = dtr.rows || [];
  const daysLate = rows.filter(r => r.late > 0).length;
  const lateMins = rows.reduce((s, r) => s + r.late, 0);
  const otMins = rows.reduce((s, r) => s + r.ot, 0);
  const absent = rows.filter(r => r.absent).length;
  const leave = rows.filter(r => r.leave).length;

  return (
    <div className="p-4 sm:p-6">
      <button onClick={() => { setView('list'); setSelectedId(null); }} className="pd-link text-sm mb-4" style={{ fontFamily: F_BODY }}>
        <ArrowLeft size={14} /> Back to Attendance
      </button>
      <Panel className="p-5 mb-5">
        <div className="flex items-center gap-5 flex-wrap">
          <Avatar name={name} size={52} tone={T.brand} />
          <div className="flex-1" style={{ minWidth: 160 }}>
            <div className="text-lg font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{name}</div>
            <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{emp?.position ? emp.position : '--'} · {selectedId}</div>
          </div>
          <div className="flex gap-6 flex-wrap">
            <BigStat value={daysLate} label="Days Late" />
            <BigStat value={`${lateMins}m`} label="Total Late" tone={T.red} />
            <BigStat value={`${otMins}m`} label="Overtime" tone={T.green} />
            <BigStat value={absent} label="Absences" tone={T.amber} />
            {!isCrew && <BigStat value={leave} label="On Leave" tone={T.brand} />}
          </div>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Daily Time Record: {fmtPeriod(dtr.period)}</div>
        </div>
        {dtrLoading ? <SkeletonBlock avatar={false} />
          : rows.length === 0 ? <EmptyState icon={CalendarX} title="No attendance for this employee yet" desc="Scans appear here after you pull this cutoff from the device." />
          : (
          <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
            <thead><tr><Th>Date</Th><Th>Time In</Th><Th>Time Out</Th><Th center>Late (minutes)</Th><Th center>Overtime (minutes)</Th><Th></Th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const isLate = a.late > 0, isOt = a.ot > 0;
                const rowBg = a.absent ? T.amberBg : 'transparent';
                return (
                  <tr key={a.date} onClick={() => openEdit(a)} style={{ backgroundColor: rowBg, cursor: data.finalized ? 'default' : 'pointer' }}>
                    <Td>
                      <span className="font-bold mr-2" style={{ fontFamily: F_MONO, color: T.ink }}>{a.date.slice(8)}</span>
                      <span className="text-xs" style={{ fontFamily: F_BODY, color: a.absent ? T.amber : T.soft }}>{a.weekday}</span>
                      {a.absent && <span className="ml-2"><Badge tone="amber">ABSENT</Badge></span>}
                      {a.leave && <span className="ml-2"><Badge tone="blue">ON LEAVE</Badge></span>}
                      {a.assumedIn && !a.absent && <span className="ml-2"><Badge tone="blue">ASSUMED IN</Badge></span>}
                      {a.assumedOut && !a.absent && <span className="ml-2"><Badge tone="blue">ASSUMED OUT</Badge></span>}
                      {a.manual && <span className="ml-2"><Badge tone="blue">EDITED</Badge></span>}
                    </Td>
                    <Td mono>{a.assumedIn ? '--' : (a.in || '--')}</Td>
                    <Td mono>{a.assumedOut ? '--' : (a.out || '--')}</Td>
                    <Td center mono><span style={{ fontWeight: isLate ? 700 : 400, color: isLate ? T.red : T.soft }}>{isLate ? a.late : '--'}</span></Td>
                    <Td center mono><span style={{ fontWeight: isOt ? 700 : 400, color: isOt ? T.green : T.soft }}>{isOt ? a.ot : '--'}</span></Td>
                    <Td right>{!data.finalized && <Pencil size={13} style={{ color: T.soft }} />}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: T.bg }}>
                <Td colSpan={3}><b style={{ color: T.red, fontFamily: F_HEAD, letterSpacing: '0.03em' }}>TOTAL</b></Td>
                <Td center mono><b style={{ color: T.red }}>{lateMins}m</b></Td>
                <Td center mono><b style={{ color: T.green }}>{otMins}m</b></Td>
                <Td></Td>
              </tr>
            </tfoot>
          </table></div>
        )}
      </Panel>

      <Modal open={!!editDay} onClose={() => setEditDay(null)} title={`Correct ${editDay ? `${name} on ${editDay.date}` : ''}`} width={440}>
        {editDay && (
          <div className="space-y-3">
            <Field label="Status">
              <div className="flex gap-2">
                {(isCrew ? [['present', 'Present'], ['absent', 'Absent']] : [['present', 'Present'], ['leave', 'On Leave'], ['absent', 'Absent']]).map(([val, lbl]) => (
                  <Chip key={val} on={editForm.status === val} onClick={() => setEditForm((f) => ({ ...f, status: val }))}>{lbl}</Chip>
                ))}
              </div>
            </Field>
            {editForm.status === 'leave' && (
              <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Paid leave, counted toward pay like a present day, tracked against the employee&apos;s leave credits.</div>
            )}
            {editForm.status === 'present' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Time In"><input type="time" value={editForm.timeIn} onChange={(e) => setEditForm((f) => ({ ...f, timeIn: e.target.value }))} className={inputCls} style={inputStyle} /></Field>
                <Field label="Time Out"><input type="time" value={editForm.timeOut} onChange={(e) => setEditForm((f) => ({ ...f, timeOut: e.target.value }))} className={inputCls} style={inputStyle} /></Field>
              </div>
            )}
            <Field label="Reason / note (optional)"><input value={editForm.note} maxLength={200} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. brownout, scanner down" className={inputCls} style={inputStyle} /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="outline" onClick={() => setEditDay(null)} disabled={savingEdit}>Cancel</Btn>
              <Btn onClick={saveEdit} loading={savingEdit} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save correction'}</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
