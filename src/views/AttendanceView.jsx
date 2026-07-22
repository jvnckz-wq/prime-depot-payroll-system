'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ClipboardList, ArrowLeft, BarChart3, Eye } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Av, Badge, BigStat, Btn, EmptyState, Eyebrow, H1, Panel, Td, Th } from '../components/ui.jsx';
import { IMPORT_HISTORY_INIT } from '../data/seed';
import { buildDtrRows, genAttendanceHistory, summarizeDtr } from '../lib/attendance';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const AttendanceView = ({ staff, toast }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('dtr');
  const [editCell, setEditCell] = useState(null);
  const [rows, setRows] = useState(() => (selectedId ? buildDtrRows(selectedId) : []));
  const [history, setHistory] = useState(IMPORT_HISTORY_INIT);
  const [importing, setImporting] = useState(false);

  // Reload the DTR whenever a different employee is opened — this is the fix for the
  // drill-down previously showing the exact same 15 rows no matter who you clicked.
  useEffect(() => {
    if (selectedId) { setRows(buildDtrRows(selectedId)); setEditCell(null); }
  }, [selectedId]);

  const commitCell = (idx, field, val) => {
    setRows(r => r.map((row, i) => i === idx ? { ...row, [field]: val } : row));
    setEditCell(null);
  };
  const runImport = () => {
    setImporting(true);
    setTimeout(() => {
      setImporting(false);
      setHistory(h => [{ date: 'Jul 16, 2026', file: 'biometric_may16-31.xls', count: staff.length, status: 'Success' }, ...h]);
      toast(`Attendance imported for ${staff.length} employees.`);
    }, 900);
  };

  if (view === 'dtr' && selectedId) {
    const current = staff.find(s => s.id === selectedId) || staff[0];
    const totalDaysLate = rows.filter(r => r.late > 0).length;
    const totalLateMins = rows.reduce((s, r) => s + r.late, 0);
    const totalOtMins = rows.reduce((s, r) => s + r.ot, 0);
    const totalAbsent = rows.filter(r => r.absent).length;
    // Ground the trend chart's most recent bar in the real numbers above, instead of
    // an unrelated random figure for the same cutoff.
    const trend = genAttendanceHistory(selectedId);
    trend[5] = { cutoff: 'May 1–15', present: rows.length - totalAbsent, absent: totalAbsent, late: totalLateMins, daysLate: totalDaysLate, ot: totalOtMins };

    return (
      <div className="p-6">
        <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Attendance
        </button>

        <Panel className="p-5 mb-5">
          <div className="flex items-center gap-5 flex-wrap">
            <Av name={current.name} size={52} tone={T.brand} />
            <div className="flex-1" style={{ minWidth: 160 }}>
              <div className="text-lg font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{current.name}</div>
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{current.position} · {current.id} · Call time {current.position.includes('Special') ? '6:00 AM' : '6:40 AM'}</div>
            </div>
            <div className="flex gap-6 flex-wrap">
              <BigStat value={totalDaysLate} label="Days Late" />
              <BigStat value={`${totalLateMins}m`} label="Total Late" tone={T.red} />
              <BigStat value={`${totalOtMins}m`} label="Overtime" tone={T.green} />
              <BigStat value={totalAbsent} label="Absences" tone={T.amber} />
            </div>
          </div>
        </Panel>

        <Panel className="overflow-hidden mb-4">
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-1" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Daily Time Record — May 1 – 15, 2026</div>
            <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Click a time to edit</div>
          </div>
          <table className="w-full">
            <thead><tr><Th>Date</Th><Th>Time In</Th><Th>Time Out</Th><Th right>Late (mins)</Th><Th right>OT (mins)</Th></tr></thead>
            <tbody>
              {rows.map((a, i) => {
                const isLate = a.late > 0;
                const isAbsent = a.absent;
                const isOt = a.ot > 0;
                const isFullPaySunday = a.day === 'Su' && !isAbsent && !isLate && !isOt;
                const rowBg = isLate ? T.redBg : isAbsent ? T.amberBg : 'transparent';
                return (
                  <tr key={a.date} style={{ backgroundColor: rowBg }}>
                    <Td>
                      <span className="font-bold mr-2" style={{ fontFamily: F_MONO, color: T.ink }}>{a.date}</span>
                      <span className="text-xs" style={{ fontFamily: F_BODY, color: isLate ? T.red : isAbsent ? T.amber : T.soft }}>{a.day}</span>
                      {isAbsent && <span className="ml-2"><Badge tone="amber">ABSENT</Badge></span>}
                      {isFullPaySunday && <span className="ml-2"><Badge tone="blue">SUNDAY · FULL PAY</Badge></span>}
                    </Td>
                    <Td mono>
                      {editCell?.row === i && editCell?.field === 'in'
                        ? <input autoFocus defaultValue={a.in} onBlur={e => commitCell(i, 'in', e.target.value)} className="w-20 px-1.5 py-1 rounded border text-sm" style={{ fontFamily: F_MONO, borderColor: T.blue }} />
                        : <span onClick={() => !isAbsent && setEditCell({ row: i, field: 'in' })} className={isAbsent ? '' : 'cursor-pointer'} style={{ color: isAbsent ? T.soft : T.ink, borderBottom: isAbsent ? 'none' : `1px dashed ${T.line}` }}>{a.in}</span>}
                    </Td>
                    <Td mono>
                      {editCell?.row === i && editCell?.field === 'out'
                        ? <input autoFocus defaultValue={a.out} onBlur={e => commitCell(i, 'out', e.target.value)} className="w-20 px-1.5 py-1 rounded border text-sm" style={{ fontFamily: F_MONO, borderColor: T.blue }} />
                        : <span onClick={() => !isAbsent && setEditCell({ row: i, field: 'out' })} className={isAbsent ? '' : 'cursor-pointer'} style={{ color: isAbsent ? T.soft : T.ink, borderBottom: isAbsent ? 'none' : `1px dashed ${T.line}` }}>{a.out}</span>}
                    </Td>
                    <Td right mono><span style={{ fontWeight: isLate ? 700 : 400, color: isLate ? T.red : T.soft }}>{isLate ? a.late : '--'}</span></Td>
                    <Td right mono><span style={{ fontWeight: isOt ? 700 : 400, color: isOt ? T.green : T.soft }}>{isOt ? a.ot : '--'}</span></Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: T.bg }}>
                <Td colSpan={3}><b style={{ color: T.red, fontFamily: F_HEAD, letterSpacing: '0.03em' }}>TOTAL FOR THIS MONTH</b></Td>
                <Td right mono><b style={{ color: T.red }}>{totalLateMins}m</b></Td>
                <Td right mono><b style={{ color: T.green }}>{totalOtMins}m</b></Td>
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-2.5 flex flex-wrap gap-4 text-xs" style={{ borderTop: `1px solid ${T.line}`, fontFamily: F_BODY, color: T.soft }}>
            <span>Click Time-In / Time-Out to manually edit</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: T.red }} /> Late rows highlighted</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: T.green }} /> OT values in green</span>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between mb-1">
            <Eyebrow>Attendance History — {current.name}</Eyebrow>
            <BarChart3 size={14} color={T.soft} />
          </div>
          <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Days present/absent and tardiness, last 3 months (6 cutoffs)</div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend} margin={{ left: -15, right: 10, top: 5, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} vertical={false} />
              <XAxis dataKey="cutoff" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: F_BODY }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: F_BODY }} />
              <Bar yAxisId="left" dataKey="present" name="Days present" fill={T.green} radius={[3, 3, 0, 0]} barSize={14} />
              <Bar yAxisId="left" dataKey="absent" name="Days absent" fill={T.red} radius={[3, 3, 0, 0]} barSize={14} />
              <Line yAxisId="right" type="monotone" dataKey="late" name="Late (min)" stroke={T.amber} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6">
      <H1 sub="Military time, two columns only. Imported from the biometric .xls export each cutoff."
        action={<Btn variant="outline" icon={ClipboardList} onClick={runImport} disabled={importing}>{importing ? 'Importing…' : 'Import Biometric .xls'}</Btn>}>Attendance</H1>

      {importing && <div className="mb-4 flex items-center gap-2 p-3 rounded text-sm" style={{ backgroundColor: T.blueBg, color: T.blue, fontFamily: F_BODY }}><ClipboardList size={14} /> Reading attendance file…</div>}

      <div className="flex items-center gap-3 mb-4">
        <Badge tone="blue">May 01 – 15, 2026</Badge>
        <div className="flex gap-1 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft }}>
          {[['dtr', 'Employee DTR'], ['history', 'Import History']].map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: subTab === k ? T.surface : 'transparent', color: subTab === k ? T.ink : T.soft }}>{l}</button>
          ))}
        </div>
      </div>

      {subTab === 'dtr' && (
        <>
          <div className="mb-4 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.amberBg }}>
            <AlertTriangle size={16} color={T.amber} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>Pending / Unmapped — Biometric ID #47</div>
              <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>3 time entries came in under a User ID with no matching employee record. <button className="underline font-semibold">Register this employee</button> to bring the logs in.</div>
            </div>
          </div>
          <Panel className="overflow-hidden">
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th right>Days Late</Th><Th right>Late (mins)</Th><Th right>OT (mins)</Th><Th right>Absences</Th><Th>Action</Th></tr></thead>
              <tbody>
                {staff.map(s => {
                  const t = summarizeDtr(s.id);
                  return (
                    <tr key={s.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Av name={s.name} size={28} />
                          <div>
                            <div className="font-semibold" style={{ fontFamily: F_BODY }}>{s.name}</div>
                            <div className="text-xs" style={{ color: T.soft, fontFamily: F_MONO }}>{s.id}</div>
                          </div>
                        </div>
                      </Td>
                      <Td right mono><span style={{ color: t.daysLate > 0 ? T.red : T.soft, fontWeight: t.daysLate > 0 ? 700 : 400 }}>{t.daysLate || '—'}</span></Td>
                      <Td right mono><span style={{ color: t.late > 0 ? T.red : T.soft, fontWeight: t.late > 0 ? 700 : 400 }}>{t.late > 0 ? `${t.late}m` : '—'}</span></Td>
                      <Td right mono><span style={{ color: t.ot > 0 ? T.green : T.soft, fontWeight: t.ot > 0 ? 700 : 400 }}>{t.ot > 0 ? `${t.ot}m` : '—'}</span></Td>
                      <Td right mono><span style={{ color: t.absent > 0 ? T.amber : T.soft, fontWeight: t.absent > 0 ? 700 : 400 }}>{t.absent || '—'}</span></Td>
                      <Td><Btn size="sm" variant="outline" icon={Eye} onClick={() => { setSelectedId(s.id); setView('dtr'); }}>View DTR</Btn></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          {history.length === 0 ? <EmptyState icon={ClipboardList} title="No imports yet" desc="Upload an attendance .xls file to get started." /> : (
            <table className="w-full">
              <thead><tr><Th>Date</Th><Th>Filename</Th><Th right>Employees Imported</Th><Th>Status</Th></tr></thead>
              <tbody>{history.map((h, i) => (
                <tr key={i}><Td mono>{h.date}</Td><Td mono>{h.file}</Td><Td right mono>{h.count}</Td><Td><Badge tone={h.status === 'Success' ? 'green' : 'red'}>{h.status}</Badge></Td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
};

/* ============================= DELIVERY FORM (shared: admin + checker) ============================= */
// Truck/crew stays the entry point (matches "grouped by truck" payroll sheets), but the
// driver + pahinante for THIS delivery are editable — a Checker can swap in a substitute
// helper for the day without that truck's permanent roster changing.
