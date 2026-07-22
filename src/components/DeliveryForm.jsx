'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Check, Trash2, Repeat, MapPin } from 'lucide-react';
import { Av, Btn, Eyebrow, Field, inputCls, inputStyle } from './ui.jsx';
import { ALL_DRIVERS, ALL_HELPERS, DOBLE_AREAS } from '../data/seed';
import { matchDobleArea } from '../lib/payroll';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const DeliveryForm = ({ crews, fixedCrewId, rates, onSubmit }) => {
  const [crewId, setCrewId] = useState(fixedCrewId || (crews[0] && crews[0].id) || '');
  const crew = crews.find(c => c.id === crewId) || crews[0];
  const defaultHelpers = (crew?.helpers || []).filter(h => h !== '—');

  const [address, setAddress] = useState('');
  const [customer, setCustomer] = useState('');
  const [dbl, setDbl] = useState(false);
  const [lineRows, setLineRows] = useState([{ item: rates[0].cat, qty: '' }]);
  // Driver, truck, and helpers are each chosen per delivery. Nothing in the
  // client's interview says a driver is permanently assigned to one truck, so
  // the form never enforces it — the pairing on each CREWS row is only the
  // usual one, used to prefill.
  const [driver, setDriver] = useState(crew?.driver || '');
  const [helper1, setHelper1] = useState(defaultHelpers[0] || '');
  const [helper2, setHelper2] = useState(defaultHelpers[1] || '');

  // Picking a different truck reloads that truck's usual crew as a starting
  // point. The admin or checker can still override any of the three.
  useEffect(() => {
    const c = crews.find(x => x.id === crewId);
    const def = (c?.helpers || []).filter(h => h !== '—');
    setDriver(c?.driver || '');
    setHelper1(def[0] || ''); setHelper2(def[1] || '');
  }, [crewId]);

  const addRow = () => setLineRows(r => [...r, { item: rates[0].cat, qty: '' }]);
  const removeRow = (i) => setLineRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i, patch) => setLineRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  const computed = lineRows.map(row => {
    const rate = rates.find(r => r.cat === row.item) || rates[0];
    const [dR, hR] = dbl ? rate.d : rate.s;
    const q = parseFloat(row.qty) || 0;
    return { item: row.item, qty: q, unit: rate.unit, d: +(dR * q).toFixed(2), h: +(hR * q).toFixed(2) };
  });
  const totalD = computed.reduce((s, r) => s + r.d, 0), totalH = computed.reduce((s, r) => s + r.h, 0);

  const dobleMatch = matchDobleArea(address);
  const helpersUsed = [helper1, helper2].map(h => h.trim()).filter(Boolean);
  const helperSwap = defaultHelpers.length > 0 && JSON.stringify(helpersUsed) !== JSON.stringify(defaultHelpers);
  const driverSwap = !!(crew?.driver && driver && driver !== crew.driver);
  const isSwap = helperSwap || driverSwap;

  const submit = () => {
    if (!driver) return;
    if (!address || computed.every(r => !r.qty)) return;
    onSubmit(crewId, address, customer, computed.map(r => ({ ...r, dbl })), helpersUsed, driver);
    setAddress(''); setCustomer(''); setDbl(false); setLineRows([{ item: rates[0].cat, qty: '' }]);
    // Driver and helpers are left as-is — the next delivery is usually the same crew.
  };

  return (
    <div>
      <div className="text-base font-bold mb-4" style={{ fontFamily: F_HEAD, color: T.ink }}>Trip details</div>

      {/* 1. Driver — picked from the whole driver pool, not tied to the truck */}
      <div className="mb-3">
        <Field label={<>Driver <span style={{ color: T.brand }}>*</span></>}>
          <select value={driver} onChange={e => setDriver(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">Select driver…</option>
            {ALL_DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
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
        <Field label="Pahinante 1">
          <select value={helper1} onChange={e => setHelper1(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {ALL_HELPERS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Pahinante 2">
          <select value={helper2} onChange={e => setHelper2(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">None</option>
            {ALL_HELPERS.filter(h => h !== helper1).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
      </div>
      {isSwap && (
        <div className="mt-2.5 mb-1 flex items-start gap-1.5 text-xs" style={{ fontFamily: F_BODY, color: T.warn }}>
          <Repeat size={12} className="mt-0.5 shrink-0" />
          <span>Different from {crew?.id}'s usual crew ({crew?.driver || '—'}{defaultHelpers.length ? ' + ' + defaultHelpers.join(' & ') : ''}). That's fine — this delivery is recorded with the crew selected above.</span>
        </div>
      )}

      {/* Address + customer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-1">
        <Field label="Delivery address">
          <input list="doble-areas" placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} style={inputStyle} />
          <datalist id="doble-areas">{DOBLE_AREAS.map(a => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Customer's name">
          <input placeholder="Customer's name" value={customer} onChange={e => setCustomer(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </div>

      {dobleMatch && !dbl && (
        <div className="mt-2 mb-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs" style={{ backgroundColor: T.warnBg }}>
          <span className="flex items-center gap-1.5" style={{ color: T.warn, fontFamily: F_BODY }}><MapPin size={12} /> "{dobleMatch}" is a double-rate area.</span>
          <button onClick={() => setDbl(true)} className="font-semibold underline shrink-0" style={{ color: T.warn, fontFamily: F_HEAD }}>Apply double rate</button>
        </div>
      )}
      {dobleMatch && dbl && (
        <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs" style={{ color: T.green, fontFamily: F_BODY }}><MapPin size={12} /> Double rate applied — matches known area "{dobleMatch}".</div>
      )}
      {!dobleMatch && dbl && address && (
        <div className="mt-2 mb-1 flex items-center gap-1.5 text-xs" style={{ color: T.soft, fontFamily: F_BODY }}><AlertTriangle size={12} /> "{address}" isn't on the standard double-rate list — double check before saving.</div>
      )}

      {/* Items delivered */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <Eyebrow>Items Delivered</Eyebrow>
        <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border" style={{ fontFamily: F_HEAD, color: T.ink, borderColor: T.line, backgroundColor: T.surface }}><Plus size={13} /> Add item</button>
      </div>
      <div className="border rounded-md overflow-hidden mb-3" style={{ borderColor: T.line }}>
        <div className="overflow-x-auto">
          <div className="grid px-3 py-2.5 text-xs font-semibold uppercase" style={{ gridTemplateColumns: '2.2fr 68px 74px 74px 84px 26px', minWidth: 500, backgroundColor: T.bg, fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>
            <span>Item</span><span className="text-right">Qty</span><span className="text-right">Drv. Rate</span><span className="text-right">Pah. Rate</span><span className="text-right">Drv. Earn</span><span></span>
          </div>
          {lineRows.map((row, i) => {
            const rate = rates.find(r => r.cat === row.item) || rates[0];
            const [dR, hR] = dbl ? rate.d : rate.s;
            const q = parseFloat(row.qty) || 0;
            return (
              <div key={i} className="grid items-center px-3 py-2 gap-2" style={{ gridTemplateColumns: '2.2fr 68px 74px 74px 84px 26px', minWidth: 500, borderTop: `1px solid ${T.lineSoft}` }}>
                <select value={row.item} onChange={e => updateRow(i, { item: e.target.value })} className="px-2 py-1.5 rounded border text-xs" style={{ fontFamily: F_BODY, borderColor: T.line }}>
                  {rates.map(r => <option key={r.cat} value={r.cat}>{r.cat}</option>)}
                </select>
                <input type="number" placeholder="0" value={row.qty} onChange={e => updateRow(i, { qty: e.target.value })} className="px-2 py-1.5 rounded border text-xs text-right" style={{ fontFamily: F_MONO, borderColor: T.line }} />
                <span className="text-xs text-right" style={{ fontFamily: F_MONO, color: T.brand }}>{peso(dR)}</span>
                <span className="text-xs text-right" style={{ fontFamily: F_MONO, color: T.warn }}>{peso(hR)}</span>
                <span className="text-xs text-right font-semibold" style={{ fontFamily: F_MONO, color: T.green }}>{peso(dR * q)}</span>
                {lineRows.length > 1 ? <button onClick={() => removeRow(i)} className="justify-self-end"><Trash2 size={13} color={T.red} /></button> : <span />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mark as Double + trip total + save */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button onClick={() => setDbl(d => !d)} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" style={{ fontFamily: F_HEAD, backgroundColor: dbl ? T.brand : T.lineSoft, color: dbl ? '#fff' : T.ink }}>
          {dbl ? <Check size={13} /> : <MapPin size={13} />} {dbl ? 'Marked as Double' : 'Mark as Double'}
        </button>
        <div className="text-sm" style={{ fontFamily: F_MONO, color: T.soft }}>Trip total: <span style={{ color: T.green, fontWeight: 600 }}>{peso(totalD)} / {peso(totalH)}</span></div>
      </div>
      <Btn onClick={submit} icon={Check} disabled={!address || !driver} full>Save delivery</Btn>
    </div>
  );
};

/* ============================= TRUCK PAYROLL ============================= */
