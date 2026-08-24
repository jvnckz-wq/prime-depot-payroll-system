'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, MapPin, Plus, Truck as TruckIcon } from 'lucide-react';
import { Badge, Btn, Confirm, Eyebrow, Field, Modal, Panel, Skeleton, SkeletonRows, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

/// Fleet and double-rate areas, Operations Head only.
///
/// Neither list can be deleted, only retired. Past deliveries point at a truck
/// and were priced against an area — removing either would leave old records
/// referring to something that no longer exists.
export const FleetPanel = ({ toast }) => {
  const [trucks, setTrucks] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [truckModal, setTruckModal] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [truckForm, setTruckForm] = useState({ id: '', vehicle: '', plate: '' });
  const [truckError, setTruckError] = useState('');

  const [areaName, setAreaName] = useState('');
  const [areaError, setAreaError] = useState('');

  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [tr, ar] = await Promise.all([fetch('/api/trucks'), fetch('/api/doble-areas')]);
      const [td, ad] = await Promise.all([tr.json(), ar.json()]);
      if (tr.ok) setTrucks(td.trucks);
      if (ar.ok) setAreas(ad.areas);
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
    setTruckModal(true);
  };

  const openEditTruck = (t) => {
    setEditingTruck(t);
    setTruckForm({ id: t.id, vehicle: t.vehicle, plate: t.plate });
    setTruckError('');
    setTruckModal(true);
  };

  // One handler for both. Adding sends the whole record; editing sends only the
  // details that can change — the truck ID is the key past deliveries point at,
  // so it stays fixed once created.
  const saveTruck = async () => {
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

  const addArea = async () => {
    setAreaError('');
    if (!areaName.trim()) { setAreaError('Enter the barangay or sitio name.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/doble-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: areaName }),
      });
      const data = await res.json();
      if (!res.ok) { setAreaError(data.error || 'Could not add the area.'); return; }
      setAreaName('');
      toast(`${data.area.name} added to double-rate areas.`);
      load();
    } catch {
      setAreaError('Could not reach the server.');
    } finally { setBusy(false); }
  };

  const setAreaActive = async (area, isActive) => {
    try {
      const res = await fetch(`/api/doble-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) { toast('Could not update the area.', 'error'); return; }
      load();
    } catch { toast('Could not reach the server.', 'error'); }
  };

  const activeAreas = areas.filter(a => a.isActive);
  const retiredAreas = areas.filter(a => !a.isActive);

  return (
    <div>
      {/* ---------------- Fleet ---------------- */}
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>Trucks</Eyebrow>
        <Btn size="sm" icon={Plus} onClick={openAddTruck}>Add Truck</Btn>
      </div>

      <Panel className="overflow-hidden mb-2">
        <div className="overflow-x-auto pd-scroll-shadow">
          <table className="w-full">
            <thead><tr><Th>Truck</Th><Th>Vehicle</Th><Th>Plate</Th><Th>Status</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={5} rows={3} />}
              {!loading && trucks.map(t => (
                <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                  <Td mono>{t.id}</Td>
                  <Td>{t.vehicle}</Td>
                  <Td mono>{t.plate}</Td>
                  <Td>{t.isActive ? <Badge tone="green">In service</Badge> : <Badge tone="neutral">Retired</Badge>}</Td>
                  <Td right>
                    <div className="flex items-center justify-end gap-3">
                      <button className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.brand }}
                        onClick={() => openEditTruck(t)}>Edit</button>
                    {t.isActive ? (
                      <button className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.soft }}
                        onClick={() => setConfirm({
                          title: `Retire ${t.id}?`,
                          message: 'It will no longer appear when logging a delivery. Past deliveries on this truck stay exactly as they are — this is why trucks are retired rather than deleted.',
                          confirmLabel: 'Retire truck',
                          onConfirm: () => setTruckActive(t, false),
                        })}>Retire</button>
                    ) : (
                      <button className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.green }}
                        onClick={() => setTruckActive(t, true)}>Return to service</button>
                    )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
        A truck record holds the vehicle only. The driver and helpers are chosen on each delivery, so
        no one is tied to a particular truck.
      </p>

      {/* ---------------- Double-rate areas ---------------- */}
      <Eyebrow>Double-Rate Areas</Eyebrow>
      <p className="text-xs mt-1 mb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
        When a delivery address matches one of these, the form offers to pay the trip at double rate.
        {' '}{activeAreas.length} active{retiredAreas.length ? `, ${retiredAreas.length} retired` : ''}.
      </p>

      <Panel className="p-4 mb-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1" style={{ minWidth: 220 }}>
            <Field label="Add an area">
              <input value={areaName} onChange={e => setAreaName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addArea(); }}
                placeholder="e.g. SITIO MALAKING PULO" className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Btn icon={Plus} onClick={addArea} loading={busy} disabled={busy}>Add</Btn>
        </div>
        {areaError && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{areaError}</span>
          </div>
        )}
      </Panel>

      <Panel className="p-4">
        <div className="flex flex-wrap gap-2">
          {loading && <Skeleton w={90} h={11} />}
          {!loading && areas.map(a => (
            <span key={a.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded text-xs font-semibold"
              style={{
                fontFamily: F_MONO,
                backgroundColor: a.isActive ? T.warnBg : T.lineSoft,
                color: a.isActive ? T.warn : T.soft,
              }}>
              <MapPin size={11} />
              {a.name}
              <button
                title={a.isActive ? 'Retire this area' : 'Reactivate'}
                onClick={() => setAreaActive(a, !a.isActive)}
                className="px-1"
                style={{ color: a.isActive ? T.warn : T.green, fontFamily: F_HEAD }}>
                {a.isActive ? '×' : '+'}
              </button>
            </span>
          ))}
          {!loading && !areas.length && <span className="text-sm" style={{ color: T.soft }}>No areas yet.</span>}
        </div>
      </Panel>

      {/* ---------------- Add truck modal ---------------- */}
      <Modal open={truckModal} onClose={() => setTruckModal(false)} title={editingTruck ? `Edit ${editingTruck.id}` : 'Add Truck'} width={420}>
        <Field label="Truck ID">
          <input value={truckForm.id} readOnly={!!editingTruck}
            onChange={e => setTruckForm(f => ({ ...f, id: e.target.value.toUpperCase() }))}
            placeholder="TRK-14" className={inputCls}
            style={{ ...inputStyle, fontFamily: F_MONO, backgroundColor: editingTruck ? T.bg : T.surface, color: editingTruck ? T.soft : T.ink }} />
        </Field>
        <div className="mt-3">
          <Field label="Vehicle">
            <input value={truckForm.vehicle} onChange={e => setTruckForm(f => ({ ...f, vehicle: e.target.value }))}
              placeholder="Blue MD" className={inputCls} style={inputStyle} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Plate number">
            <input value={truckForm.plate} onChange={e => setTruckForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
              placeholder="ABC1234" className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
        </div>
        <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          {editingTruck
            ? 'The truck ID cannot be changed — past deliveries refer to it. Vehicle description and plate number can be corrected anytime.'
            : 'Only the vehicle is recorded here. Crew is chosen on each delivery.'}
        </div>

        {truckError && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{truckError}</span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Btn onClick={saveTruck} icon={Check} loading={busy} disabled={busy}>{busy ? 'Saving...' : editingTruck ? 'Save changes' : 'Add truck'}</Btn>
          <Btn variant="outline" onClick={() => setTruckModal(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Confirm
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.onConfirm?.(); setConfirm(null); }}
      />
    </div>
  );
};
