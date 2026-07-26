'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ClipboardList, ArrowLeft, Check, Eye, Upload } from 'lucide-react';
import { Av, Badge, BigStat, Btn, EmptyState, Eyebrow, H1, Panel, Td, Th } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

const CREW = new Set(['Driver', 'Pahinante', 'Checker']);
const callTimeLabel = (emp) => {
  if (!emp) return '6:40 AM';
  if ((emp.earlyShiftDays || []).length) return `${emp.earlyShiftTime || '06:00'} (early shift)`;
  return CREW.has(emp.position) ? '6:30 AM' : '6:40 AM';
};
const asUTC = (iso) => new Date(iso + 'T00:00:00Z');
const fmtDay = (iso) => asUTC(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtPeriod = (p) => (p ? `${fmtDay(p.start)} – ${asUTC(p.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : '—');

export const AttendanceView = ({ staff, toast }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('dtr');
  const [data, setData] = useState({ period: null, summaries: [], unmappedCount: 0, batches: [] });
  const [loading, setLoading] = useState(true);
  const [dtr, setDtr] = useState({ period: null, rows: [] });
  const [dtrLoading, setDtrLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [unmapped, setUnmapped] = useState([]);
  const [unmappedLoading, setUnmappedLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setData(await res.json());
    } catch (err) { console.error('Could not load attendance:', err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const loadUnmapped = async () => {
    setUnmappedLoading(true);
    try {
      const res = await fetch('/api/attendance/unmapped');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      setUnmapped(d.groups || []);
    } catch (err) { console.error('Could not load unmapped IDs:', err); }
    finally { setUnmappedLoading(false); }
  };
  useEffect(() => { if (subTab === 'unmapped') loadUnmapped(); }, [subTab]);

  const resolveId = async (biometricId) => {
    setResolvingId(biometricId);
    try {
      const res = await fetch('/api/attendance/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ biometricId }),
      });
      const result = await res.json();
      if (!res.ok) { toast(result.error || 'Could not resolve.', 'error'); return; }
      toast(`Resolved ${result.present} day(s) present for ${result.employee}.`);
      await Promise.all([loadUnmapped(), load()]);
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  useEffect(() => {
    if (view !== 'dtr' || !selectedId) return;
    let cancelled = false;
    setDtrLoading(true);
    fetch(`/api/attendance?employeeId=${encodeURIComponent(selectedId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => { if (!cancelled) setDtr(d); })
      .catch(err => console.error('Could not load DTR:', err))
      .finally(() => { if (!cancelled) setDtrLoading(false); });
    return () => { cancelled = true; };
  }, [view, selectedId]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/attendance/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataBase64 }),
      });
      const result = await res.json();
      if (!res.ok) { toast(result.error || 'Import failed.', 'error'); return; }
      toast(`Imported ${result.mappedRows} rows for ${result.matchedEmployees} employee(s)` + (result.unmappedUsers ? ` · ${result.unmappedUsers} unmapped ID(s).` : '.'));
      await load();
    } catch (err) {
      toast(err.message || 'Could not import the file.', 'error');
    } finally {
      setImporting(false);
    }
  };

  // ===== DTR view =====
  if (view === 'dtr' && selectedId) {
    const emp = staff.find(s => s.id === selectedId);
    const summary = data.summaries.find(s => s.id === selectedId);
    const name = emp?.name || summary?.name || selectedId;
    const rows = dtr.rows || [];
    const daysLate = rows.filter(r => r.late > 0).length;
    const lateMins = rows.reduce((s, r) => s + r.late, 0);
    const otMins = rows.reduce((s, r) => s + r.ot, 0);
    const absent = rows.filter(r => r.absent).length;

    return (
      <div className="p-6">
        <button onClick={() => { setView('list'); setSelectedId(null); }} className="flex items-center gap-1.5 text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Attendance
        </button>
        <Panel className="p-5 mb-5">
          <div className="flex items-center gap-5 flex-wrap">
            <Av name={name} size={52} tone={T.brand} />
            <div className="flex-1" style={{ minWidth: 160 }}>
              <div className="text-lg font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{name}</div>
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{emp?.position || '—'} · {selectedId} · Call time {callTimeLabel(emp)}</div>
            </div>
            <div className="flex gap-6 flex-wrap">
              <BigStat value={daysLate} label="Days Late" />
              <BigStat value={`${lateMins}m`} label="Total Late" tone={T.red} />
              <BigStat value={`${otMins}m`} label="Overtime" tone={T.green} />
              <BigStat value={absent} label="Absences" tone={T.amber} />
            </div>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-1" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Daily Time Record — {fmtPeriod(dtr.period)}</div>
          </div>
          {dtrLoading ? <div className="p-6 text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>Loading…</div>
            : rows.length === 0 ? <EmptyState icon={ClipboardList} title="No attendance yet" desc="Import a biometric .xls file to populate this employee's record." />
            : (
            <table className="w-full">
              <thead><tr><Th>Date</Th><Th>Time In</Th><Th>Time Out</Th><Th right>Late (mins)</Th><Th right>OT (mins)</Th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const isLate = a.late > 0, isOt = a.ot > 0;
                  const rowBg = isLate ? T.redBg : a.absent ? T.amberBg : 'transparent';
                  return (
                    <tr key={a.date} style={{ backgroundColor: rowBg }}>
                      <Td>
                        <span className="font-bold mr-2" style={{ fontFamily: F_MONO, color: T.ink }}>{a.date.slice(8)}</span>
                        <span className="text-xs" style={{ fontFamily: F_BODY, color: isLate ? T.red : a.absent ? T.amber : T.soft }}>{a.weekday}</span>
                        {a.absent && <span className="ml-2"><Badge tone="amber">ABSENT</Badge></span>}
                        {a.assumedIn && !a.absent && <span className="ml-2"><Badge tone="red">NO IN-SCAN</Badge></span>}
                        {a.assumedOut && !a.absent && <span className="ml-2"><Badge tone="blue">ASSUMED OUT</Badge></span>}
                        {a.manual && <span className="ml-2"><Badge tone="blue">EDITED</Badge></span>}
                      </Td>
                      <Td mono>{a.in || '—'}</Td>
                      <Td mono>{a.out || '—'}</Td>
                      <Td right mono><span style={{ fontWeight: isLate ? 700 : 400, color: isLate ? T.red : T.soft }}>{isLate ? a.late : '--'}</span></Td>
                      <Td right mono><span style={{ fontWeight: isOt ? 700 : 400, color: isOt ? T.green : T.soft }}>{isOt ? a.ot : '--'}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: T.bg }}>
                  <Td colSpan={3}><b style={{ color: T.red, fontFamily: F_HEAD, letterSpacing: '0.03em' }}>TOTAL</b></Td>
                  <Td right mono><b style={{ color: T.red }}>{lateMins}m</b></Td>
                  <Td right mono><b style={{ color: T.green }}>{otMins}m</b></Td>
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
      </div>
    );
  }

  // ===== List view =====
  return (
    <div className="p-6">
      <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={onFile} style={{ display: 'none' }} />
      <H1 sub="Imported from the biometric .xls export. Matched to employees by their biometric User ID."
        action={<Btn variant="outline" icon={Upload} onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Importing…' : 'Import Biometric .xls'}</Btn>}>Attendance</H1>

      {importing && <div className="mb-4 flex items-center gap-2 p-3 rounded text-sm" style={{ backgroundColor: T.blueBg, color: T.blue, fontFamily: F_BODY }}><ClipboardList size={14} /> Reading and matching the attendance file…</div>}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Badge tone="blue">{data.period ? fmtPeriod(data.period) : 'No imports yet'}</Badge>
        <div className="flex gap-1 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft }}>
          {[['dtr', 'Employee DTR'], ['unmapped', 'Unmapped IDs'], ['history', 'Import History']].map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: subTab === k ? T.surface : 'transparent', color: subTab === k ? T.ink : T.soft }}>{l}</button>
          ))}
        </div>
      </div>

      {subTab === 'dtr' && (
        <>
          {data.unmappedCount > 0 && (
            <div className="mb-4 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.amberBg }}>
              <AlertTriangle size={16} color={T.amber} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{data.unmappedCount} unmapped time {data.unmappedCount === 1 ? 'entry' : 'entries'}</div>
                <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>Some scans came in under a biometric User ID with no matching employee. Open the <button onClick={() => setSubTab('unmapped')} className="underline font-semibold" style={{ color: T.brand }}>Unmapped IDs</button> tab to see who they are and bring their logs in.</div>
              </div>
            </div>
          )}
          <Panel className="overflow-hidden">
            {loading ? <div className="p-6 text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>Loading…</div>
              : data.summaries.length === 0 ? <EmptyState icon={ClipboardList} title="No attendance yet" desc="Import a biometric .xls file to get started. Employees are matched by their biometric User ID." />
              : (
              <table className="w-full">
                <thead><tr><Th>Employee</Th><Th right>Present</Th><Th right>Days Late</Th><Th right>Late (mins)</Th><Th right>OT (mins)</Th><Th right>Absences</Th><Th>Action</Th></tr></thead>
                <tbody>
                  {data.summaries.map(s => (
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
                      <Td right mono>{s.present}</Td>
                      <Td right mono><span style={{ color: s.daysLate > 0 ? T.red : T.soft, fontWeight: s.daysLate > 0 ? 700 : 400 }}>{s.daysLate || '—'}</span></Td>
                      <Td right mono><span style={{ color: s.lateMins > 0 ? T.red : T.soft, fontWeight: s.lateMins > 0 ? 700 : 400 }}>{s.lateMins > 0 ? `${s.lateMins}m` : '—'}</span></Td>
                      <Td right mono><span style={{ color: s.otMins > 0 ? T.green : T.soft, fontWeight: s.otMins > 0 ? 700 : 400 }}>{s.otMins > 0 ? `${s.otMins}m` : '—'}</span></Td>
                      <Td right mono><span style={{ color: s.absent > 0 ? T.amber : T.soft, fontWeight: s.absent > 0 ? 700 : 400 }}>{s.absent || '—'}</span></Td>
                      <Td><Btn size="sm" variant="outline" icon={Eye} onClick={() => { setSelectedId(s.id); setView('dtr'); }}>View DTR</Btn></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      {subTab === 'unmapped' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Unmapped Biometric IDs</div>
            <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>
              Scans na walang katugmang empleyado. Register the person using this biometric ID, then Resolve to bring their attendance in — no re-import needed.
            </div>
          </div>
          {unmappedLoading ? <div className="p-6 text-sm" style={{ color: T.soft, fontFamily: F_BODY }}>Loading…</div>
            : unmapped.length === 0 ? <EmptyState icon={ClipboardList} title="Nothing unmapped" desc="Every imported scan is matched to an employee." />
            : (
            <table className="w-full">
              <thead><tr><Th>Biometric ID</Th><Th>Name (from file)</Th><Th right>Scans</Th><Th>Dates</Th><Th>Action</Th></tr></thead>
              <tbody>
                {unmapped.map((g) => (
                  <tr key={g.biometricId}>
                    <Td mono><span className="font-bold" style={{ color: T.ink }}>{g.biometricId}</span></Td>
                    <Td>
                      <span style={{ fontFamily: F_BODY, color: T.ink }}>{g.biometricName || '—'}</span>
                      {g.hasEmployee && <span className="ml-2"><Badge tone="green">registered</Badge></span>}
                    </Td>
                    <Td right mono>{g.punchCount}</Td>
                    <Td mono><span className="text-xs" style={{ color: T.soft }}>{g.firstDate} → {g.lastDate}</span></Td>
                    <Td>
                      {g.hasEmployee ? (
                        <Btn size="sm" icon={Check} disabled={resolvingId === g.biometricId} onClick={() => resolveId(g.biometricId)}>
                          {resolvingId === g.biometricId ? 'Resolving…' : 'Resolve'}
                        </Btn>
                      ) : (
                        <span className="text-xs" style={{ fontFamily: F_BODY, color: T.amber }}>Register ID {g.biometricId} first</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          {data.batches.length === 0 ? <EmptyState icon={ClipboardList} title="No imports yet" desc="Upload an attendance .xls file to get started." /> : (
            <table className="w-full">
              <thead><tr><Th>Imported</Th><Th>Filename</Th><Th>Period</Th><Th right>Mapped</Th><Th right>Unmapped</Th><Th>Status</Th></tr></thead>
              <tbody>{data.batches.map((b) => (
                <tr key={b.id}>
                  <Td mono>{new Date(b.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Td>
                  <Td mono>{b.filename}</Td>
                  <Td mono>{b.periodStart ? `${b.periodStart} → ${b.periodEnd}` : '—'}</Td>
                  <Td right mono>{b.mappedRows}</Td>
                  <Td right mono><span style={{ color: b.unmappedRows > 0 ? T.amber : T.soft }}>{b.unmappedRows}</span></Td>
                  <Td><Badge tone={b.status === 'COMPLETED' ? 'green' : b.status === 'FAILED' ? 'red' : 'amber'}>{b.status}</Badge></Td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
};
