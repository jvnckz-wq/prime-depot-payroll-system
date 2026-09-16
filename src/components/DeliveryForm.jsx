'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import { Btn, Eyebrow, Field, SearchSelect, inputCls, inputStyle } from './ui.jsx';
import { peso } from '../lib/utils';
import { PH_AREAS, PH_PROVINCES } from '../data/batangas-areas';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const DeliveryForm = ({ crews, fixedCrewId, rates, onSubmit }) => {
  const [crewId, setCrewId] = useState(fixedCrewId || (crews[0] && crews[0].id) || '');
  const crew = crews.find(c => c.id === crewId) || crews[0];

  // Names alone are not enough to record who was paid — two people can share
  // one, and a delivery has to point at a person. The crew roster is fetched
  // so every selection carries an employee id.
  const [pool, setPool] = useState({ drivers: [], helpers: [] });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/crew')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => { if (!cancelled) setPool({ drivers: data.drivers, helpers: data.helpers }); })
      .catch(err => console.error('Could not load crew roster:', err));
    return () => { cancelled = true; };
  }, []);

  // Trucks may arrive from the database a moment after this form mounts — the
  // Checker page renders it inline, not in a modal. Once they land, select the
  // first truck so the dropdown is never left blank.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    if (!fixedCrewId && !crewId && crews.length) setCrewId(crews[0].id);
  }, [crews, fixedCrewId, crewId]);

  // Location fields. Province is pre-filled Batangas (editable for the rare
  // out-of-province drop); municipality and barangay come from the PSGC list so
  // the same place is always spelled the same way.
  const [province, setProvince] = useState('Batangas');
  const [municipality, setMunicipality] = useState('');
  const [barangay, setBarangay] = useState('');
  const [customer, setCustomer] = useState('');
  // Specific address/landmark and the receiver's contact number: the detail a
  // driver actually navigates and calls by. Both are free text and never affect
  // pay (the combined municipality/barangay line is built at submit time).
  const [landmark, setLandmark] = useState('');
  const [contactNo, setContactNo] = useState('');
  // Double rate is a manual mark now, set by whoever logs the trip (they know
  // the terrain and distance). It drives which rate column each line uses.
  const [dbl, setDbl] = useState(false);
  const [lineRows, setLineRows] = useState([{ item: rates[0] ? (rates[0].id || `${rates[0].cat}|${rates[0].unit}`) : '', qty: '' }]);
  // Driver, truck, and helpers are each chosen per delivery. Nothing in the
  // client's account ties a driver to a truck, so nothing here assumes it.
  const [driverId, setDriverId] = useState('');
  const [helper1Id, setHelper1Id] = useState('');
  const [helper2Id, setHelper2Id] = useState('');

  // A rate is identified by its database id, never by its name. The client's
  // real table has two rows called "Aggregates" — one per elf, one per mini
  // dump — priced differently. Matching on the name would return whichever
  // came first and quietly pay the wrong amount.
  const rateKey = (r) => (r ? (r.id || `${r.cat}|${r.unit}`) : '');
  const rateByKey = (k) => rates.find(r => rateKey(r) === k) || rates[0];
  // Units are shown in the dropdown for the same reason: without them, two
  // rows read as the same choice.
  const rateLabel = (r) => (r.unit ? `${r.cat} — per ${r.unit}` : r.cat);

  // #D11 — Add item picks the first rate not already listed; if every rate is
  // already on the delivery there is nothing left to add.
  const addRow = () => setLineRows(r => {
    const used = new Set(r.map(x => x.item));
    const next = rates.find(rt => !used.has(rateKey(rt)));
    return next ? [...r, { item: rateKey(next), qty: '' }] : r;
  });

  // The rate table arrives from the database a moment after the form mounts,
  // and the seed rows used until then have different keys. Without this, the
  // item dropdown would be left pointing at a key that no longer exists.
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

  // #D11 — keys already chosen on other rows, so each item is offered only once.
  const usedKeys = new Set(lineRows.map(r => r.item));

  // Peso amounts are worked out here and sent with the delivery, then frozen on
  // the record. Recomputing them later from the rate table would mean an edit
  // to a rate silently rewrote what someone already earned.
  const computed = lineRows.map(row => {
    // The Checker renders this form inline, so it can mount a moment before the
    // rate table has loaded — `rate` (and its d/s pairs) can be undefined on the
    // first render. Guard it so the form shows zeroes until the rates arrive
    // instead of crashing on `rate.s`.
    const rate = rateByKey(row.item);
    const pair = rate ? (dbl ? rate.d : rate.s) : null;
    const dR = pair ? pair[0] : 0;
    const hR = pair ? pair[1] : 0;
    const q = parseFloat(row.qty) || 0;
    return { item: rate ? rate.cat : '', qty: q, unit: rate ? rate.unit : '', d: +(dR * q).toFixed(2), h: +(hR * q).toFixed(2) };
  });
  const totalD = computed.reduce((s, r) => s + r.d, 0), totalH = computed.reduce((s, r) => s + r.h, 0);

  // Guards against a double tap sending the same trip twice — a real risk on a
  // slow warehouse connection, and a double trip means double pay. The button is
  // disabled while a save is in flight, and the form only clears once the save
  // actually succeeds (so a failed attempt keeps everything for a retry).
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!driverId || !crewId || !customer.trim() || !contactNo.trim() || !province || !municipality || !barangay || !landmark.trim() || computed.every(r => !r.qty)) return;
    setBusy(true);
    try {
      // One combined line for display, kept in `address` so every existing screen
      // still shows a single address; the parts are sent separately too, so the
      // backend can store them for per-area reporting once those columns exist.
      const address = `${barangay}, ${municipality}, ${province}`;
      const ok = await onSubmit({
        truckId: crewId,
        driverId,
        helper1Id: helper1Id || null,
        helper2Id: helper2Id || null,
        address, province, municipality, barangay,
        customer, dbl,
        landmark, contactNo,
        matchedArea: null,
        items: computed.map(r => ({ ...r, dbl })),
      });
      if (ok !== false) {
        setProvince('Batangas'); setMunicipality(''); setBarangay(''); setCustomer(''); setLandmark(''); setContactNo(''); setLineRows([{ item: rateKey(rates[0]), qty: '' }]);
        // Crew stays selected — the next load that day is usually the same three
        // people, and re-picking them every time would be its own annoyance.
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="text-base font-bold mb-4" style={{ fontFamily: F_HEAD, color: T.ink }}>Trip details</div>

      {/* 1. Driver — picked from the whole driver pool, not tied to the truck */}
      <div className="mb-3">
        <Field label={<>Driver <span style={{ color: T.brand }}>*</span></>}>
          <select value={driverId} onChange={e => setDriverId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">Select driver...</option>
            {pool.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      </div>

      {/* 2. Truck + plate. Picking the truck fills the plate automatically. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label={<>Truck <span style={{ color: T.brand }}>*</span></>}>
          {fixedCrewId ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded border" style={{ borderColor: T.line, backgroundColor: T.bg }}>
              <span className="text-sm font-semibold" style={{ fontFamily: F_MONO, color: T.ink }}>{crew?.id}</span>
              <span className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{crew?.vehicle}</span>
            </div>
          ) : (
            <select value={crewId} onChange={e => setCrewId(e.target.value)} className={inputCls} style={inputStyle}>
              {crews.map(c => <option key={c.id} value={c.id}>{c.id} — {c.vehicle}</option>)}
            </select>
          )}
        </Field>
        <Field label="Plate number">
          <input readOnly value={crew?.plate || ''} placeholder="e.g. ABC-1234" className={inputCls} style={{ ...inputStyle, backgroundColor: T.bg, color: T.soft, fontFamily: F_MONO }} />
        </Field>
      </div>

      {/* 3. Helpers — the full pahinante pool is available for either slot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
        <Field label="Delivery Helper 1">
          <select value={helper1Id} onChange={e => setHelper1Id(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {pool.helpers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label="Delivery Helper 2">
          <select value={helper2Id} onChange={e => setHelper2Id(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {pool.helpers.filter(h => h.id !== helper1Id).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
      </div>

      {/* Customer and contact first: who and how to reach them, before the
          location. Both required. The contact field accepts digits only and is
          capped, so a scrambled or over-long entry can never be saved. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-1">
        <Field label={<>Customer&rsquo;s name <span style={{ color: T.brand }}>*</span></>}>
          <input placeholder="Customer's name" value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
        <Field label={<>Contact number <span style={{ color: T.brand }}>*</span></>}>
          <input type="tel" inputMode="numeric" maxLength={13} placeholder="e.g. 09171234567" value={contactNo} onChange={e => setContactNo(e.target.value.replace(/\D/g, '').slice(0, 13))} className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
        </Field>
      </div>

      {/* Location, top down: province, then municipality, barangay, and the
          specific landmark. All four are required. */}
      <div className="mt-3 mb-1">
        <Field label={<>Province <span style={{ color: T.brand }}>*</span></>}>
          <SearchSelect value={province} onChange={(v) => { setProvince(v); setMunicipality(''); setBarangay(''); }}
            options={PH_PROVINCES} placeholder="Search a province..." allowCustom />
        </Field>
      </div>
      <div className="mt-3 mb-1">
        <Field label={<>Municipality <span style={{ color: T.brand }}>*</span></>}>
          <SearchSelect value={municipality} onChange={(v) => { setMunicipality(v); setBarangay(''); }}
            options={Object.keys(PH_AREAS[province] || {})} placeholder="Search a town or city..." allowCustom />
        </Field>
      </div>
      <div className="mt-3 mb-1">
        <Field label={<>Barangay <span style={{ color: T.brand }}>*</span></>}>
          <SearchSelect value={barangay} onChange={setBarangay}
            options={(province && municipality) ? (PH_AREAS[province]?.[municipality] || []) : []}
            placeholder={municipality ? 'Search a barangay...' : 'Pick a municipality first'}
            disabled={!municipality} allowCustom />
        </Field>
      </div>
      <div className="mt-3 mb-1">
        <Field label={<>Specific address / landmark <span style={{ color: T.brand }}>*</span></>}>
          <input placeholder="Purok/sitio, kulay ng gate, katabi ng…" value={landmark} onChange={e => setLandmark(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      {/* Items delivered */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <Eyebrow>Items Delivered</Eyebrow>
        <button onClick={addRow} disabled={lineRows.length >= rates.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border disabled:opacity-40" style={{ fontFamily: F_HEAD, color: T.ink, borderColor: T.line, backgroundColor: T.surface }}><Plus size={13} /> Add item</button>
      </div>
      {/* Each item is its own block rather than a row in a cramped table. The
          form lives in a 560px modal; six columns squeezed into that width left
          the quantity field too narrow to read what had just been typed. */}
      <div className="flex flex-col gap-2 mb-3">
        {lineRows.map((row, i) => {
          // Same guard as the `computed` map above: the rate table can still be
          // loading on the Checker's first render, so `rate` may be undefined.
          const rate = rateByKey(row.item);
          const pair = rate ? (dbl ? rate.d : rate.s) : null;
          const dR = pair ? pair[0] : 0;
          const hR = pair ? pair[1] : 0;
          const q = parseFloat(row.qty) || 0;
          return (
            <div key={i} className="border rounded-md p-2.5" style={{ borderColor: T.line, backgroundColor: T.surface }}>
              <div className="flex items-center gap-2 mb-2">
                <select value={row.item} onChange={e => updateRow(i, { item: e.target.value })}
                  className="flex-1 min-w-0 px-2.5 py-2 rounded border text-sm"
                  style={{ fontFamily: F_BODY, borderColor: T.line, color: T.ink }}>
                  {/* #D11 — offer this row's own item plus only items not used by another row. */}
                  {rates.filter(r => rateKey(r) === row.item || !usedKeys.has(rateKey(r))).map(r => <option key={rateKey(r)} value={rateKey(r)}>{rateLabel(r)}</option>)}
                </select>
                {lineRows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="shrink-0 p-1.5" title="Remove this item">
                    <Trash2 size={14} color={T.red} />
                  </button>
                )}
              </div>

              <div className="flex items-end gap-3 flex-wrap">
                <div style={{ width: 110 }}>
                  <div className="text-xs mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>QTY</div>
                  <input type="number" min="0" placeholder="0" value={row.qty}
                    onChange={e => updateRow(i, { qty: e.target.value })}
                    className="w-full px-2.5 py-2 rounded border text-sm text-right"
                    style={{ fontFamily: F_MONO, borderColor: T.line, color: T.ink }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>
                    RATE PER {rate?.unit ? rate.unit.toUpperCase() : 'UNIT'}
                  </div>
                  <div className="text-sm py-2" style={{ fontFamily: F_MONO }}>
                    <span style={{ color: T.brand }}>{peso(dR)}</span>
                    <span style={{ color: T.soft }}> driver · </span>
                    <span style={{ color: T.warn }}>{peso(hR)}</span>
                    <span style={{ color: T.soft }}> delivery helper</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>THIS ITEM</div>
                  <div className="text-sm py-2" style={{ fontFamily: F_MONO }}>
                    <span style={{ color: T.green, fontWeight: 600 }}>{peso(dR * q)}</span>
                    <span style={{ color: T.soft }}> / </span>
                    <span style={{ color: T.green }}>{peso(hR * q)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Double rate is a manual mark set by whoever logs the trip. Toggling it
          re-prices every line above (single rate vs double) as you watch. The
          label stays dark so it reads in both states; only the box fills. */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button type="button" onClick={() => setDbl(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold border"
          style={{ fontFamily: F_HEAD, borderColor: dbl ? T.brand : T.line, backgroundColor: T.surface, color: T.ink }}>
          <span className="flex items-center justify-center rounded-sm" style={{ width: 16, height: 16, border: `1.5px solid ${dbl ? T.brand : T.line}`, backgroundColor: dbl ? T.brand : 'transparent' }}>
            {dbl && <Check size={12} color="#fff" strokeWidth={3} />}
          </span>
          Mark as double rate
        </button>
        <div className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>Trip total: <span style={{ color: T.green, fontWeight: 600 }}>{peso(totalD)} / {peso(totalH)}</span></div>
      </div>
      <Btn onClick={submit} loading={busy} disabled={!driverId || !crewId || !customer.trim() || !contactNo.trim() || !province || !municipality || !barangay || !landmark.trim() || busy} full>{busy ? 'Saving…' : 'Save delivery'}</Btn>
    </div>
  );
};

/* ============================= TRUCK PAYROLL ============================= */
