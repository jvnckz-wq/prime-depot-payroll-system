'use client';
// Employees screen: list, add, edit and deactivate office staff and crew.

import React, { useState, useMemo, useEffect } from 'react';
import { Search, SearchX, Save, Clock, AlertTriangle, Users } from 'lucide-react';
import { Badge, Btn, Chip, Confirm, EmptyState, Eyebrow, Field, H1, Modal, Money, Panel, SkeletonBlock, SkeletonRows, Td, Th, inputCls, inputStyle } from '@/components/ui';
import { POSITIONS } from '@/lib/constants';
import { hasNoContributions, hasNoEarlyShift, isDailyPosition, isNonRegularPosition } from '@/lib/positions';
import { WEEKDAYS, describeEarlyShift } from '@/lib/attendance';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { FinalPayView } from '@/features/payroll/FinalPayView.jsx';
import { cutoffLabel } from '@/lib/utils';
import { addressError, birthdateError, digitsOnly, employeeErrors, firstError, LIMITS, moneyInput, flagErrors } from '@/lib/field-rules';
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayBefore = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const fmtShort = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const BLANK_EMP = {
  id: '', name: '', position: '', rate: '', declaredSalary: '',
  status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0, leaveCredits: 5,
  address: '', contact: '', birthdate: '',
  earlyShiftDays: [], earlyShiftTime: '06:00',
};

