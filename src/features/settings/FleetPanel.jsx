'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Badge, Btn, Confirm, Eyebrow, Field, Modal, Panel, SkeletonRows, Td, Th, inputCls, inputStyle } from '@/components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { labelTextError, plateError, flagErrors } from '@/lib/field-rules';

export const FleetPanel = ({ toast }) => {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [truckModal, setTruckModal] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [truckForm, setTruckForm] = useState({ id: '', vehicle: '', plate: '' });
  const [truckError, setTruckError] = useState('');
  const [truckErrs, setTruckErrs] = useState({});

  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const tr = await fetch('/api/trucks');
      const td = await tr.json();
      if (tr.ok) setTrucks(td.trucks);
    } catch {
      toast('Could not load fleet data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- deps intentionally limited to avoid re-running this load; intentional: load/sync state on mount or when deps change
  useEffect(() => { load(); }, []);

  const openAddTruck = () => {
    setEditingTruck(null);
    setTruckForm({ id: '', vehicle: '', plate: '' });
    setTruckError('');
    setTruckErrs({}); setTruckModal(true);
  };

  const openEditTruck = (t) => {
    setEditingTruck(t);
    setTruckForm({ id: t.id, vehicle: t.vehicle, plate: t.plate });
    setTruckError('');
    setTruckErrs({}); setTruckModal(true);
  };

  const saveTruck = async () => {
    const fe = {
      id: !editingTruck && !/^[A-Z0-9-]{3,12}$/.test(truckForm.id || '') ? 'Truck ID must be 3-12 characters: letters, numbers, or dashes.' : '',
      vehicle: labelTextError(truckForm.vehicle, { label: 'Vehicle description' }),
      plate: plateError(truckForm.plate),
    };
    setTruckErrs(fe);
    if (fe.id || fe.vehicle || fe.plate) { flagErrors(); return; }
    setTruckError(''); setBusy(true);
    try {
      const editing = !!editingTruck;
      const res = await fetch(editing ? `/api/trucks/${editingTruck.id}` : '/api/trucks', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing
          ? { vehicle: truckForm.vehicle, plate: truckForm.plate }
          : truckForm),
      });
      const data = await res.json();
      if (!res.ok) { setTruckError(data.error || 'Could not save the truck.'); return; }
      setTruckModal(false);
      setEditingTruck(null);
      setTruckForm({ id: '', vehicle: '', plate: '' });
      toast(editing ? `${data.truck.id} updated.` : `${data.truck.id} added to the fleet.`);
      load();
    } catch {
      setTruckError('Could not reach the server.');
    } finally { setBusy(false); }
  };

  const setTruckActive = async (truck, isActive) => {
    try {
      const res = await fetch(`/api/trucks/${truck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not update the truck.', 'error'); return; }
      toast(isActive ? `${truck.id} is back in service.` : `${truck.id} retired.`);
      load();
    } catch { toast('Could not reach the server.', 'error'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Eyebrow> </Eyebrow>
        <Btn size="sm" onClick={openAddTruck}>Add Truck</Btn>
      </div>

      <Panel className="overflow-hidden mb-2">
        <div className="overflow-x-auto pd-scroll-shadow">
          <table className="w-full">
            <thead><tr><Th>Truck</Th><Th>Vehicle</Th><Th>Plate</Th><Th center>Status</Th><Th right> </Th></tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={5} rows={3} />}
              {!loading && trucks.map(t => (
                <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                  <Td mono>{t.id}</Td>
                  <Td>{t.vehicle}</Td>
                  <Td mono>{t.plate}</Td>
                  <Td center>{t.isActive ? <Badge tone="green">In service</Badge> : <Badge tone="neutral">Retired</Badge>}</Td>
                  <Td right>
                    <button className="pd-icon-btn" title={`Edit ${t.id}`} aria-label={`Edit ${t.id}`}
                      onClick={() => openEditTruck(t)}>
                      <Pencil size={14} color={T.soft} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={truckModal} onClose={() => setTruckModal(false)} title={editingTruck ? `Edit ${editingTruck.id}` : 'Add Truck'} width={420}>
        <Field label="Truck ID" error={truckErrs.id}>
          <input value={truckForm.id} readOnly={!!editingTruck}
            data-field="truckId" onChange={e => setTruckForm(f => ({ ...f, id: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) }))}
            placeholder="TRK-14" className={inputCls}
            style={{ ...inputStyle, fontFamily: F_MONO, backgroundColor: editingTruck ? T.bg : T.surface, color: editingTruck ? T.soft : T.ink }} />
        </Field>
        <div className="mt-3">
          <Field label="Vehicle" error={truckErrs.vehicle}>
            <input value={truckForm.vehicle} maxLength={40} onChange={e => setTruckForm(f => ({ ...f, vehicle: e.target.value }))}
              placeholder="Blue MD" className={inputCls} style={inputStyle} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Plate number" error={truckErrs.plate}>
            <input value={truckForm.plate} onChange={e => setTruckForm(f => ({ ...f, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8) }))}
              placeholder="ABC1234" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
        </div>
        {!editingTruck && (
          <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            Only the vehicle is recorded here. Crew is chosen on each delivery.
          </div>
        )}

        {truckError && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{truckError}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Btn onClick={saveTruck} loading={busy} disabled={busy}>{busy ? 'Saving...' : editingTruck ? 'Save changes' : 'Add truck'}</Btn>
          <Btn variant="outline" onClick={() => setTruckModal(false)}>Cancel</Btn>
          {editingTruck && (
            <div className="ml-auto">
              {editingTruck.isActive ? (
                <Btn variant="amber" disabled={busy} onClick={() => {
                  const t = editingTruck;
                  setTruckModal(false);
                  setConfirm({
                    title: `Retire ${t.id}?`,
                    message: 'It will no longer appear when logging a delivery. Past deliveries on this truck stay exactly as they are.',
                    confirmLabel: 'Retire truck',
                    danger: true,
                    onConfirm: () => setTruckActive(t, false),
                  });
                }}>Retire truck</Btn>
              ) : (
                <Btn variant="outline" disabled={busy} onClick={() => { const t = editingTruck; setTruckModal(false); setTruckActive(t, true); }}>Return to service</Btn>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Confirm
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.onConfirm?.(); setConfirm(null); }}
      />
    </div>
  );
};
