'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Save, Clock, AlertTriangle } from 'lucide-react';
import { Badge, Btn, Confirm, Eyebrow, Field, H1, Modal, Money, Panel, Td, Th, inputCls, inputStyle } from '@/components/ui.jsx';
import { POSITIONS, positionLabel } from '@/data/seed';
import { isDailyPosition, isNonRegularPosition } from '@/lib/positions';
import { WEEKDAYS, describeEarlyShift } from '@/lib/attendance';
import { F_BODY, F_HEAD, F_MONO, T } from '@/components/theme';
import { FinalPayView } from '@/features/payroll/FinalPayView.jsx';

const BLANK_EMP = {
  id: '', name: '', position: '', rate: '', declaredSalary: '',
  status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0, leaveCredits: 5,
  address: '', contact: '', birthdate: '', dateHired: '',
  earlyShiftDays: [], earlyShiftTime: '06:00',
};

export const EmployeesView = ({ staff, reloadStaff, toast, prefill, onPrefillConsumed, minimumDailyWage = null }) => {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [finalPayFor, setFinalPayFor] = useState(null);
  const [form, setForm] = useState(BLANK_EMP);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const rows = useMemo(() => staff
    .filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
    .filter(r => statusFilter === 'all'
      || (statusFilter === 'active' && r.status !== 'Inactive')
      || (statusFilter === 'inactive' && r.status === 'Inactive'))
    .filter(r => {
      if (typeFilter === 'all') return true;
      const crew = typeof r.daily === 'boolean' ? r.daily : isDailyPosition(r.position);
      return typeFilter === 'crew' ? crew : !crew;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })),
    [staff, q, statusFilter, typeFilter]);

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

  const openAdd = () => { setEditing(null); setForm({ ...BLANK_EMP }); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...BLANK_EMP, ...r, rate: String(r.rate), declaredSalary: String(r.declaredSalary || '') }); setModal(true); };

  useEffect(() => {
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    setEditing(null);
    setForm({ ...BLANK_EMP, id: prefill.id != null ? String(prefill.id) : '', name: prefill.name || '' });
    setModal(true);
    if (onPrefillConsumed) onPrefillConsumed();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!form.id.trim()) { toast('ID number is required — it links this employee to the biometric logs.', 'error'); return; }
    if (!form.name.trim()) { toast('Name is required.', 'error'); return; }
    const dupe = staff.some(s => String(s.id).toLowerCase() === form.id.trim().toLowerCase() && (!editing || s.id !== editing.id));
    if (dupe) { toast(`ID ${form.id.trim()} is already used by another employee.`, 'error'); return; }

    if (!form.position) { toast('Choose a position.', 'error'); return; }
    const crew = isDailyPosition(form.position);
    const nonRegular = isNonRegularPosition(form.position);

    const payload = {
      id: form.id.trim(), name: form.name.trim(), position: form.position,
      rate: parseFloat(form.rate) || 0, declaredSalary: nonRegular ? 0 : (parseFloat(form.declaredSalary) || 0),
      mp2: (crew || nonRegular) ? 0 : (parseFloat(form.mp2) || 0), status: form.status,
      leaveCredits: crew ? 0 : (parseInt(form.leaveCredits, 10) || 0),
      sssOn: form.sssOn, phOn: form.phOn, piOn: form.piOn,
      address: form.address, contact: form.contact,
      birthdate: form.birthdate, dateHired: form.dateHired,
      earlyShiftDays: form.earlyShiftDays, earlyShiftTime: form.earlyShiftTime,
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
        : (editing ? 'Employee updated.' : 'Employee registered.'));
      await reloadStaff();
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setBusy(false);
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
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
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

      <Panel className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto overflow-y-auto pd-scroll-shadow" style={{ maxHeight: 520 }}>
          <table className="w-full">
            <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
              <tr><Th>ID</Th><Th>Employee</Th><Th>Position</Th><Th right>Daily Rate</Th><Th>Status</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <Td mono>{r.id}</Td>
                  <Td>
                    <div className="font-semibold" style={{ fontFamily: F_BODY }}>{r.name}</div>
                  </Td>
                  <Td>
                    {positionLabel(r.position)}
                    {describeEarlyShift(r) && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                        style={{ fontFamily: F_BODY, backgroundColor: T.warnBg, color: T.warn }}>
                        <Clock size={10} />{describeEarlyShift(r)}
                      </span>
                    )}
                  </Td>
                  <Td right mono><Money value={r.rate} /></Td>
                  <Td><Badge tone={r.status === 'Active' ? 'green' : 'neutral'}>{r.status}</Badge></Td>
                  <Td>
                    <div className="flex gap-2 flex-wrap">
                      {renderActions(r)}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="md:hidden space-y-2.5">
        {rows.map(r => (
            <Panel key={r.id} className="p-3.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate" style={{ fontFamily: F_BODY }}>{r.name}</div>
                  <div className="text-xs truncate" style={{ color: T.soft }}><span style={{ fontFamily: F_MONO }}>ID {r.id}</span> · {positionLabel(r.position)}</div>
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
        {rows.length === 0 && (
          <Panel className="p-6"><div className="text-sm text-center" style={{ color: T.soft }}>No employees to show.</div></Panel>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Employee' : 'Register Employee'} width={480}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ID number*">
              <input value={form.id} onChange={e => ff('id', e.target.value)} placeholder="e.g. 7 (biometric ID)" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
            </Field>
            <Field label="Date hired">
              <input type="date" value={form.dateHired} onChange={e => ff('dateHired', e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label="Full name*"><input value={form.name} onChange={e => ff('name', e.target.value)} placeholder="Juan Dela Cruz" className={inputCls} style={inputStyle} /></Field>
          <Field label="Position">
            <select value={form.position} onChange={e => ff('position', e.target.value)} className={inputCls} style={inputStyle}>
              {!form.position && <option value="">Choose a position</option>}
              {POSITIONS.map(p => <option key={p} value={p}>{positionLabel(p)}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Daily rate (₱)"><input type="number" value={form.rate} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, rate: v, declaredSalary: (v === '' || isNonRegularPosition(f.position)) ? '' : String((parseFloat(v) || 0) * 26) })); }} className={inputCls} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={e => ff('status', e.target.value)} className={inputCls} style={inputStyle}>
                <option>Active</option><option>Inactive</option>
              </select>
            </Field>
          </div>
          {minimumDailyWage != null && form.rate !== '' && (parseFloat(form.rate) || 0) < minimumDailyWage && (
            <div role="status" className="flex items-start gap-2 px-3 py-2.5 rounded text-xs"
              style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
              <AlertTriangle size={13} color={T.warn} className="mt-0.5 shrink-0" />
              <span>
                {isDailyPosition(form.position) && !['Checker', 'Warehouse Officer'].includes(form.position)
                  ? `This daily rate is below the minimum wage (₱${minimumDailyWage}). Per-piece pay must still reach the minimum for a full working day.`
                  : `This daily rate is below the minimum wage (₱${minimumDailyWage}).`}
              </span>
            </div>
          )}
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
          {(!isDailyPosition(form.position) || !isNonRegularPosition(form.position)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              {!isNonRegularPosition(form.position) && (
                <Field label="Declared monthly salary (₱)">
                  <input type="number" value={form.declaredSalary} onChange={e => ff('declaredSalary', e.target.value)} placeholder="e.g. daily rate × 26" className={inputCls} style={inputStyle} />
                </Field>
              )}
              {!isDailyPosition(form.position) && (
                <Field label="Leave credits (days/year)">
                  <input type="number" min="0" value={form.leaveCredits} onChange={e => ff('leaveCredits', e.target.value)} className={inputCls} style={inputStyle} />
                </Field>
              )}
            </div>
          )}

          {!isNonRegularPosition(form.position) && (
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Early Shift</Eyebrow>
            <div className="flex flex-wrap gap-1.5 mb-2.5 mt-2.5">
              {WEEKDAYS.map(w => {
                const on = form.earlyShiftDays.includes(w.key);
                return (
                  <button key={w.key} onClick={() => toggleShiftDay(w.key)}
                    className="px-2.5 py-1.5 rounded text-xs font-semibold"
                    style={{
                      fontFamily: F_HEAD,
                      backgroundColor: on ? T.brand : T.surface,
                      color: on ? '#fff' : T.soft,
                      border: `1px solid ${on ? T.brand : T.line}`,
                    }}>{w.label}</button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => ff('earlyShiftDays', form.earlyShiftDays.length === 7 ? [] : WEEKDAYS.map(w => w.key))}
                className="text-xs font-semibold underline" style={{ fontFamily: F_HEAD, color: T.brand }}>
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
            {form.earlyShiftDays.length > 0 && (
              <div className="text-xs mt-2.5 flex items-start gap-1.5" style={{ fontFamily: F_BODY, color: T.warn }}>
                <Clock size={12} className="mt-0.5 shrink-0" />
                <span>On those days, arriving after {form.earlyShiftTime || '06:00'} counts as late.</span>
              </div>
            )}
          </div>
          )}

          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Personal Information</Eyebrow>
            <div className="space-y-2.5 mt-2.5">
              <Field label="Address">
                <input value={form.address} onChange={e => ff('address', e.target.value)} placeholder="Brgy. Poblacion, Mabini, Batangas" className={inputCls} style={inputStyle} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Contact number">
                  <input value={form.contact} onChange={e => ff('contact', e.target.value)} placeholder="09XX XXX XXXX" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
                </Field>
                <Field label="Birthdate">
                  <input type="date" value={form.birthdate} onChange={e => ff('birthdate', e.target.value)} className={inputCls} style={inputStyle} />
                </Field>
              </div>
            </div>
          </div>
          {isNonRegularPosition(form.position) ? (
            <div className="px-3 py-2.5 rounded text-xs" style={{ border: `1px dashed ${T.line}`, fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Early Shift, declared salary and Government Contributions do not apply to Job Order.
            </div>
          ) : (
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Government Contributions</Eyebrow>
            {[['sssOn', 'SSS'], ['phOn', 'PhilHealth'], ['piOn', 'Pag-IBIG (HDMF)']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
                <input type="checkbox" checked={form[k]} onChange={e => ff(k, e.target.checked)} /> {l}
              </label>
            ))}
            {isDailyPosition(form.position) ? (
              <div className="text-xs mt-1.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
                Deducted per day worked until this month&apos;s share is complete. The amount per day is in Settings.
              </div>
            ) : (
              <Field label="Pag-IBIG MP2 (₱/cutoff)"><input type="number" value={form.mp2} onChange={e => ff('mp2', e.target.value)} className={inputCls} style={inputStyle} /></Field>
            )}
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
    </div>
  );
};