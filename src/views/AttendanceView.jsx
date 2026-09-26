'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ClipboardList, ArrowLeft, Pencil, Upload, Loader2 } from 'lucide-react';
import { Av, Badge, BigStat, Btn, EmptyState, Eyebrow, Field, H1, Modal, Panel, SkeletonBlock, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

// Compact "Xs/Xm/Xh ago" from an absolute ISO time (the device's last heartbeat).
const agoFrom = (iso) => {
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

const CREW = new Set(['Driver', 'Pahinante', 'Checker']);
const callTimeLabel = (emp) => {
  if (!emp) return '6:40 AM';
  if ((emp.earlyShiftDays || []).length) return `${emp.earlyShiftTime || '06:00'} (early shift)`;
  return CREW.has(emp.position) ? '6:30 AM' : '6:40 AM';
};
const asUTC = (iso) => new Date(iso + 'T00:00:00Z');
const fmtDay = (iso) => asUTC(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtPeriod = (p) => (p ? `${fmtDay(p.start)} – ${asUTC(p.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : '—');
// Step a YYYY-MM-DD string by whole days (UTC, matching how dates are stored).
const shiftYmd = (iso, delta) => { const d = asUTC(iso); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
// Enum position -> readable label: ADMINISTRATIVE_STAFF -> Administrative Staff.
const prettyPosition = (p) => (p ? String(p).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);
// Live board table cells, matched to the mockup: 18px edge alignment with the
// header and stats above, tight type, tabular figures set per cell.
const liveThBase = { fontFamily: F_HEAD, fontSize: 11.5, fontWeight: 600, color: T.soft, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', padding: '13px 18px', borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` };
const liveTdBase = { fontFamily: F_BODY, fontSize: 14.5, color: T.ink, padding: '14px 18px', borderBottom: `1px solid ${T.lineSoft}`, verticalAlign: 'middle' };
// Cutoff maths for the "Pull from device" selector (1-15 and 16-end each month).
const manilaTodayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const cutoffOf = (y, mi0, half) => {
  const mm = String(mi0 + 1).padStart(2, '0');
  if (half === 'A') return { from: `${y}-${mm}-01`, to: `${y}-${mm}-15` };
  const end = new Date(Date.UTC(y, mi0 + 1, 0)).getUTCDate();
  return { from: `${y}-${mm}-16`, to: `${y}-${mm}-${String(end).padStart(2, '0')}` };
};
const recentCutoffs = (todayStr, n = 3) => {
  const [y, m, d] = todayStr.split('-').map(Number);
  let yy = y, mi = m - 1, half = d <= 15 ? 'A' : 'B';
  const list = [];
  for (let i = 0; i < n; i += 1) { list.push(cutoffOf(yy, mi, half)); if (half === 'B') { half = 'A'; } else { half = 'B'; mi -= 1; if (mi < 0) { mi = 11; yy -= 1; } } }
  return list;
};
const cutoffLabel = (c) => `${asUTC(c.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${asUTC(c.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
const shiftCutoff = (sel, dir) => {
  const [y, m] = sel.from.split('-').map(Number);
  let yy = y, mi = m - 1, half = sel.from.slice(8) === '01' ? 'A' : 'B';
  if (dir > 0) { if (half === 'A') half = 'B'; else { half = 'A'; mi += 1; if (mi > 11) { mi = 0; yy += 1; } } }
  else if (half === 'B') half = 'A'; else { half = 'B'; mi -= 1; if (mi < 0) { mi = 11; yy -= 1; } }
  return cutoffOf(yy, mi, half);
};

export const AttendanceView = ({ staff, toast, onRegister }) => {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState('live');
  const [data, setData] = useState({ period: null, summaries: [], unmappedCount: 0, batches: [] });
  const [loading, setLoading] = useState(true);
  const [liveDate, setLiveDate] = useState(null); // null = today (live); 'YYYY-MM-DD' = a past day
  const [liveData, setLiveData] = useState({ date: null, today: null, isToday: true, rows: [], stats: { present: 0, late: 0, notYetIn: 0 }, sync: { status: 'offline', lastSyncAt: null, lastScanAt: null } });
  const [liveLoading, setLiveLoading] = useState(true);
  const [pullReq, setPullReq] = useState(null);
  const [pullBusy, setPullBusy] = useState(false);
  const [pullError, setPullError] = useState(null);
  const [pullSel, setPullSel] = useState(() => recentCutoffs(manilaTodayStr(), 2)[1]); // default: most recently ended cutoff
  const [pullDevice, setPullDevice] = useState({ status: 'offline' });
  const [, setAgoTick] = useState(0);
  const [dtr, setDtr] = useState({ period: null, rows: [] });
  const [dtrLoading, setDtrLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [unmapped, setUnmapped] = useState([]);
  const [unmappedLoading, setUnmappedLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [editDay, setEditDay] = useState(null);
  const [editForm, setEditForm] = useState({ status: 'present', timeIn: '', timeOut: '', note: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [viewBatch, setViewBatch] = useState(null);
  const [histDtr, setHistDtr] = useState(null);
  const [histDtrLoading, setHistDtrLoading] = useState(false);
  const [batchRows, setBatchRows] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/attendance');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setData(await res.json());
    } catch (err) { console.error('Could not load attendance:', err); }
    finally { if (!silent) setLoading(false); }
  };

  // Live board: today's scans plus the device connection status. The pill reads
  // the server's heartbeat (liveData.sync), so it tells a real device sync from
  // a browser that is merely still polling.
  const loadLive = async ({ silent = false } = {}) => {
    if (!silent) setLiveLoading(true);
    try {
      const res = await fetch(`/api/attendance?live=1${liveDate ? `&date=${liveDate}` : ''}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setLiveData(await res.json());
    } catch (err) { console.error('Could not load live attendance:', err); }
    finally { if (!silent) setLiveLoading(false); }
  };

  // "Pull from device": queue a request; the sync agent executes it and marks it
  // done. We only poll while one is active.
  const currentCutoff = recentCutoffs(manilaTodayStr(), 1)[0];
  const canGoNext = pullSel.from < currentCutoff.from;
  const pullActive = !!pullReq && (pullReq.status === 'PENDING' || pullReq.status === 'RUNNING');

  const fetchPull = async () => {
    try {
      const r = await fetch('/api/attendance/pull-request');
      if (r.ok) { const j = await r.json(); setPullReq(j.request); if (j.device) setPullDevice(j.device); }
    } catch { /* ignore */ }
  };
  const queuePull = async () => {
    setPullBusy(true); setPullError(null);
    try {
      const r = await fetch('/api/attendance/pull-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: pullSel.from, to: pullSel.to }),
      });
      const j = await r.json();
      if (r.ok) { setPullReq(j.request); }
      else { setPullReq(j.request || pullReq); setPullError(j.error || 'Could not queue the pull.'); }
    } catch { setPullError('Could not queue the pull.'); }
    finally { setPullBusy(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- intentional: load the active tab's data on mount and when the tab or selected day changes
  useEffect(() => { if (subTab === 'live') loadLive(); else if (subTab === 'dtr' || subTab === 'history') load(); }, [subTab, liveDate]);

  // Show any in-progress pull when opening the DTR tab.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch of pull status when the DTR tab opens
  useEffect(() => { if (subTab === 'dtr') fetchPull(); }, [subTab]);

  // Poll a queued pull until it finishes, then refresh the DTR to show the result.
  useEffect(() => {
    if (pullReq?.status !== 'PENDING' && pullReq?.status !== 'RUNNING') return undefined;
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/attendance/pull-request');
        if (!r.ok) return;
        const j = await r.json();
        setPullReq(j.request);
        if (j.device) setPullDevice(j.device);
        if (j.request && j.request.status === 'DONE') load({ silent: true });
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(id);
  }, [pullReq?.status]);

  // Live auto-refresh: always-on ~15s poll while this page is open. A "latest" ref
  // lets the interval call the newest load() without re-creating the timer each render.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = () => (subTab === 'live' ? (liveDate === null ? loadLive({ silent: true }) : undefined) : load({ silent: true })); });
  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = !!editDay; }, [editDay]);
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return; // skip when tab hidden (resumes automatically)
      if (editingRef.current) return; // do not refresh under an open correction
      loadRef.current({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, []);
  // tick once a second so the "Updated Xs ago" label stays current
  useEffect(() => {
    const id = setInterval(() => setAgoTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadDtr = async (id) => {
    setDtrLoading(true);
    try {
      const res = await fetch(`/api/attendance?employeeId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setDtr(await res.json());
    } catch (err) { console.error('Could not load DTR:', err); }
    finally { setDtrLoading(false); }
  };

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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    if (view === 'dtr' && selectedId) loadDtr(selectedId);
  }, [view, selectedId]);

  const openEdit = (a) => {
    setEditForm({ status: a.leave ? 'leave' : (a.absent ? 'absent' : 'present'), timeIn: a.in || '', timeOut: a.out || '', note: '' });
    setEditDay(a);
  };
  const saveEdit = async () => {
    if (!editDay) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedId, date: editDay.date,
          isLeave: editForm.status === 'leave',
          isAbsent: editForm.status === 'absent',
          timeIn: editForm.status === 'present' ? editForm.timeIn : null,
          timeOut: editForm.status === 'present' ? editForm.timeOut : null,
          editNote: editForm.note,
        }),
      });
      const result = await res.json();
      if (!res.ok) { toast(result.error || 'Could not save the correction.', 'error'); return; }
      toast('Attendance corrected.');
      setEditDay(null);
      await Promise.all([loadDtr(selectedId), load()]);
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    if (!/\.(xls|xlsx)$/i.test(file.name)) { toast('Please choose a .xls or .xlsx biometric export.', 'error'); return; }
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
      setShowImport(false);
    } catch (err) {
      toast(err.message || 'Could not import the file.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    importFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    importFile(e.dataTransfer?.files?.[0]);
  };

  // Locked day-by-day DTR for one employee within a past import's period — the
  // same DTR the live tab shows, but read-only (corrections happen on the live DTR).
  const openHistDtr = async (s) => {
    if (!viewBatch) return;
    const period = `${viewBatch.periodStart} \u2192 ${viewBatch.periodEnd}`;
    setHistDtr({ name: s.name, rows: [], period });
    setHistDtrLoading(true);
    try {
      const res = await fetch(`/api/attendance?employeeId=${encodeURIComponent(s.id)}&from=${viewBatch.periodStart}&to=${viewBatch.periodEnd}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      setHistDtr({ name: s.name, rows: d.rows || [], period });
    } catch (err) {
      console.error('Could not load DTR:', err);
      toast('Could not load that DTR.', 'error');
    } finally {
      setHistDtrLoading(false);
    }
  };

  // Read-only look-back at a past import: fetch that batch's period summaries.
  // Nothing here can be edited — corrections still happen on the live DTR.
  const openBatch = async (b) => {
    if (!b.periodStart || !b.periodEnd) { toast('This import has no date range to view.', 'error'); return; }
    setViewBatch(b);
    setBatchLoading(true);
    setBatchRows([]);
    try {
      const res = await fetch(`/api/attendance?from=${b.periodStart}&to=${b.periodEnd}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      setBatchRows(d.summaries || []);
    } catch (err) {
      console.error('Could not load batch records:', err);
      toast('Could not load those records.', 'error');
    } finally {
      setBatchLoading(false);
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
    const leave = rows.filter(r => r.leave).length;

    return (
      <div className="p-4 sm:p-6">
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
              <BigStat value={leave} label="On Leave" tone={T.brand} />
            </div>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-1" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Daily Time Record — {fmtPeriod(dtr.period)}</div>
            <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Tap a day to correct it.</div>
          </div>
          {dtrLoading ? <SkeletonBlock avatar={false} />
            : rows.length === 0 ? <EmptyState icon={ClipboardList} title="No attendance yet" desc="Import a biometric .xls file to populate this employee's record." />
            : (
            <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead><tr><Th>Date</Th><Th>Time In</Th><Th>Time Out</Th><Th center>Late (mins)</Th><Th center>OT (mins)</Th><Th></Th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const isLate = a.late > 0, isOt = a.ot > 0;
                  const rowBg = isLate ? T.redBg : a.absent ? T.amberBg : 'transparent';
                  return (
                    <tr key={a.date} onClick={() => openEdit(a)} style={{ backgroundColor: rowBg, cursor: 'pointer' }}>
                      <Td>
                        <span className="font-bold mr-2" style={{ fontFamily: F_MONO, color: T.ink }}>{a.date.slice(8)}</span>
                        <span className="text-xs" style={{ fontFamily: F_BODY, color: isLate ? T.red : a.absent ? T.amber : T.soft }}>{a.weekday}</span>
                        {a.absent && <span className="ml-2"><Badge tone="amber">ABSENT</Badge></span>}
                        {a.leave && <span className="ml-2"><Badge tone="blue">ON LEAVE</Badge></span>}
                        {a.assumedIn && !a.absent && <span className="ml-2"><Badge tone="red">NO IN-SCAN</Badge></span>}
                        {a.assumedOut && !a.absent && <span className="ml-2"><Badge tone="blue">ASSUMED OUT</Badge></span>}
                        {a.manual && <span className="ml-2"><Badge tone="blue">EDITED</Badge></span>}
                      </Td>
                      <Td mono>{a.in || '—'}</Td>
                      <Td mono>{a.out || '—'}</Td>
                      <Td center mono><span style={{ fontWeight: isLate ? 700 : 400, color: isLate ? T.red : T.soft }}>{isLate ? a.late : '--'}</span></Td>
                      <Td center mono><span style={{ fontWeight: isOt ? 700 : 400, color: isOt ? T.green : T.soft }}>{isOt ? a.ot : '--'}</span></Td>
                      <Td right><Pencil size={13} style={{ color: T.soft }} /></Td>
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

        {/* Per-day correction — recomputes tardiness and flags the row EDITED */}
        <Modal open={!!editDay} onClose={() => setEditDay(null)} title={`Correct ${editDay ? `${name} — ${editDay.date}` : ''}`} width={440}>
          {editDay && (
            <div className="space-y-3">
              <Field label="Status">
                <div className="flex gap-2">
                  {[['present', 'Present'], ['leave', 'On Leave'], ['absent', 'Absent']].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setEditForm((f) => ({ ...f, status: val }))}
                      className="flex-1 px-2 py-2 rounded border text-sm font-semibold transition-colors"
                      style={{ borderColor: editForm.status === val ? T.brand : T.line, backgroundColor: editForm.status === val ? T.brandBg : T.surface, color: editForm.status === val ? T.brand : T.soft, fontFamily: F_HEAD }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </Field>
              {editForm.status === 'leave' && (
                <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Paid leave — counted toward pay like a present day, tracked against the employee&apos;s leave credits.</div>
              )}
              {editForm.status === 'present' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Time In"><input type="time" value={editForm.timeIn} onChange={(e) => setEditForm((f) => ({ ...f, timeIn: e.target.value }))} className={inputCls} style={inputStyle} /></Field>
                  <Field label="Time Out"><input type="time" value={editForm.timeOut} onChange={(e) => setEditForm((f) => ({ ...f, timeOut: e.target.value }))} className={inputCls} style={inputStyle} /></Field>
                </div>
              )}
              <Field label="Reason / note (optional)"><input value={editForm.note} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. brownout, scanner down" className={inputCls} style={inputStyle} /></Field>
              <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
                Tardiness is recomputed automatically from the times. Blank time-in = missing scan (30-min penalty); blank time-out = assumed 5:00 PM. This day will be marked EDITED and won&apos;t be overwritten by future imports.
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Btn variant="outline" onClick={() => setEditDay(null)} disabled={savingEdit}>Cancel</Btn>
                <Btn onClick={saveEdit} loading={savingEdit} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save correction'}</Btn>
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  // ===== List view =====
  return (
    <div className="p-4 sm:p-6">
      <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={onFile} style={{ display: 'none' }} />
      <H1>Attendance</H1>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {subTab !== 'live' && <Badge tone="blue">{data.period ? fmtPeriod(data.period) : 'No imports yet'}</Badge>}
        <div className="flex gap-1 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft }}>
          {[['live', 'Live'], ['dtr', 'Employee DTR'], ['unmapped', 'Unmapped IDs'], ['history', 'Import History']].map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: subTab === k ? T.surface : 'transparent', color: subTab === k ? T.ink : T.soft }}>{l}</button>
          ))}
        </div>
      </div>

      {subTab === 'live' && (
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
                <div style={{ fontFamily: F_HEAD, fontWeight: 700, fontSize: 17, color: T.ink }}>{liveData.isToday ? 'Today' : (liveData.date ? fmtDay(liveData.date) : ' ')}</div>
                <div style={{ fontFamily: F_BODY, fontSize: 12, color: T.soft, marginTop: 1 }}>
                  {liveData.date ? asUTC(liveData.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ' '}
                </div>
              </div>
              {!liveData.isToday && (
                <button onClick={() => setLiveDate(null)} className="rounded-full pd-clickable" style={{ fontFamily: F_HEAD, fontSize: 12, fontWeight: 600, color: T.brand, background: T.brandBg, border: 'none', padding: '5px 11px' }}>Back to today</button>
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

          <div className="flex flex-wrap" style={{ gap: 10, padding: '16px 18px' }}>
            {[
              [liveData.isToday ? 'Present today' : 'Present', liveData.stats.present, T.ink, false],
              ['Late', liveData.stats.late, T.red, false],
              [liveData.isToday ? 'Not yet in' : 'Absent / no scan', liveData.stats.notYetIn, T.soft, true],
            ].map(([label, n, color, dashed]) => (
              <div key={label} style={{ background: dashed ? 'transparent' : T.surface, border: `1px ${dashed ? 'dashed' : 'solid'} ${T.line}`, borderRadius: 12, padding: '12px 16px', minWidth: 128 }}>
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
                  <th style={{ ...liveThBase, width: '14%', textAlign: 'center' }}>Late (mins)</th>
                  <th style={{ ...liveThBase, width: '14%', textAlign: 'center' }}>Status</th>
                </tr></thead>
                <tbody>
                  {liveData.rows.map(r => (
                    <tr key={r.id}>
                      <td style={liveTdBase}>
                        <div style={{ fontFamily: F_BODY, fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontFamily: F_BODY, fontSize: 12, color: T.soft, marginTop: 1 }}>{r.position ? `${prettyPosition(r.position)} · ${r.id}` : r.id}</div>
                      </td>
                      <td style={{ ...liveTdBase, fontVariantNumeric: 'tabular-nums' }}>{r.in || <span style={{ color: T.line }}>—</span>}{r.assumedIn && <span style={{ marginLeft: 8, fontSize: 11, color: T.soft }}>assumed</span>}</td>
                      <td style={{ ...liveTdBase, fontVariantNumeric: 'tabular-nums' }}>{r.out || <span style={{ color: T.line }}>—</span>}</td>
                      <td style={{ ...liveTdBase, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.late > 0 ? <span style={{ color: T.red, fontWeight: 700 }}>{r.late}m</span> : <span style={{ color: T.line }}>—</span>}</td>
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
      )}

      {subTab === 'dtr' && (
        <>
          <div className="rounded-xl mb-4 overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
            <div className="flex items-center justify-between gap-4 flex-wrap" style={{ padding: '16px 18px' }}>
              <div className="flex items-center gap-2.5">
                <button onClick={() => setPullSel(shiftCutoff(pullSel, -1))} disabled={pullActive} className="rounded-lg flex items-center justify-center pd-clickable" style={{ width: 30, height: 30, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 16, lineHeight: 1 }} aria-label="Previous cutoff">&lsaquo;</button>
                <button onClick={() => setPullSel(shiftCutoff(pullSel, 1))} disabled={pullActive || !canGoNext} className="rounded-lg flex items-center justify-center pd-clickable" style={{ width: 30, height: 30, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 16, lineHeight: 1, opacity: canGoNext ? 1 : 0.35 }} aria-label="Next cutoff">&rsaquo;</button>
                <div style={{ minWidth: 190 }}>
                  <div style={{ fontFamily: F_HEAD, fontWeight: 700, fontSize: 17, color: T.ink }}>{cutoffLabel(pullSel)}</div>
                  <div style={{ fontFamily: F_BODY, fontSize: 12, color: T.soft, marginTop: 1 }}>Cutoff to pull from the device</div>
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
                <Btn onClick={queuePull} loading={pullBusy || pullActive} disabled={pullBusy || pullActive}>{pullActive ? 'Pulling…' : 'Pull from device'}</Btn>
                <Btn variant="ghost" onClick={() => setShowImport(true)}>Import .xls</Btn>
              </div>
            </div>
            {(() => {
              let banner = null;
              const devOffline = pullDevice.status !== 'live';
              if (pullActive && devOffline) banner = { tone: 'warn', text: `${pullReq.status === 'RUNNING' ? 'Started, but the' : 'Queued, but the'} device or agent looks offline, so it can't be read right now. It will run automatically once they are back online on the warehouse PC — or press "Pull from device" again to retry.` };
              else if (pullActive) banner = { tone: 'info', text: pullReq.status === 'PENDING' ? 'Queued — the device agent will run it on its next sync…' : `Pulling ${pullReq.from} to ${pullReq.to} from the device…` };
              else if (pullError) banner = { tone: 'warn', text: pullError };
              else if (pullReq && pullReq.status === 'DONE') banner = { tone: 'ok', text: `Pulled ${pullReq.from} to ${pullReq.to}: ${pullReq.mappedRows} rows across ${pullReq.matched} employees${pullReq.unmappedUsers ? `, ${pullReq.unmappedUsers} unmapped` : ''}. Review below, then run payroll.` };
              else if (pullReq && pullReq.status === 'FAILED') banner = { tone: 'warn', text: `Pull failed: ${pullReq.error || 'unknown error'}` };
              if (!banner) return null;
              const bg = banner.tone === 'ok' ? T.greenBg : banner.tone === 'warn' ? T.brandBg : T.warnBg;
              const fg = banner.tone === 'ok' ? T.green : banner.tone === 'warn' ? T.red : T.warn;
              return <div style={{ padding: '11px 18px', background: bg, color: fg, fontFamily: F_BODY, fontSize: 13, borderTop: `1px solid ${T.line}` }}>{banner.text}</div>;
            })()}
            {showImport && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className="border-2 border-dashed flex flex-col items-center justify-center text-center gap-2 px-4 py-6 m-4 rounded-md transition-colors"
                style={{ borderColor: dragOver ? T.brand : T.line, backgroundColor: dragOver ? T.brandBg : T.surface }}>
                {importing ? <Loader2 size={22} color={T.brand} className="pd-spin" /> : <Upload size={22} color={dragOver ? T.brand : T.soft} />}
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{importing ? 'Reading and matching the attendance file…' : 'Drag & drop the biometric .xls here'}</div>
                <div className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Fallback if the device pull is unavailable — .xls or .xlsx</div>
                <div className="flex gap-2">
                  <Btn variant="outline" onClick={() => fileRef.current?.click()} loading={importing} disabled={importing}>{importing ? 'Importing…' : 'Browse for a file'}</Btn>
                  {!importing && <Btn variant="ghost" onClick={() => setShowImport(false)}>Cancel</Btn>}
                </div>
              </div>
            )}
          </div>
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
            {loading ? <SkeletonBlock />
              : data.summaries.length === 0 ? <EmptyState icon={ClipboardList} title="No attendance yet" desc="Import a biometric .xls file to get started. Employees are matched by their biometric User ID." />
              : (
              <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
                <thead><tr><Th>ID</Th><Th>Employee</Th><Th center>Present</Th><Th center>Days Late</Th><Th center>Late (mins)</Th><Th center>OT (mins)</Th><Th center>Absences</Th><Th center>Leave</Th><Th>Action</Th></tr></thead>
                <tbody>
                  {data.summaries.map(s => (
                    <tr key={s.id}>
                      <Td mono>{s.id}</Td>
                      <Td>
                        <div className="font-semibold" style={{ fontFamily: F_BODY }}>{s.name}</div>
                      </Td>
                      <Td center mono>{s.present}</Td>
                      <Td center mono><span style={{ color: s.daysLate > 0 ? T.red : T.soft, fontWeight: s.daysLate > 0 ? 700 : 400 }}>{s.daysLate || '—'}</span></Td>
                      <Td center mono><span style={{ color: s.lateMins > 0 ? T.red : T.soft, fontWeight: s.lateMins > 0 ? 700 : 400 }}>{s.lateMins > 0 ? `${s.lateMins}m` : '—'}</span></Td>
                      <Td center mono><span style={{ color: s.otMins > 0 ? T.green : T.soft, fontWeight: s.otMins > 0 ? 700 : 400 }}>{s.otMins > 0 ? `${s.otMins}m` : '—'}</span></Td>
                      <Td center mono><span style={{ color: s.absent > 0 ? T.amber : T.soft, fontWeight: s.absent > 0 ? 700 : 400 }}>{s.absent || '—'}</span></Td>
                      <Td center mono>{s.leave || '—'}</Td>
                      <Td><Btn size="sm" variant="outline" onClick={() => { setSelectedId(s.id); setView('dtr'); }}>View</Btn></Td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Panel>
        </>
      )}

      {subTab === 'unmapped' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Unmapped Biometric IDs</div>
          </div>
          {unmappedLoading ? <SkeletonBlock avatar={false} />
            : unmapped.length === 0 ? <EmptyState icon={ClipboardList} title="Nothing unmapped" desc="Every imported scan is matched to an employee." />
            : (
            <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead><tr><Th>Biometric ID</Th><Th>Name (from file)</Th><Th center>Scans</Th><Th>Dates</Th><Th>Action</Th></tr></thead>
              <tbody>
                {unmapped.map((g) => (
                  <tr key={g.biometricId}>
                    <Td mono><span className="font-bold" style={{ color: T.ink }}>{g.biometricId}</span></Td>
                    <Td>
                      <span style={{ fontFamily: F_BODY, color: T.ink }}>{g.biometricName || '—'}</span>
                      {g.hasEmployee && <span className="ml-2"><Badge tone="green">registered</Badge></span>}
                    </Td>
                    <Td center mono>{g.punchCount}</Td>
                    <Td mono><span className="text-xs" style={{ color: T.soft }}>{g.firstDate} → {g.lastDate}</span></Td>
                    <Td>
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
          )}
        </Panel>
      )}

      {subTab === 'history' && (
        <Panel className="overflow-hidden">
          {loading ? <SkeletonBlock avatar={false} />
            : data.batches.length === 0 ? <EmptyState icon={ClipboardList} title="No imports yet" desc="Upload an attendance .xls file to get started." /> : (
            <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead><tr><Th>Imported</Th><Th>Filename</Th><Th>Period</Th><Th center>Mapped</Th><Th center>Unmapped</Th><Th>Status</Th><Th></Th></tr></thead>
              <tbody>{data.batches.map((b) => (
                <tr key={b.id}>
                  <Td mono>{new Date(b.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Td>
                  <Td mono>{b.filename}</Td>
                  <Td mono>{b.periodStart ? `${b.periodStart} → ${b.periodEnd}` : '—'}</Td>
                  <Td center mono>{b.mappedRows}</Td>
                  <Td center mono><span style={{ color: b.unmappedRows > 0 ? T.amber : T.soft }}>{b.unmappedRows}</span></Td>
                  <Td><Badge tone={b.status === 'COMPLETED' ? 'green' : b.status === 'FAILED' ? 'red' : 'amber'}>{b.status}</Badge></Td>
                  <Td>{b.periodStart ? <Btn size="sm" variant="outline" onClick={() => openBatch(b)}>View</Btn> : null}</Td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
      )}

      {/* Read-only look-back at a past import. Locked — corrections happen on the
          live DTR, never here, so historical figures stay exactly as recorded. */}
      <Modal open={!!viewBatch} onClose={() => setViewBatch(null)} title={viewBatch ? `Import — ${viewBatch.filename}` : ''} width={680}>
        {viewBatch && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
              <Badge tone="blue">{viewBatch.periodStart} → {viewBatch.periodEnd}</Badge>
              <span>Imported {new Date(viewBatch.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <Badge tone="amber">Locked — viewing only</Badge>
            </div>
            {batchLoading ? <SkeletonBlock avatar={false} />
              : batchRows.length === 0 ? <EmptyState icon={ClipboardList} title="No records" desc="No attendance rows fall in this import's date range." />
              : (
              <div className="overflow-x-auto pd-scroll-shadow" style={{ maxHeight: 380 }}>
                <table className="w-full">
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                    <tr><Th>ID</Th><Th>Employee</Th><Th center>Present</Th><Th center>Days Late</Th><Th center>Late (mins)</Th><Th center>OT (mins)</Th><Th center>Absences</Th><Th center>Leave</Th><Th></Th></tr>
                  </thead>
                  <tbody>
                    {batchRows.map((s) => (
                      <tr key={s.id}>
                        <Td mono>{s.id}</Td>
                        <Td><span className="font-semibold text-sm" style={{ fontFamily: F_BODY }}>{s.name}</span></Td>
                        <Td center mono>{s.present}</Td>
                        <Td center mono>{s.daysLate || '—'}</Td>
                        <Td center mono>{s.lateMins > 0 ? `${s.lateMins}m` : '—'}</Td>
                        <Td center mono>{s.otMins > 0 ? `${s.otMins}m` : '—'}</Td>
                        <Td center mono>{s.absent || '—'}</Td>
                        <Td center mono>{s.leave || '—'}</Td>
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

      {/* Locked DTR drill-down — read-only day-by-day for a past import. */}
      <Modal open={!!histDtr} onClose={() => setHistDtr(null)} title={histDtr ? `DTR — ${histDtr.name}` : ''} width={640}>
        {histDtr && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>
              <Badge tone="blue">{histDtr.period}</Badge>
              <Badge tone="amber">Locked — viewing only</Badge>
            </div>
            {histDtrLoading ? <SkeletonBlock avatar={false} />
              : histDtr.rows.length === 0 ? <EmptyState icon={ClipboardList} title="No records" desc="No daily records for this employee in this period." />
              : (
              <div className="overflow-x-auto pd-scroll-shadow" style={{ maxHeight: 400 }}>
                <table className="w-full">
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                    <tr><Th>Date</Th><Th>Day</Th><Th>Time In</Th><Th>Time Out</Th><Th center>Late</Th><Th center>OT</Th><Th>Status</Th></tr>
                  </thead>
                  <tbody>
                    {histDtr.rows.map((r, i) => (
                      <tr key={i}>
                        <Td mono>{r.date}</Td>
                        <Td>{r.weekday}</Td>
                        <Td mono>{r.absent || r.leave ? '—' : (r.in || '—')}</Td>
                        <Td mono>{r.absent || r.leave ? '—' : (r.out || '—')}</Td>
                        <Td center mono>{r.late > 0 ? `${r.late}m` : '—'}</Td>
                        <Td center mono>{r.ot > 0 ? `${r.ot}m` : '—'}</Td>
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
    </div>
  );
};
