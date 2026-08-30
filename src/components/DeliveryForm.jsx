'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, MapPin } from 'lucide-react';
import { Av, Btn, Eyebrow, Field, inputCls, inputStyle } from './ui.jsx';
import { DOBLE_AREAS } from '../data/seed';
import { matchDobleArea } from '../lib/payroll';
import { peso, looksLikePHPhone } from '../lib/utils';
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

  const [address, setAddress] = useState('');
  const [customer, setCustomer] = useState('');
  // Specific address/landmark and the receiver's contact number — the detail a
  // driver actually navigates and calls by. `address` stays the broad area that
  // drives double-rate matching; these two are free text and never affect pay.
  const [landmark, setLandmark] = useState('');
  const [contactNo, setContactNo] = useState('');
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

  // #D10 — Double rate applies AUTOMATICALLY when the delivery address matches a
  // known double-rate area. No manual "Mark as Double" toggle to forget, which
  // was a real source of wrong pay.
  const dobleMatch = matchDobleArea(address);
  const dbl = !!dobleMatch;

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
    if (!driverId || !address || computed.every(r => !r.qty)) return;
    setBusy(true);
    try {
      const ok = await onSubmit({
        truckId: crewId,
        driverId,
        helper1Id: helper1Id || null,
        helper2Id: helper2Id || null,
        address, customer, dbl,
        landmark, contactNo,
        matchedArea: dobleMatch || null,
        items: computed.map(r => ({ ...r, dbl })),
      });
      if (ok !== false) {
        setAddress(''); setCustomer(''); setLandmark(''); setContactNo(''); setLineRows([{ item: rateKey(rates[0]), qty: '' }]);
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

      {/* Area (broad — drives the double rate) + customer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-1">
        <Field label={<>Area / Barangay <span style={{ color: T.brand }}>*</span></>}>
          <input list="doble-areas" placeholder="e.g. Estrellang Langit" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} style={inputStyle} />
          <datalist id="doble-areas">{DOBLE_AREAS.map(a => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Customer's name">
          <input placeholder="Customer's name" value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      {/* Specific address / landmark + contact — what the driver navigates and
          calls by. Free text; neither affects pay. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-1">
        <Field label="Specific address / landmark">
          <input placeholder="Purok/sitio, kulay ng gate, katabi ng…" value={landmark} onChange={e => setLandmark(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
        <Field label="Contact number">
          <input type="tel" inputMode="tel" placeholder="e.g. 0917 123 4567" value={contactNo} onChange={e => setContactNo(e.target.value)} className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          {/* Soft hint only — never blocks saving. A checker may only have a
              partial number and still needs to log the delivery. */}
          {contactNo && !looksLikePHPhone(contactNo) && (
            <div className="text-xs mt-1" style={{ fontFamily: F_BODY, color: T.warn }}>
              Double-check this number — it doesn’t look like a PH mobile (09XX XXX XXXX) or landline.
            </div>
          )}
        </Field>
      </div>

      {dobleMatch && (
        <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs" style={{ color: T.green, fontFamily: F_BODY }}><MapPin size={12} /> Double rate applied automatically — &quot;{dobleMatch}&quot; is a double-rate area.</div>
      )}

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

      {/* Double rate is automatic from the address area (#D10) — read-only chip. */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {dbl ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: T.brand, color: '#fff' }}>
            <Check size={13} /> Double rate (auto)
          </span>
        ) : <span />}
        <div className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>Trip total: <span style={{ color: T.green, fontWeight: 600 }}>{peso(totalD)} / {peso(totalH)}</span></div>
      </div>
      <Btn onClick={submit} icon={Check} loading={busy} disabled={!address || !driverId || busy} full>{busy ? 'Saving…' : 'Save delivery'}</Btn>
    </div>
  );
};

/* ============================= TRUCK PAYROLL ============================= */
