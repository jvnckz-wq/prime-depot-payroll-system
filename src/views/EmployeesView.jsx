'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, Edit2, Save, UserPlus, Truck, Clock, Receipt } from 'lucide-react';
import { Av, Badge, Btn, Confirm, Eyebrow, Field, H1, Modal, Money, Panel, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { POSITIONS } from '../data/seed';
import { isCrewPosition } from '../lib/payroll';
import { WEEKDAYS, describeEarlyShift } from '../lib/attendance';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';
import { FinalPayView } from './FinalPayView.jsx';

// Registration fields required by the client spec: ID number, name, position,
// daily rate, plus personal information (address, contact number, birthdate).
// Date hired is carried too — the 13th-month computation prorates by months
// worked, which is impossible without it. Personal info is captured here but
// deliberately never printed on a payslip.
const BLANK_EMP = {
  id: '', name: '', position: 'Administrative Staff', rate: '', declaredSalary: '',
  status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0,
  address: '', contact: '', birthdate: '', dateHired: '',
  earlyShiftDays: [], earlyShiftTime: '06:00',
};

export const EmployeesView = ({ staff, reloadStaff, toast, prefill, onPrefillConsumed }) => {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all'); // all | staff | crew — a separate axis from status
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [finalPayFor, setFinalPayFor] = useState(null);
  const [form, setForm] = useState(BLANK_EMP);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Every row comes from the database now — office staff and crew alike. The old
  // hardcoded crew rows are gone: crew are real employee records, registered and
  // edited right here. Their pay is still computed in Truck Payroll (pakyawan).
  const rows = useMemo(() => staff
    .filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
    .filter(r => statusFilter === 'all'
      || (statusFilter === 'active' && r.status !== 'Inactive')
      || (statusFilter === 'inactive' && r.status === 'Inactive'))
    .filter(r => {
      if (typeFilter === 'all') return true;
      const crew = typeof r.crew === 'boolean' ? r.crew : isCrewPosition(r.position);
      return typeFilter === 'crew' ? crew : !crew;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })),
    [staff, q, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    const crewOf = (r) => (typeof r.crew === 'boolean' ? r.crew : isCrewPosition(r.position));
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

  // The ID is the biometric scanner's User ID (a plain number like 7), entered
  // by hand — it is what links attendance logs to this record. Not generated,
  // so the Add form starts blank rather than pre-filling a made-up code.
  const openAdd = () => { setEditing(null); setForm({ ...BLANK_EMP }); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...BLANK_EMP, ...r, rate: String(r.rate), declaredSalary: String(r.declaredSalary || '') }); setModal(true); };

  // Arriving from "Register" on an unmapped biometric ID: open the Add form with
  // that ID (and the name read from the file) already filled in, then clear the
  // hand-off so re-opening Employees later doesn't pop the form again.
  useEffect(() => {
    if (!prefill) return;
    setEditing(null);
    setForm({ ...BLANK_EMP, id: prefill.id != null ? String(prefill.id) : '', name: prefill.name || '' });
    setModal(true);
    if (onPrefillConsumed) onPrefillConsumed();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    // Instant, friendly checks. The server validates authoritatively too — this
    // just saves a round-trip on the obvious mistakes.
    if (!form.id.trim()) { toast('ID number is required — it links this employee to the biometric logs.', 'error'); return; }
    if (!form.name.trim()) { toast('Name is required.', 'error'); return; }
    const dupe = staff.some(s => String(s.id).toLowerCase() === form.id.trim().toLowerCase() && (!editing || s.id !== editing.id));
    if (dupe) { toast(`ID ${form.id.trim()} is already used by another employee.`, 'error'); return; }

    // Hand the server named fields only — never the whole form object.
    const payload = {
      id: form.id.trim(), name: form.name.trim(), position: form.position,
      rate: parseFloat(form.rate) || 0, declaredSalary: parseFloat(form.declaredSalary) || 0,
      mp2: parseFloat(form.mp2) || 0, status: form.status,
      sssOn: form.sssOn, phOn: form.phOn, piOn: form.piOn,
      address: form.address, contact: form.contact,
      birthdate: form.birthdate, dateHired: form.dateHired,
      earlyShiftDays: form.earlyShiftDays, earlyShiftTime: form.earlyShiftTime,
    };

    setBusy(true);
    try {
      // Edit targets the existing ID in the URL; the ID is fixed once set, so it
      // is never renamed through the body.
      const res = await fetch(editing ? `/api/employees/${encodeURIComponent(editing.id)}` : '/api/employees', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the employee.', 'error'); return; }
      setModal(false);
      toast(editing ? 'Employee updated.' : 'Employee registered.');
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
      toast(`${r.name} marked ${r.status === 'Active' ? 'inactive' : 'active'}.`);
      await reloadStaff();
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  if (finalPayFor) return <FinalPayView employee={finalPayFor} onBack={() => setFinalPayFor(null)} toast={toast} />;

  return (
    <div className="p-6">
      <H1 sub="Core registration fields only. Address, birthday, and contact details are masked from printed payroll sheets."
        action={<Btn icon={UserPlus} onClick={openAdd}>Register Employee</Btn>}>Employees</H1>
      <div className="relative w-64 mb-3">
        <Search size={14} className="absolute left-3 top-2.5" color={T.soft} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
          className={`${inputCls} pl-8`} style={inputStyle} />
      </div>

      {/* Active by default: the everyday question is "who is on payroll now",
          not "who has ever worked here". Resigned staff stay one click away
          rather than cluttering the list they are no longer part of. */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {[['active', 'Active', counts.active], ['inactive', 'Resigned', counts.inactive], ['all', 'All', counts.all]].map(([k, label, n]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{
              fontFamily: F_HEAD,
              backgroundColor: statusFilter === k ? T.brandBg : T.surface,
              color: statusFilter === k ? T.brandDark : T.soft,
              border: `1px solid ${statusFilter === k ? T.brand : T.line}`,
            }}>
            {label} <span style={{ fontFamily: F_MONO, opacity: 0.75 }}>{n}</span>
          </button>
        ))}
      </div>

      {/* Job type is a separate axis from status — kept on its own row (dark
          accent) so it never gets confused with Active / Resigned. */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-xs font-semibold uppercase mr-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>Type</span>
        {[['all', 'All', counts.all], ['staff', 'Staff', counts.staff], ['crew', 'Crew', counts.crew]].map(([k, label, n]) => (
          <button key={k} onClick={() => setTypeFilter(k)}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{
              fontFamily: F_HEAD,
              backgroundColor: typeFilter === k ? T.ink : T.surface,
              color: typeFilter === k ? '#fff' : T.soft,
              border: `1px solid ${typeFilter === k ? T.ink : T.line}`,
            }}>
            {label} <span style={{ fontFamily: F_MONO, opacity: 0.75 }}>{n}</span>
          </button>
        ))}
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 520 }}>
          <table className="w-full">
            <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
              <tr><Th>Employee</Th><Th>Position</Th><Th right>Daily Rate</Th><Th>Status</Th><Th>Actions</Th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Av name={r.name} size={28} tone={r.crew ? T.brand : T.ink} />
                      <div>
                        <div className="font-semibold" style={{ fontFamily: F_BODY }}>{r.name}</div>
                        <div className="text-xs" style={{ color: T.soft, fontFamily: F_MONO }}>{r.id}</div>
                      </div>
                    </div>
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
                  <Td><Badge tone={r.status === 'Active' ? 'green' : 'neutral'}>{r.status}</Badge></Td>
                  <Td>
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(r)} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.brand }}><Edit2 size={11} /> Edit</button>
                      {!(typeof r.crew === 'boolean' ? r.crew : isCrewPosition(r.position)) && (
                        <button onClick={() => setFinalPayFor(r)} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.soft }}><Receipt size={11} /> Final Pay</button>
                      )}
                      <button onClick={() => setConfirm(r)} className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.soft }}>{r.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Employee' : 'Register Employee'} width={480}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID number*">
              <input value={form.id} onChange={e => ff('id', e.target.value)} placeholder="e.g. 7 (biometric ID)" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
            </Field>
            <Field label="Date hired">
              <input type="date" value={form.dateHired} onChange={e => ff('dateHired', e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <div className="text-xs -mt-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>The ID number must match the number this employee's fingerprint is registered under on the biometric scanner — that's what links their attendance logs to this record. Date hired is used to prorate 13th-month pay.</div>
          <Field label="Full name*"><input value={form.name} onChange={e => ff('name', e.target.value)} placeholder="Dela Cruz, Juan P." className={inputCls} style={inputStyle} /></Field>
          <Field label="Position">
            <select value={form.position} onChange={e => ff('position', e.target.value)} className={inputCls} style={inputStyle}>
              {POSITIONS.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          {isCrewPosition(form.position) && (
            <div className="flex items-start gap-2 p-2.5 rounded text-xs -mt-1.5" style={{ backgroundColor: T.warnBg, fontFamily: F_BODY, color: T.ink }}>
              <Truck size={13} color={T.warn} className="mt-0.5 shrink-0" />
              <span>Paid through <strong>Truck Payroll (pakyawan)</strong> — fixed daily rate plus per-delivery piece rates. Attendance is still imported for this employee, but only their tardiness affects pay.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily rate (₱)"><input type="number" value={form.rate} onChange={e => ff('rate', e.target.value)} className={inputCls} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={e => ff('status', e.target.value)} className={inputCls} style={inputStyle}>
                <option>Active</option><option>Inactive</option>
              </select>
            </Field>
          </div>
          <Field label="Declared monthly salary (₱)">
            <input type="number" value={form.declaredSalary} onChange={e => ff('declaredSalary', e.target.value)} placeholder="e.g. daily rate × 26" className={inputCls} style={inputStyle} />
          </Field>
          <div className="text-xs -mt-1.5" style={{ fontFamily: F_BODY, color: T.soft }}>Basis for SSS, PhilHealth, and Pag-IBIG lookups — see Settings → Statutory Deductions for the actual bracket tables.</div>

          {/* Early shift. Modelled here, on the person, rather than as a job
              title — the same staff member can be early on Saturdays and
              normal the rest of the week. Left blank means no early
              requirement at all. */}
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Early Shift</Eyebrow>
            <div className="text-xs mb-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
              Days this employee must report earlier than the usual {isCrewPosition(form.position) ? '6:30' : '6:40'} AM.
              Leave all unticked if none are required.
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
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

          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Personal Information</Eyebrow>
            <div className="text-xs mb-2.5" style={{ fontFamily: F_BODY, color: T.soft }}>Kept on file for company records only — never printed on payslips.</div>
            <div className="space-y-2.5">
              <Field label="Address">
                <input value={form.address} onChange={e => ff('address', e.target.value)} placeholder="Brgy. Poblacion, Mabini, Batangas" className={inputCls} style={inputStyle} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact number">
                  <input value={form.contact} onChange={e => ff('contact', e.target.value)} placeholder="09XX XXX XXXX" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
                </Field>
                <Field label="Birthdate">
                  <input type="date" value={form.birthdate} onChange={e => ff('birthdate', e.target.value)} className={inputCls} style={inputStyle} />
                </Field>
              </div>
            </div>
          </div>
          <div className="p-3 rounded" style={{ backgroundColor: T.bg }}>
            <Eyebrow>Government Contributions</Eyebrow>
            {[['sssOn', 'SSS'], ['phOn', 'PhilHealth'], ['piOn', 'Pag-IBIG (HDMF)']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 py-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.ink }}>
                <input type="checkbox" checked={form[k]} onChange={e => ff(k, e.target.checked)} /> {l}
              </label>
            ))}
            <Field label="Pag-IBIG MP2 (₱/cutoff)"><input type="number" value={form.mp2} onChange={e => ff('mp2', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="outline" onClick={() => setModal(false)} disabled={busy}>Cancel</Btn>
            <Btn icon={Save} onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Register'}</Btn>
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

/* ============================= ATTENDANCE ============================= */