export const EmployeesView = ({ staff, reloadStaff, toast, prefill, onPrefillConsumed, loading = false }) => {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [finalPayFor, setFinalPayFor] = useState(null);
  const [form, setForm] = useState(BLANK_EMP);
  const [confirm, setConfirm] = useState(null);
  const [scanPrompt, setScanPrompt] = useState(null);
  const [addingScans, setAddingScans] = useState(false);
  const [busy, setBusy] = useState(false);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showErrors, setShowErrors] = useState(false);
  const shiftChanged = !!editing && !!form && !hasNoEarlyShift(form.position)
    && ([...(editing.earlyShiftDays || [])].sort().join(',') !== [...(form.earlyShiftDays || [])].sort().join(',')
      || (editing.earlyShiftTime || '06:00') !== (form.earlyShiftTime || '06:00'));
  const scheduleHistory = editing && Array.isArray(editing.shiftSchedules) ? editing.shiftSchedules.map((sch, i, all) => {
    const label = sch.days && sch.days.length ? (sch.days.length === 7 ? `every day ${sch.time}` : `${WEEKDAYS.filter(w => sch.days.includes(w.key)).map(w => w.label).join(', ')} ${sch.time}`) : 'none';
    const next = all[i + 1];
    if (i === 0 && next) return `${label}, until ${fmtShort(dayBefore(next.from))}`;
    if (next) return `${label}, ${fmtShort(sch.from)} to ${fmtShort(dayBefore(next.from))}`;
    return i === 0 ? label : `${label}, from ${fmtShort(sch.from)}`;
  }) : [];
  const idLocked = !!editing && editing.idLocked !== false;
  const errs = showErrors && form ? employeeErrors(form, { crew: isDailyPosition(form.position), noContrib: hasNoContributions(form.position), skipId: !!editing && editing.idLocked !== false }) : {};

  const query = q.trim().toLowerCase();
  const rows = useMemo(() => staff
    .filter(r => !query || r.name.toLowerCase().includes(query) || String(r.id).toLowerCase().includes(query))
    .filter(r => statusFilter === 'all'
      || (statusFilter === 'active' && r.status !== 'Inactive')
      || (statusFilter === 'inactive' && r.status === 'Inactive'))
    .filter(r => {
      if (typeFilter === 'all') return true;
      const crew = typeof r.daily === 'boolean' ? r.daily : isDailyPosition(r.position);
      return typeFilter === 'crew' ? crew : !crew;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })),
    [staff, query, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    const crewOf = (r) => (typeof r.daily === 'boolean' ? r.daily : isDailyPosition(r.position));
    return {
      all: staff.length,
      active: staff.filter(r => r.status !== 'Inactive').length,
      inactive: staff.filter(r => r.status === 'Inactive').length,
      staff: staff.filter(r => !crewOf(r)).length,
      crew: staff.filter(r => crewOf(r)).length,
    };
  }, [staff]);

  const toggleShiftDay = (key) => setForm(f => ({
    ...f,
    earlyShiftDays: f.earlyShiftDays.includes(key)
      ? f.earlyShiftDays.filter(d => d !== key)
      : [...f.earlyShiftDays, key],
  }));

  const openAdd = () => { setEditing(null); setForm({ ...BLANK_EMP }); setShowErrors(false); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...BLANK_EMP, ...r, rate: String(r.rate), declaredSalary: String(r.declaredSalary || '') }); setShowErrors(false); setModal(true); };

  useEffect(() => {
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    setEditing(null);
    setForm({ ...BLANK_EMP, id: prefill.id != null ? String(prefill.id) : '', name: prefill.name || '' });
    setModal(true);
    if (onPrefillConsumed) onPrefillConsumed();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const problems = employeeErrors(form, { crew: isDailyPosition(form.position), noContrib: hasNoContributions(form.position), skipId: !!editing && editing.idLocked !== false });
    if (firstError(problems)) { setShowErrors(true); flagErrors(); return; }
    const dupe = staff.some(s => String(s.id).toLowerCase() === form.id.trim().toLowerCase() && (!editing || s.id !== editing.id));
    if (dupe) { toast(`ID ${form.id.trim()} is already used by another employee.`, 'error'); return; }

    if (!form.position) { toast('Choose a position.', 'error'); return; }
    const crew = isDailyPosition(form.position);
    const noContrib = hasNoContributions(form.position);

    const payload = {
      id: form.id.trim(), name: form.name.trim(), position: form.position,
      ...(editing && !idLocked && form.id.trim() !== editing.id ? { newId: form.id.trim() } : {}),
      rate: parseFloat(form.rate) || 0, declaredSalary: noContrib ? 0 : (parseFloat(form.declaredSalary) || 0),
      mp2: noContrib ? 0 : (parseFloat(form.mp2) || 0), status: form.status,
      leaveCredits: crew ? 0 : (parseInt(form.leaveCredits, 10) || 0),
      sssOn: !noContrib && form.sssOn, phOn: !noContrib && form.phOn, piOn: !noContrib && form.piOn,
      address: form.address, contact: form.contact,
      birthdate: form.birthdate,
      earlyShiftDays: form.earlyShiftDays, earlyShiftTime: form.earlyShiftTime,
      ...(shiftChanged ? { earlyShiftFrom: form.earlyShiftFrom || todayLocal() } : {}),
    };

    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/employees/${encodeURIComponent(editing.id)}` : '/api/employees', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the employee.', 'error'); return; }
      setModal(false);
      toast(data.accountDisabled
        ? `Employee updated. The checker account "${data.accountDisabled}" was disabled.`
        : (editing ? 'Employee updated.' : data.pullQueued ? 'Employee registered. Getting this cutoff’s earlier scans from the device.' : 'Employee registered.'));
      if (!editing && data.pendingScans) setScanPrompt({ id: payload.id, name: payload.name, ...data.pendingScans });
      await reloadStaff();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const addSavedScans = async () => {
    if (!scanPrompt) return;
    setAddingScans(true);
    try {
      const res = await fetch('/api/attendance/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ biometricId: scanPrompt.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not add the scans.', 'error'); return; }
      toast(`Added ${data.present} day(s) with scans to ${scanPrompt.name}'s attendance.`
        + (data.skippedDays ? ` ${data.skippedDays} day(s) in a finalized cutoff were skipped.` : ''));
      setScanPrompt(null);
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setAddingScans(false);
    }
  };
  const toggleStatus = async (r) => {
    setConfirm(null);
    try {
      const res = await fetch(`/api/employees/${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: r.status === 'Active' ? 'Inactive' : 'Active' }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update the employee.', 'error'); return; }
      toast(data.accountDisabled
        ? `${r.name} marked inactive. The checker account "${data.accountDisabled}" was disabled too.`
        : `${r.name} marked ${r.status === 'Active' ? 'inactive' : 'active'}.`);
      await reloadStaff();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  const finalizeDeactivate = async (r) => {
    await toggleStatus(r);
    setFinalPayFor(null);
  };

  const renderActions = (r) => {
    const isCrew = typeof r.daily === 'boolean' ? r.daily : isDailyPosition(r.position);
    if (r.status === 'Active') {
      return (
        <>
          <Btn size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Btn>
          {isCrew ? (
            <Btn size="sm" variant="outline" onClick={() => setConfirm(r)}>Deactivate</Btn>
          ) : (
            <Btn size="sm" variant="outline" onClick={() => setFinalPayFor({ emp: r, deactivate: true })}>Deactivate</Btn>
          )}
        </>
      );
    }
    return (
      <>
        {!isCrew && (
          <Btn size="sm" variant="outline" onClick={() => setFinalPayFor({ emp: r, deactivate: false })}>Final Pay</Btn>
        )}
        <Btn size="sm" variant="outline" onClick={() => setConfirm(r)}>Activate</Btn>
      </>
    );
  };

  const resetFilters = () => { setQ(''); setStatusFilter('active'); setTypeFilter('all'); };
  const filterLabel = statusFilter === 'inactive' ? 'resigned' : statusFilter === 'active' ? 'active' : '';
  const typeLabel = typeFilter === 'crew' ? 'crew' : typeFilter === 'staff' ? 'staff' : '';
  const emptyView = counts.all === 0 ? (
    <EmptyState icon={Users} title="No employees yet"
      desc="Register your staff and crew with their biometric ID so their scans match them."
      action={<Btn onClick={openAdd}>Register Employee</Btn>} />
  ) : query ? (
    <EmptyState icon={SearchX} title={`No employees match "${q.trim()}"`}
      desc="Check the spelling, or search by ID."
      action={<Btn variant="outline" onClick={() => setQ('')}>Clear Search</Btn>} />
  ) : (
    <EmptyState icon={Users} title={`No ${[filterLabel, typeLabel].filter(Boolean).join(' ')} employees`}
      desc={statusFilter === 'inactive' ? 'Employees you deactivate are listed here with their Final Pay.' : 'Change the filters to see other employees.'}
      action={<Btn variant="outline" onClick={resetFilters}>Show All Active</Btn>} />
  );

  if (finalPayFor) return (
    <FinalPayView employee={finalPayFor.emp} onBack={() => setFinalPayFor(null)} toast={toast}
      editable={finalPayFor.deactivate}
      onDeactivate={finalPayFor.deactivate ? () => finalizeDeactivate(finalPayFor.emp) : undefined} />
  );

  return (
    <div className="p-4 sm:p-6">
      <H1 sub="Core registration fields only. Address, birthday, and contact details are masked from printed payroll sheets."
        action={<Btn onClick={openAdd}>Register Employee</Btn>}>Employees</H1>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search size={14} className="absolute left-3 top-2.5" color={T.soft} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or ID…"
            className={`${inputCls} pl-8 w-full`} style={inputStyle} />
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ fontFamily: F_HEAD, fontSize: 13, fontWeight: 600, color: T.ink, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: '8px 10px' }}>
            <option value="active">Active ({counts.active})</option>
            <option value="inactive">Resigned ({counts.inactive})</option>
            <option value="all">All status ({counts.all})</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ fontFamily: F_HEAD, fontSize: 13, fontWeight: 600, color: T.ink, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: '8px 10px' }}>
            <option value="all">All types ({counts.all})</option>
            <option value="staff">Staff ({counts.staff})</option>
            <option value="crew">Crew ({counts.crew})</option>
          </select>
        </div>
      </div>

      {!loading && rows.length === 0 && <Panel>{emptyView}</Panel>}

      {(loading || rows.length > 0) && (
      <Panel className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto overflow-y-auto pd-scroll-shadow" style={{ maxHeight: 520 }}>
          <table className="w-full">
            <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
              <tr><Th>ID</Th><Th>Employee</Th><Th>Position</Th><Th right>Daily Rate</Th><Th center style={{ paddingLeft: 40 }}>Status</Th><Th center style={{ width: '1%', whiteSpace: 'nowrap' }}>Actions</Th></tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows cols={6} rows={5} /> : rows.map(r => (
                <tr key={r.id}>
                  <Td mono>{r.id}</Td>
                  <Td>
                    <div className="font-semibold" style={{ fontFamily: F_BODY }}>{r.name}</div>
                  </Td>
                  <Td>
                    {r.position}
                    {describeEarlyShift(r) && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                        style={{ fontFamily: F_BODY, backgroundColor: T.warnBg, color: T.warn }}>
                        <Clock size={10} />{describeEarlyShift(r)}
                      </span>
                    )}
                  </Td>
                  <Td right mono><Money value={r.rate} /></Td>
                  <Td center style={{ paddingLeft: 40 }}><Badge tone={r.status === 'Active' ? 'green' : 'neutral'}>{r.status}</Badge></Td>
                  <Td right style={{ width: '1%', whiteSpace: 'nowrap' }}>
                    <div className="flex gap-2 flex-nowrap justify-end">
                      {renderActions(r)}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      )}

      <div className="md:hidden space-y-2.5">
        {loading && <Panel><SkeletonBlock /></Panel>}
        {!loading && rows.map(r => (
            <Panel key={r.id} className="p-3.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" style={{ fontFamily: F_BODY }}>{r.name}</div>
                  <div className="text-xs truncate" style={{ color: T.soft }}><span style={{ fontFamily: F_MONO }}>ID {r.id}</span> · {r.position}</div>
                </div>
                <Badge tone={r.status === 'Active' ? 'green' : 'neutral'}>{r.status}</Badge>
              </div>
              {describeEarlyShift(r) && (
                <div className="mt-2.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                    style={{ fontFamily: F_BODY, backgroundColor: T.warnBg, color: T.warn }}>
                    <Clock size={10} />{describeEarlyShift(r)}
                  </span>
                </div>
              )}
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                <div className="text-xs" style={{ color: T.soft, letterSpacing: '0.05em' }}>DAILY RATE</div>
                <div className="font-semibold" style={{ fontFamily: F_MONO }}><Money value={r.rate} /></div>
              </div>
              <div className="flex gap-2 flex-wrap mt-3">
                {renderActions(r)}
              </div>
            </Panel>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Employee' : 'Register Employee'} width={480}>
        <div className="space-y-3">
          <Field label="ID number*" error={errs.id}>
              <input data-field="id" value={form.id} onChange={e => ff('id', digitsOnly(e.target.value, 9))} readOnly={idLocked} inputMode="numeric" placeholder="e.g. 7 (biometric ID)" className={inputCls}
                style={{ ...inputStyle, fontFamily: F_MONO, ...(idLocked ? { backgroundColor: T.bg, color: T.soft } : {}) }} />
            </Field>
          <Field label="Full name*" error={errs.name}><input value={form.name} maxLength={80} onChange={e => ff('name', e.target.value)} placeholder="Juan Dela Cruz" className={inputCls} style={inputStyle} /></Field>
          <Field label="Position" error={errs.position}>
            <select value={form.position} onChange={e => ff('position', e.target.value)} className={inputCls} style={inputStyle}>
              {!form.position && <option value="">Choose a position</option>}
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Daily rate (₱)" error={errs.rate}><input inputMode="decimal" value={form.rate} onChange={e => { const v = moneyInput(e.target.value); setForm(f => ({ ...f, rate: v, declaredSalary: (v === '' || hasNoContributions(f.position)) ? '' : String((parseFloat(v) || 0) * 26) })); }} className={inputCls} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={e => ff('status', e.target.value)} className={inputCls} style={inputStyle}>
                <option>Active</option><option>Inactive</option>
              </select>
            </Field>
          </div>
          {editing?.account?.active && (form.position !== 'Checker' || form.status === 'Inactive') && (
            <div role="status" className="flex items-start gap-2 px-3 py-2.5 rounded text-xs"
              style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
              <AlertTriangle size={13} color={T.warn} className="mt-0.5 shrink-0" />
              <span>
                This employee has the checker account <span style={{ fontFamily: F_MONO, fontWeight: 600 }}>{editing.account.username}</span>.
                Saving will disable it, so they can no longer log deliveries. Past delivery records stay.
              </span>
            </div>
          )}
          {(!hasNoContributions(form.position) || !isDailyPosition(form.position)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              {!hasNoContributions(form.position) && (
                <Field label="Declared salary (₱)" error={errs.declaredSalary}>
                  <input inputMode="decimal" value={form.declaredSalary} onChange={e => ff('declaredSalary', moneyInput(e.target.value))} placeholder="e.g. daily rate × 26" className={inputCls} style={inputStyle} />
                </Field>
              )}
              {!isDailyPosition(form.position) && (
                <Field label="Leave credits (days/year)" error={errs.leaveCredits}>
                  <input inputMode="numeric" value={form.leaveCredits} onChange={e => ff('leaveCredits', digitsOnly(e.target.value, 2))} className={inputCls} style={inputStyle} />
                </Field>
              )}
            </div>
          )}

          {!hasNoEarlyShift(form.position) && (
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Early Shift</Eyebrow>
            <div className="flex flex-wrap gap-1.5 mb-2.5 mt-2.5">
              {WEEKDAYS.map(w => {
                const on = form.earlyShiftDays.includes(w.key);
                return <Chip key={w.key} on={on} onClick={() => toggleShiftDay(w.key)}>{w.label}</Chip>;
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => ff('earlyShiftDays', form.earlyShiftDays.length === 7 ? [] : WEEKDAYS.map(w => w.key))}
                className="pd-link text-xs" style={{ fontFamily: F_BODY }}>
                {form.earlyShiftDays.length === 7 ? 'Clear all' : 'Every day'}
              </button>
              {form.earlyShiftDays.length > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs" style={{ fontFamily: F_BODY, color: T.soft }}>Report at</span>
                  <input type="time" value={form.earlyShiftTime || '06:00'}
                    onChange={e => ff('earlyShiftTime', e.target.value)}
                    className="px-2 py-1 rounded border text-xs"
                    style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink }} />
                </div>
              )}
            </div>
            {shiftChanged && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.ink }}>Starts on</span>
                <input type="date" value={form.earlyShiftFrom || todayLocal()} onChange={e => ff('earlyShiftFrom', e.target.value)}
                  className="px-2 py-1 rounded border text-xs" style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink }} />
              </div>
            )}
            {scheduleHistory.length > 1 && (
              <div className="text-xs mt-2" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
                {scheduleHistory.join(' · ')}
              </div>
            )}
          </div>
          )}

          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Personal Information</Eyebrow>
            <div className="space-y-2.5 mt-2.5">
              <Field label="Address" error={errs.address || (form.address && addressError(form.address))}>
                <input value={form.address} maxLength={200} onChange={e => ff('address', e.target.value)} placeholder="Brgy. Poblacion, Mabini, Batangas" className={inputCls} style={inputStyle} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Contact number" error={errs.contact}>
                  <input value={form.contact} inputMode="numeric" onChange={e => ff('contact', digitsOnly(e.target.value, 11))} placeholder="09XXXXXXXXX" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
                </Field>
                <Field label="Birthdate" error={errs.birthdate || (form.birthdate && birthdateError(form.birthdate))}>
                  <input type="date" value={form.birthdate} onChange={e => ff('birthdate', e.target.value)} className={inputCls} style={inputStyle} />
                </Field>
              </div>
            </div>
          </div>
          {isNonRegularPosition(form.position) ? (
            <div className="px-3 py-2.5 rounded text-xs" style={{ border: `1px dashed ${T.line}`, fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Early Shift, declared salary and Government Contributions do not apply to Job Order.
            </div>
          ) : isDailyPosition(form.position) ? (
            <div className="px-3 py-2.5 rounded text-xs" style={{ border: `1px dashed ${T.line}`, fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Declared salary and Government Contributions do not apply to daily-paid crew.
            </div>
          ) : (
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Government Contributions</Eyebrow>
            {[['sssOn', 'SSS'], ['phOn', 'PhilHealth'], ['piOn', 'Pag-IBIG (HDMF)']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
                <input type="checkbox" checked={form[k]} onChange={e => ff(k, e.target.checked)} /> {l}
              </label>
            ))}
            <Field label={`Pag-IBIG MP2 (₱/cutoff, 0 or ₱${LIMITS.mp2Min}+)`} error={errs.mp2}><input inputMode="decimal" value={form.mp2} onChange={e => ff('mp2', moneyInput(e.target.value))} className={inputCls} style={inputStyle} /></Field>
          </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)} disabled={busy}>Cancel</Btn>
            <Btn onClick={save} loading={busy} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Register'}</Btn>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} onCancel={() => setConfirm(null)} onConfirm={() => toggleStatus(confirm)}
        title={confirm?.status === 'Active' ? 'Deactivate employee?' : 'Reactivate employee?'}
        message={`${confirm?.name} will be marked ${confirm?.status === 'Active' ? 'inactive and excluded from payroll' : 'active'}.`}
        confirmLabel={confirm?.status === 'Active' ? 'Deactivate' : 'Reactivate'} danger={confirm?.status === 'Active'} />

      <Confirm open={!!scanPrompt} onCancel={() => setScanPrompt(null)} onConfirm={addSavedScans} busy={addingScans}
        title={`${scanPrompt?.name} has saved scans`}
        message={`ID ${scanPrompt?.id} has scans from ${(scanPrompt?.cutoffs || []).map(c => cutoffLabel(c)).join(' and ')} that are not in attendance yet. Add them now?`}
        confirmLabel="Add scans" cancelLabel="Not now" />
    </div>
  );
};