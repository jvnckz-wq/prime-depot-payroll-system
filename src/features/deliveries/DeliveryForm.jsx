'use client';
// Form for logging one delivery trip: truck, crew, address, items and double rate.

import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Fingerprint, LogOut, UserX } from 'lucide-react';
import { Btn, EmptyState, Eyebrow, Field, SearchSelect, inputCls, inputStyle } from '@/components/ui';
import { peso } from '@/lib/utils';
import { PH_AREAS, PH_PROVINCES } from '@/lib/batangas-areas';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { deliveryErrors, digitsOnly, firstError, flagErrors } from '@/lib/field-rules';

export const DeliveryForm = ({ crews, rates, onSubmit }) => {
  const [crewId, setCrewId] = useState((crews[0] && crews[0].id) || '');
  const crew = crews.find(c => c.id === crewId) || crews[0];

  const [pool, setPool] = useState({ drivers: [], helpers: [], scanned: new Set(), out: {}, online: true });
  const [poolTick, setPoolTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/crew')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => { if (!cancelled) setPool({ drivers: data.drivers, helpers: data.helpers, scanned: new Set(data.scannedIds || []), out: data.outAt || {}, online: data.deviceOnline !== false, checker: data.checker || null }); })
      .catch(err => console.error('Could not load crew roster:', err));
    return () => { cancelled = true; };
  }, [poolTick]);

  // While a checker waits for their time-in, check again every 15 seconds (the sync agent's pace),
  // so the form opens on its own after the scan, or when the scanner goes offline.
  const waiting = pool.checker?.status === 'not-in';
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => setPoolTick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, [waiting]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    if (!crewId && crews.length) setCrewId(crews[0].id);
  }, [crews, crewId]);

  const [province, setProvince] = useState('Batangas');
  const [municipality, setMunicipality] = useState('');
  const [barangay, setBarangay] = useState('');
  const [customer, setCustomer] = useState('');
  const [landmark, setLandmark] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [isDouble, setIsDouble] = useState(false);
  const [lineRows, setLineRows] = useState([{ item: rates[0] ? rates[0].id : '', qty: '' }]);
  const [driverId, setDriverId] = useState('');
  const [helper1Id, setHelper1Id] = useState('');
  const [helper2Id, setHelper2Id] = useState('');

  const rateKey = (r) => (r ? r.id : '');
  const rateByKey = (k) => rates.find(r => rateKey(r) === k) || rates[0];
  const rateLabel = (r) => (r.unit ? `${r.itemName} per ${r.unit}` : r.itemName);

  const addRow = () => setLineRows(r => {
    const used = new Set(r.map(x => x.item));
    const next = rates.find(rt => !used.has(rateKey(rt)));
    return next ? [...r, { item: rateKey(next), qty: '' }] : r;
  });

  useEffect(() => {
    if (!rates.length) return;
    const valid = new Set(rates.map(rateKey));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    setLineRows(rows => rows.every(r => valid.has(r.item))
      ? rows
      : rows.map(r => (valid.has(r.item) ? r : { ...r, item: rateKey(rates[0]) })));
  }, [rates]);
  const removeRow = (i) => setLineRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i, patch) => setLineRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const usedKeys = new Set(lineRows.map(r => r.item));

  const computed = lineRows.map(row => {
    const rate = rateByKey(row.item);
    const pair = rate ? (isDouble ? rate.double : rate.regular) : null;
    const dR = pair ? pair[0] : 0;
    const hR = pair ? pair[1] : 0;
    const q = parseFloat(row.qty) || 0;
    return { rateItemId: rate ? rate.id : '', item: rate ? rate.itemName : '', qty: q, unit: rate ? rate.unit : '', driverAmount: +(dR * q).toFixed(2), helperAmount: +(hR * q).toFixed(2) };
  });
  const totalD = computed.reduce((s, r) => s + r.driverAmount, 0), totalH = computed.reduce((s, r) => s + r.helperAmount, 0);

  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Order: scanned, then no scan, then already out (shown but cannot be picked).
  const rank = (p) => (pool.out[p.id] ? 2 : pool.scanned.has(p.id) ? 0 : 1);
  const scannedFirst = (list) => [...list].sort((a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name));
  const crewLabel = (p) => (pool.out[p.id] ? `${p.name} (out ${pool.out[p.id]})` : pool.scanned.has(p.id) ? p.name : `${p.name} (no scan today)`);
  const crewOption = (p) => <option key={p.id} value={p.id} disabled={!!pool.out[p.id]}>{crewLabel(p)}</option>;
  const outError = (id) => {
    if (!id || !pool.out[id]) return '';
    const p = [...pool.drivers, ...pool.helpers].find(x => x.id === id);
    return `${p ? p.name : 'This person'} is already out (${pool.out[id]}).`;
  };
  const noScanNote = (id) => (id && !pool.scanned.has(id) && !pool.out[id] ? (
    <div className="text-xs mt-1" style={{ fontFamily: F_BODY, color: T.warn, lineHeight: 1.5 }}>
      No scan today. You can still save; the Operations Head will review it.{pool.online ? '' : ' The scanner is offline, so scans may be missing.'}
    </div>
  ) : null);
  const submit = async () => {
    if (busy) return;
    if (firstError(deliveryErrors({ customer, contactNo, landmark, quantities: lineRows.map(r => r.qty), driverId, truckId: crewId, province, municipality, barangay, checkPlace: true }))) { setShowErrors(true); flagErrors(); return; }
    if ([driverId, helper1Id, helper2Id].some(outError)) { flagErrors(); return; }
    setBusy(true);
    try {
      const address = `${barangay}, ${municipality}, ${province}`;
      const ok = await onSubmit({
        truckId: crewId,
        driverId,
        helper1Id: helper1Id || null,
        helper2Id: helper2Id || null,
        address, province, municipality, barangay,
        customer, isDouble,
        landmark, contactNo,
        matchedArea: null,
        items: computed.map(r => ({ ...r, isDouble })),
      });
      if (ok === false) setPoolTick(t => t + 1);
      if (ok !== false) {
        setShowErrors(false); setProvince('Batangas'); setMunicipality(''); setBarangay(''); setCustomer(''); setLandmark(''); setContactNo(''); setLineRows([{ item: rateKey(rates[0]), qty: '' }]);
        setCrewId((crews[0] && crews[0].id) || ''); setDriverId(''); setHelper1Id(''); setHelper2Id(''); setIsDouble(false);
      }
    } finally {
      setBusy(false);
    }
  };
  const errs = showErrors ? deliveryErrors({ customer, contactNo, landmark, quantities: lineRows.map(r => r.qty), driverId, truckId: crewId, province, municipality, barangay, checkPlace: true }) : {};

  // A checker logs trips only while on duty (after their time-in, before their time-out).
  const gate = pool.checker;
  if (gate && gate.status === 'not-in') {
    return <EmptyState icon={Fingerprint} title="Time in first" desc="Scan your finger on the device to start logging trips."
      action={<Btn variant="outline" size="sm" onClick={() => setPoolTick(t => t + 1)}>Check again</Btn>} />;
  }
  if (gate && gate.status === 'out') {
    return <EmptyState icon={LogOut} title={`You timed out at ${gate.out}`} desc="Trips can only be logged while you are on duty." />;
  }
  if (gate && gate.status === 'unlinked') {
    return <EmptyState icon={UserX} title="Account not linked" desc="Ask the Operations Head to link this checker account to your employee record." />;
  }

  return (
    <div>
      <div className="text-base font-bold mb-4" style={{ fontFamily: F_HEAD, color: T.ink }}>Trip details</div>

      <div className="mb-3">
        <Field label={<>Driver <span style={{ color: T.brand }}>*</span></>} error={errs.driver || outError(driverId)}>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">Select driver...</option>
            {scannedFirst(pool.drivers).map(crewOption)}
          </select>
          {noScanNote(driverId)}
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label={<>Truck <span style={{ color: T.brand }}>*</span></>} error={errs.truck}>
          <select value={crewId} onChange={e => setCrewId(e.target.value)} className={inputCls} style={inputStyle}>
            {crews.map(c => <option key={c.id} value={c.id}>{c.id} · {c.vehicle}</option>)}
          </select>
        </Field>
        <Field label="Plate number">
          <input readOnly value={crew?.plate || ''} placeholder="e.g. ABC-1234" className={inputCls} style={{ ...inputStyle, backgroundColor: T.bg, color: T.soft, fontFamily: F_MONO }} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
        <Field label="Delivery Helper 1" error={outError(helper1Id)}>
          <select value={helper1Id} onChange={e => setHelper1Id(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {scannedFirst(pool.helpers).map(crewOption)}
          </select>
          {noScanNote(helper1Id)}
        </Field>
        <Field label="Delivery Helper 2" error={outError(helper2Id)}>
          <select value={helper2Id} onChange={e => setHelper2Id(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {scannedFirst(pool.helpers.filter(h => h.id !== helper1Id)).map(crewOption)}
          </select>
          {noScanNote(helper2Id)}
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-1">
        <Field label={<>Customer&rsquo;s name <span style={{ color: T.brand }}>*</span></>} error={errs.customer}>
          <input placeholder="Customer's name" maxLength={80} value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
        <Field label={<>Contact number <span style={{ color: T.brand }}>*</span></>} error={errs.contactNo}>
          <input type="tel" inputMode="numeric" maxLength={11} placeholder="e.g. 09171234567" value={contactNo} onChange={e => setContactNo(digitsOnly(e.target.value, 11))} className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
        </Field>
      </div>

      <div className="mt-3 mb-1">
        <Field label={<>Province <span style={{ color: T.brand }}>*</span></>} error={errs.province}>
          <SearchSelect value={province} onChange={(v) => { setProvince(v); setMunicipality(''); setBarangay(''); }}
            options={PH_PROVINCES} placeholder="Search a province..." />
        </Field>
      </div>
      <div className="mt-3 mb-1">
        <Field label={<>Municipality <span style={{ color: T.brand }}>*</span></>} error={errs.municipality}>
          <SearchSelect value={municipality} onChange={(v) => { setMunicipality(v); setBarangay(''); }}
            options={Object.keys(PH_AREAS[province] || {})} placeholder="Search a town or city..." />
        </Field>
      </div>
      <div className="mt-3 mb-1">
        <Field label={<>Barangay <span style={{ color: T.brand }}>*</span></>} error={errs.barangay}>
          <SearchSelect value={barangay} onChange={setBarangay}
            options={(province && municipality) ? (PH_AREAS[province]?.[municipality] || []) : []}
            placeholder={municipality ? 'Search a barangay...' : 'Pick a municipality first'}
            disabled={!municipality} />
        </Field>
      </div>
      <div className="mt-3 mb-1">
        <Field label="Specific address / landmark" error={errs.landmark}>
          <input placeholder="Purok/sitio, kulay ng gate, katabi ng…" maxLength={200} value={landmark} onChange={e => setLandmark(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      <div className="flex items-center justify-between mt-4 mb-2">
        <Eyebrow>Items Delivered</Eyebrow>
        <Btn size="sm" variant="outline" icon={Plus} onClick={addRow} disabled={lineRows.length >= rates.length}>Add item</Btn>
      </div>
      <div className="flex flex-col gap-2 mb-3">
        {lineRows.map((row, i) => {
          const rate = rateByKey(row.item);
          const pair = rate ? (isDouble ? rate.double : rate.regular) : null;
          const dR = pair ? pair[0] : 0;
          const hR = pair ? pair[1] : 0;
          const q = parseFloat(row.qty) || 0;
          return (
            <div key={i} className="border rounded-md p-2.5" style={{ borderColor: T.line, backgroundColor: T.surface }}>
              <div className="flex items-center gap-2 mb-2">
                <select value={row.item} onChange={e => updateRow(i, { item: e.target.value })}
                  className="flex-1 min-w-0 px-2.5 py-2 rounded border text-sm"
                  style={{ fontFamily: F_BODY, borderColor: T.line, color: T.ink }}>
                  {rates.filter(r => rateKey(r) === row.item || !usedKeys.has(rateKey(r))).map(r => <option key={rateKey(r)} value={rateKey(r)}>{rateLabel(r)}</option>)}
                </select>
                {lineRows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="pd-icon-btn pd-icon-danger shrink-0" title="Remove this item">
                    <Trash2 size={15} color={T.soft} />
                  </button>
                )}
              </div>

              <div className="flex items-end gap-3 flex-wrap">
                <div style={{ width: 110 }}>
                  <div className="text-xs mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>QTY</div>
                  <input inputMode="numeric" placeholder="0" value={row.qty} aria-invalid={errs.items && !(Number(row.qty) > 0) ? true : undefined}
                    onChange={e => updateRow(i, { qty: digitsOnly(e.target.value, 4) })}
                    className="w-full px-2.5 py-2 rounded border text-sm text-right"
                    style={{ fontFamily: F_MONO, borderColor: T.line, color: T.ink }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>
                    RATE PER {rate?.unit ? rate.unit.toUpperCase() : 'UNIT'}
                  </div>
                  <div className="text-sm py-1 flex flex-col" style={{ fontFamily: F_MONO, lineHeight: 1.6 }}>
                    <span><span style={{ color: T.brand }}>{peso(dR)}</span><span style={{ color: T.soft }}> driver</span></span>
                    <span><span style={{ color: T.warn }}>{peso(hR)}</span><span style={{ color: T.soft }}> delivery helper</span></span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>THIS ITEM</div>
                  <div className="text-sm py-1 flex flex-col" style={{ fontFamily: F_MONO, lineHeight: 1.6 }}>
                    <span style={{ color: T.green, fontWeight: 600 }}>{peso(dR * q)}</span>
                    <span style={{ color: T.green }}>{peso(hR * q)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errs.items && <div role="alert" data-field-error className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.brandDark, lineHeight: 1.5 }}>{errs.items}</div>}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button type="button" onClick={() => setIsDouble(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold border"
          style={{ fontFamily: F_HEAD, borderColor: isDouble ? T.brand : T.line, backgroundColor: T.surface, color: T.ink }}>
          <span className="flex items-center justify-center rounded-sm" style={{ width: 16, height: 16, border: `1.5px solid ${isDouble ? T.brand : T.line}`, backgroundColor: isDouble ? T.brand : 'transparent' }}>
            {isDouble && <Check size={12} color="#fff" strokeWidth={3} />}
          </span>
          Mark as double rate
        </button>
        <div className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>Trip total: <span style={{ color: T.green, fontWeight: 600 }}>{peso(totalD)} / {peso(totalH)}</span></div>
      </div>
      <Btn onClick={submit} loading={busy} disabled={busy} full>{busy ? 'Saving…' : 'Save delivery'}</Btn>
    </div>
  );
};