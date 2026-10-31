'use client';
// Attendance screen: holds the shared state and switches between the Live, Employee DTR, Unmapped IDs and Import History tabs.

import React, { useState, useEffect, useRef } from 'react';
import { H1 } from '@/components/ui';
import { timeOrderError } from '@/lib/field-rules';
import { MAX_IMPORT_BYTES, tooBigMessage } from '@/lib/import-limits';
import { cutoffFor, fmtDay, manilaTodayStr, recentCutoffs } from '@/features/attendance/attendance-helpers';
import { UnregisteredBanner } from '@/features/attendance/UnregisteredBanner.jsx';
import { LiveTab } from '@/features/attendance/LiveTab.jsx';
import { CutoffsTab } from '@/features/attendance/CutoffsTab.jsx';
import { UnmappedTab } from '@/features/attendance/UnmappedTab.jsx';
import { HistoryTab } from '@/features/attendance/HistoryTab.jsx';
import { HistoryModals } from '@/features/attendance/HistoryModals.jsx';
import { EmployeeDtr } from '@/features/attendance/EmployeeDtr.jsx';

export const AttendanceView = ({ staff = [], toast, onRegister, navSub, onNavigate, focus = null, onFocusConsumed }) => {
  const [view, setView] = useState(focus ? 'dtr' : 'list');
  const [selectedId, setSelectedId] = useState(focus ? focus.employeeId : null);
  const [subTab, setSubTab] = useState(focus ? 'dtr' : (navSub || 'live'));
  const [data, setData] = useState({ period: null, summaries: [], unmappedCount: 0, batches: [] });
  const [loading, setLoading] = useState(true);
  const [liveDate, setLiveDate] = useState(null);
  const [liveData, setLiveData] = useState({ date: null, today: null, isToday: true, rows: [], stats: { present: 0, late: 0, notYetIn: 0 }, sync: { status: 'offline', lastSyncAt: null, lastScanAt: null } });
  const [liveLoading, setLiveLoading] = useState(true);
  const [pullReq, setPullReq] = useState(null);
  const [pullBusy, setPullBusy] = useState(false);
  const [pullSel, setPullSel] = useState(() => (focus ? cutoffFor(focus.date) : recentCutoffs(manilaTodayStr(), 2)[1]));
  useEffect(() => { if (focus && onFocusConsumed) onFocusConsumed(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pullDevice, setPullDevice] = useState({ status: 'offline' });
  const [, setAgoTick] = useState(0);
  const [dtr, setDtr] = useState({ period: null, rows: [] });
  const [dtrLoading, setDtrLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [unmapped, setUnmapped] = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [unmappedError, setUnmappedError] = useState('');
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
      const res = await fetch(`/api/attendance?from=${pullSel.from}&to=${pullSel.to}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setData(await res.json());
    } catch (err) { console.error('Could not load attendance:', err); }
    finally { if (!silent) setLoading(false); }
  };

  const loadLive = async ({ silent = false } = {}) => {
    if (!silent) setLiveLoading(true);
    try {
      const res = await fetch(`/api/attendance?live=1${liveDate ? `&date=${liveDate}` : ''}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setLiveData(await res.json());
    } catch (err) { console.error('Could not load live attendance:', err); }
    finally { if (!silent) setLiveLoading(false); }
  };

  const currentCutoff = recentCutoffs(manilaTodayStr(), 1)[0];
  const canGoNext = pullSel.from < currentCutoff.from;
  const pullActive = !!pullReq && (pullReq.status === 'PENDING' || pullReq.status === 'RUNNING');

  const fetchPull = async () => {
    try {
      const r = await fetch('/api/attendance/pull-request');
      if (r.ok) { const j = await r.json(); setPullReq(j.request); if (j.device) setPullDevice(j.device); }
    } catch { }
  };
  const queuePull = async () => {
    setPullBusy(true);
    try {
      const r = await fetch('/api/attendance/pull-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: pullSel.from, to: pullSel.to }),
      });
      const j = await r.json();
      if (r.ok) { setPullReq(j.request); }
      else { setPullReq(j.request || pullReq); toast(j.error || 'Could not queue the pull.', 'error'); }
    } catch { toast('Could not queue the pull.', 'error'); }
    finally { setPullBusy(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the sub-tab from the sidebar selection
  useEffect(() => { if (navSub) setSubTab(navSub); }, [navSub]);
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- intentional: load the active tab's data on mount and when the tab or selected day changes
  useEffect(() => { if (subTab === 'live') loadLive(); else if (subTab === 'dtr' || subTab === 'history') load(); }, [subTab, liveDate, pullSel]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch of pull status when the DTR tab opens
  useEffect(() => { if (subTab === 'dtr') fetchPull(); }, [subTab]);

  useEffect(() => {
    if (pullReq?.status !== 'PENDING' && pullReq?.status !== 'RUNNING') return undefined;
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/attendance/pull-request');
        if (!r.ok) return;
        const j = await r.json();
        setPullReq(j.request);
        if (j.device) setPullDevice(j.device);
        if (j.request && j.request.status === 'DONE') {
          const q = j.request;
          toast(`Pulled ${fmtDay(q.from)} – ${fmtDay(q.to)}: ${q.mappedRows} rows for ${q.matched} employee${q.matched === 1 ? '' : 's'}${q.unmappedUsers ? `, ${q.unmappedUsers} unregistered ID${q.unmappedUsers === 1 ? '' : 's'}` : ''}.`);
          load({ silent: true });
        } else if (j.request && j.request.status === 'FAILED') {
          toast(`Pull failed: ${j.request.error || 'the device did not answer.'}`, 'error');
        }
      } catch { }
    }, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads the selected cutoff; adding it would restart the poll on every render
  }, [pullReq?.status]);

  const loadUnmappedSilent = async () => {
    try {
      const res = await fetch('/api/attendance/unmapped');
      if (!res.ok) return;
      const d = await res.json();
      setUnmapped(d.groups || []);
      setEnrolled(d.enrolled || []);
    } catch { }
  };
  const goUnmapped = () => (onNavigate ? onNavigate('attendance', 'unmapped') : setSubTab('unmapped'));

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = () => (subTab === 'live' ? (liveDate === null ? Promise.all([loadLive({ silent: true }), loadUnmappedSilent()]) : undefined) : load({ silent: true })); });
  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = !!editDay; }, [editDay]);
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return; 
      if (editingRef.current) return;
      loadRef.current({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setAgoTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadDtr = async (id) => {
    setDtrLoading(true);
    try {
      const res = await fetch(`/api/attendance?employeeId=${encodeURIComponent(id)}&from=${pullSel.from}&to=${pullSel.to}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setDtr(await res.json());
    } catch (err) { console.error('Could not load DTR:', err); }
    finally { setDtrLoading(false); }
  };

  const loadUnmapped = async () => {
    setUnmappedLoading(true);
    try {
      const res = await fetch('/api/attendance/unmapped');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
      setUnmapped(d.groups || []);
      setEnrolled(d.enrolled || []);
      setUnmappedError(d.enrolledError || '');
    } catch (err) { console.error('Could not load unmapped IDs:', err); setUnmappedError(err.message || 'Could not load unmapped IDs.'); }
    finally { setUnmappedLoading(false); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
  useEffect(() => { if (subTab === 'unmapped' || subTab === 'live') loadUnmapped(); }, [subTab]);

  const resolveId = async (biometricId) => {
    setResolvingId(biometricId);
    try {
      const res = await fetch('/api/attendance/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ biometricId }),
      });
      const result = await res.json();
      if (!res.ok) { toast(result.error || 'Could not resolve.', 'error'); return; }
      toast(`Resolved ${result.present} day(s) present for ${result.employee}.`
        + (result.skippedDays ? ` ${result.skippedDays} day(s) in ${result.skippedCutoffs.join(', ')} were skipped because that payroll is finalized.` : ''));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload the employee's DTR when the view, employee or selected cutoff changes
  }, [view, selectedId, pullSel]);

  const openEdit = (a) => {
    if (data.finalized) return;
    setEditForm({ status: a.leave ? 'leave' : (a.absent ? 'absent' : 'present'), timeIn: a.assumedIn ? '' : (a.in || ''), timeOut: a.assumedOut ? '' : (a.out || ''), note: '' });
    setEditDay(a);
  };
  const saveEdit = async () => {
    if (!editDay) return;
    const orderErr = editForm.status === 'present' ? timeOrderError(editForm.timeIn, editForm.timeOut) : '';
    if (orderErr) { toast(orderErr, 'error'); return; }
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
    if (!/\.(dat|xls|xlsx)$/i.test(file.name)) { toast('Please choose the device\'s .dat file or a .xls or .xlsx export.', 'error'); return; }
    if (file.size > MAX_IMPORT_BYTES) { toast(tooBigMessage(), 'error'); return; }
    const isDat = /\.dat$/i.test(file.name);
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
        body: JSON.stringify({ filename: file.name, dataBase64, ...(isDat ? { cutoffStart: pullSel.from } : {}) }),
      });
      const result = await res.json();
      if (!res.ok) { toast(result.error || 'Import failed.', 'error'); return; }
      const upTo = result.cutoffEnd && result.period?.end && result.period.end < result.cutoffEnd ? ` · scans up to ${fmtDay(result.period.end)}` : '';
      const skipped = result.skippedLines ? ` · ${result.skippedLines} unreadable line(s) skipped` : '';
      toast(`Imported ${result.mappedRows} rows for ${result.matchedEmployees} employee(s)${upTo}${skipped}` + (result.unmappedUsers ? ` · ${result.unmappedUsers} unmapped ID(s).` : '.'));
      const importedStart = result.periodStart || result.period?.start;
      if (importedStart && importedStart !== pullSel.from) setPullSel(cutoffFor(importedStart)); else await load();
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

  if (view === 'dtr' && selectedId) {
    return (
      <EmployeeDtr
        staff={staff} selectedId={selectedId} setSelectedId={setSelectedId} setView={setView} data={data} dtr={dtr} dtrLoading={dtrLoading}
        openEdit={openEdit} editDay={editDay} setEditDay={setEditDay} editForm={editForm} setEditForm={setEditForm} savingEdit={savingEdit} saveEdit={saveEdit} />
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <input ref={fileRef} type="file" accept=".dat,.xls,.xlsx" onChange={onFile} style={{ display: 'none' }} />
      <H1>{({ dtr: 'Employee DTR', unmapped: 'Unmapped IDs', history: 'Import History' })[subTab] || 'Attendance'}</H1>

      {subTab !== 'live' && (
        <div className="mb-4">
        </div>
      )}
      {subTab === 'live' && <UnregisteredBanner count={liveData.unregistered || 0} onOpen={goUnmapped} />}
      {subTab === 'live' && <LiveTab liveData={liveData} setLiveDate={setLiveDate} liveLoading={liveLoading} />}

      {subTab === 'dtr' && (
        <CutoffsTab
          pullSel={pullSel} setPullSel={setPullSel} pullActive={pullActive} canGoNext={canGoNext} data={data} pullDevice={pullDevice}
          queuePull={queuePull} pullBusy={pullBusy} pullReq={pullReq} showImport={showImport} setShowImport={setShowImport}
          dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} importing={importing} fileRef={fileRef} goUnmapped={goUnmapped}
          loading={loading} staff={staff} onNavigate={onNavigate} setSelectedId={setSelectedId} setView={setView} />
      )}

      {subTab === 'unmapped' && (
        <UnmappedTab unmappedLoading={unmappedLoading} unmappedError={unmappedError} loadUnmapped={loadUnmapped} unmapped={unmapped}
          enrolled={enrolled} resolvingId={resolvingId} resolveId={resolveId} onRegister={onRegister} />
      )}

      {subTab === 'history' && <HistoryTab loading={loading} data={data} openBatch={openBatch} />}

      <HistoryModals viewBatch={viewBatch} setViewBatch={setViewBatch} batchLoading={batchLoading} batchRows={batchRows}
        openHistDtr={openHistDtr} histDtr={histDtr} setHistDtr={setHistDtr} histDtrLoading={histDtrLoading} />
    </div>
  );
};
