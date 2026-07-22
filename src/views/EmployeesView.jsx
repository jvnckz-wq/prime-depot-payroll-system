'use client';

import React, { useState, useMemo } from 'react';
import { Search, Edit2, Save, UserPlus, Truck } from 'lucide-react';
import { Av, Badge, Btn, Confirm, Eyebrow, Field, H1, Modal, Money, Panel, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { CREWS, POSITIONS } from '../data/seed';
import { isCrewPosition } from '../lib/payroll';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

// Registration fields required by the client spec: ID number, name, position,
// daily rate, plus personal information (address, contact number, birthdate).
// Date hired is carried too — the 13th-month computation prorates by months
// worked, which is impossible without it. Personal info is captured here but
// deliberately never printed on a payslip.
const BLANK_EMP = {
  id: '', name: '', position: 'Administrative Staff', rate: '', declaredSalary: '',
  status: 'Active', sssOn: false, phOn: false, piOn: false, mp2: 0,
  address: '', contact: '', birthdate: '', dateHired: '',
};

export const EmployeesView = ({ staff, setStaff, toast }) => {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK_EMP);
  const [confirm, setConfirm] = useState(null);
  const ff = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const crewRows = useMemo(() => [
    ...CREWS.map(c => ({ id: c.id + '-D', name: c.driver, position: 'Driver', rate: 800, status: 'Active', crew: true })),
    ...CREWS.flatMap(c => c.helpers.filter(h => h !== '—').map((h, j) => ({ id: c.id + '-H' + j, name: h, position: 'Pahinante (Helper)', rate: 240, status: 'Active', crew: true }))),
  ], []);

  const rows = useMemo(() => [...staff, ...crewRows].filter(r => r.name.toLowerCase().includes(q.toLowerCase())), [staff, crewRows, q]);

  // Next free EMP-### — offered as a starting point so the admin isn't forced to
  // invent one, but the field stays editable because the ID has to match the
  // number the biometric scanner exports for that employee.
  const suggestId = () => {
    const nums = staff.map(s => parseInt(String(s.id).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    return 'EMP-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
  };

  const openAdd = () => { setEditing(null); setForm({ ...BLANK_EMP, id: suggestId() }); setModal(true); };
  const openEdit = (r) => { setEditing(r); setForm({ ...BLANK_EMP, ...r, rate: String(r.rate), declaredSalary: String(r.declaredSalary || '') }); setModal(true); };
  const save = () => {
    if (!form.id.trim()) { toast('ID number is required — it links this employee to the biometric logs.', 'error'); return; }
    if (!form.name.trim()) { toast('Name is required.', 'error'); return; }
    const dupe = staff.some(s => String(s.id).toLowerCase() === form.id.trim().toLowerCase() && (!editing || s.id !== editing.id));
    if (dupe) { toast(`ID ${form.id.trim()} is already used by another employee.`, 'error'); return; }
    const data = { ...form, id: form.id.trim(), rate: parseFloat(form.rate) || 0, declaredSalary: parseFloat(form.declaredSalary) || 0, mp2: parseFloat(form.mp2) || 0 };
    if (editing) {
      setStaff(list => list.map(s => s.id === editing.id ? { ...s, ...data } : s));
      toast('Employee updated.');
    } else {
      setStaff(list => [...list, data]);
      toast('Employee registered.');
    }
    setModal(false);
  };
  const toggleStatus = (r) => {
    setStaff(list => list.map(s => s.id === r.id ? { ...s, status: s.status === 'Active' ? 'Inactive' : 'Active' } : s));
    toast(`${r.name} marked ${r.status === 'Active' ? 'inactive' : 'active'}.`);
    setConfirm(null);
  };

  return (
    <div className="p-6">
      <H1 sub="Core registration fields only. Address, birthday, and contact details are masked from printed payroll sheets."
        action={<Btn icon={UserPlus} onClick={openAdd}>Register Employee</Btn>}>Employees</H1>
      <div className="relative w-64 mb-3">
        <Search size={14} className="absolute left-3 top-2.5" color={T.soft} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
          className={`${inputCls} pl-8`} style={inputStyle} />
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
                  <Td>{r.position}</Td>
                  <Td right mono><Money value={r.rate} /></Td>
                  <Td><Badge tone={r.status === 'Active' ? 'green' : 'neutral'}>{r.status}</Badge></Td>
                  <Td>
                    {r.crew ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>Managed via Truck Payroll</span> : (
                      <div className="flex gap-3">
                        <button onClick={() => openEdit(r)} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.brand }}><Edit2 size={11} /> Edit</button>
                        <button onClick={() => setConfirm(r)} className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.soft }}>{r.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    )}
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
              <input value={form.id} onChange={e => ff('id', e.target.value)} placeholder="EMP-015" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
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
            <Btn variant="outline" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn icon={Save} onClick={save}>{editing ? 'Save changes' : 'Register'}</Btn>
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
