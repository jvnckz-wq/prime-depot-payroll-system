'use client';
// Settings > Piece Rates: the driver and helper rate for each item, single and double.

import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Btn, Confirm, Eyebrow, Field, H1, Modal, Panel, Td, Th, inputCls, inputStyle } from '@/components/ui';
import { round2 } from '@/lib/money';
import { peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { labelTextError, moneyError, moneyInput, unitError, flagErrors } from '@/lib/field-rules';

export const PieceRatesPanel = ({ rates, setRates, toast }) => {
  const isCustomDouble = (r) => (r.regular || []).some((v, k) => round2(r.double?.[k] ?? 0) !== round2((v || 0) * 2));
  const stripCustom = ({ _custom, ...rest }) => rest;

  const [editingRates, setEditingRates] = useState(false);
  const [ratesDraft, setRatesDraft] = useState(rates);
  const [addRateOpen, setAddRateOpen] = useState(false);
  const [newRate, setNewRate] = useState({ itemName: '', unit: '', driverRate: '', helperRate: '' });
  const [rateError, setRateError] = useState('');
  const [confirmRetire, setConfirmRetire] = useState(null);
  const [savingRates, setSavingRates] = useState(false);
  const [rateErrs, setRateErrs] = useState({});

  const saveRates = async () => {
    const bad = ratesDraft.find(r => (r.regular || []).some((v, k) => round2(r.double?.[k] ?? 0) < round2(v || 0)));
    if (bad) {
      toast(`"${bad.itemName}": a double rate can't be lower than its single rate. Check the Custom values.`, 'error');
      return;
    }
    setSavingRates(true);
    try {
      const changed = ratesDraft.filter((r, i) => JSON.stringify(stripCustom(r)) !== JSON.stringify(rates[i]));
      for (const r of changed) {
        if (!r.id) continue;
        const res = await fetch(`/api/rates/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: r.itemName, unit: r.unit,
            driverRate: r.regular[0], helperRate: r.regular[1],
            driverRateDouble: r.double[0], helperRateDouble: r.double[1],
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast(data.error || 'Could not save a rate.', 'error');
          setSavingRates(false);
          return;
        }
      }
      setRates(ratesDraft.map(stripCustom));
      setEditingRates(false);
      toast(changed.length ? `${changed.length} rate${changed.length > 1 ? 's' : ''} saved.` : 'No changes to save.');
    } catch {
      toast('Could not reach the server.', 'error');
    } finally {
      setSavingRates(false);
    }
  };

  const addRateItem = async () => {
    setRateError('');
    const fe = {
      itemName: labelTextError(newRate.itemName, { label: 'Item category' }),
      unit: unitError(newRate.unit),
      driverRate: moneyError(newRate.driverRate, { label: 'Driver rate', max: 5000 }),
      helperRate: moneyError(newRate.helperRate, { label: 'Helper rate', max: 5000 }),
    };
    setRateErrs(fe);
    if (Object.values(fe).some(Boolean)) { flagErrors(); return; }
    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRate),
      });
      const data = await res.json();
      if (!res.ok) { setRateError(data.error || 'Could not add the item.'); return; }
      const next = [...ratesDraft, { ...data.rate, _custom: isCustomDouble(data.rate) }];
      setRatesDraft(next);
      setRates(next.map(stripCustom));
      setNewRate({ itemName: '', unit: '', driverRate: '', helperRate: '' });
      setAddRateOpen(false);
      toast(`"${data.rate.itemName}" added to the rate table.`);
    } catch {
      setRateError('Could not reach the server.');
    }
  };

  const retireRateItem = async (r) => {
    if (!r.id) { toast('This item is not saved to the database yet.', 'error'); return; }
    try {
      const res = await fetch(`/api/rates/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) { toast('Could not retire the item.', 'error'); return; }
      const next = ratesDraft.filter(x => x.id !== r.id);
      setRatesDraft(next);
      setRates(next.map(stripCustom));
      toast(`"${r.itemName}" retired. Past deliveries keep their recorded amounts.`);
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <H1>Piece Rates</H1>

      <Panel className="overflow-hidden mb-5">
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>Piece-Rate Table</Eyebrow>
          {editingRates ? (
            <div className="flex gap-2">
              <Btn size="sm" variant="outline" onClick={() => { setRateErrs({}); setAddRateOpen(true); }}>Add item</Btn>
              <Btn size="sm" onClick={saveRates}>Save</Btn>
              <Btn size="sm" variant="outline" onClick={() => { setRatesDraft(rates); setEditingRates(false); }}>Cancel</Btn>
            </div>
          ) : <Btn size="sm" variant="outline" onClick={() => { setRatesDraft(rates.map(r => ({ ...r, _custom: isCustomDouble(r) }))); setEditingRates(true); }}>Edit</Btn>}
        </div>
        <div className="overflow-auto pd-scroll-shadow" style={{ maxHeight: 440 }}><table className="w-full">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: T.surface }}><tr><Th>Category</Th><Th>Unit</Th><Th right>Driver (Single)</Th><Th right>Helper (Single)</Th><Th right>Driver (Double)</Th><Th right>Helper (Double)</Th>{editingRates && <Th center>Double</Th>}{editingRates && <Th right>Retire</Th>}</tr></thead>
          <tbody>{(editingRates ? ratesDraft : rates).map((r, i) => (
            <tr key={i}>
              <Td>{editingRates ? <input value={r.itemName} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} className="px-2 py-1 rounded border text-xs w-full" style={{ borderColor: T.line, fontFamily: F_BODY }} /> : r.itemName}</Td>
              <Td>{r.unit}</Td>
              {[0, 1].map(k => <Td right mono key={'s' + k}>{editingRates ? <input type="number" value={r.regular[k]} onChange={e => { const nv = parseFloat(e.target.value) || 0; setRatesDraft(p => p.map((x, j) => j === i ? { ...x, regular: x.regular.map((v, vi) => vi === k ? nv : v), double: x._custom ? x.double : x.double.map((v, vi) => vi === k ? round2(nv * 2) : v) } : x)); }} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.regular[k])}</Td>)}
              {[0, 1].map(k => <Td right mono key={'d' + k}>{
                editingRates
                  ? (r._custom
                      ? <input type="number" value={r.double[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, double: x.double.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                      : <span style={{ color: T.soft }} title="Auto: single × 2">{peso(round2((r.regular[k] || 0) * 2))}</span>)
                  : peso(r.double[k])
              }</Td>)}
              {editingRates && (
                <Td center>
                  <button
                    onClick={() => setRatesDraft(p => p.map((x, j) => j === i
                      ? (x._custom
                          ? { ...x, _custom: false, double: x.regular.map(v => round2((v || 0) * 2)) }
                          : { ...x, _custom: true })
                      : x))}
                    className="text-xs font-semibold px-2 py-1 rounded border"
                    style={{ fontFamily: F_HEAD, borderColor: T.line, color: r._custom ? T.brand : T.soft, backgroundColor: r._custom ? T.brandBg : 'transparent' }}
                    title={r._custom ? 'Custom double rate. Click to reset to single × 2' : 'Auto: double = single × 2. Click to set a custom double rate.'}>
                    {r._custom ? 'Custom' : 'Auto ×2'}
                  </button>
                </Td>
              )}
              {editingRates && (
                <Td right>
                  <button className="pd-icon-btn pd-icon-danger" title="Retire this item" onClick={() => setConfirmRetire(r)}>
                    <Trash2 size={14} color={T.soft} />
                  </button>
                </Td>
              )}
            </tr>
          ))}</tbody>
        </table></div>
      </Panel>

      <Modal open={addRateOpen} onClose={() => setAddRateOpen(false)} title="Add Rate Item" width={440}>
        <Field label="Item category" error={rateErrs.itemName}>
          <input value={newRate.itemName} maxLength={40} onChange={e => setNewRate(f => ({ ...f, itemName: e.target.value }))}
            placeholder="e.g. Paint, Plywood, Roofing" className={inputCls} style={inputStyle} />
        </Field>
        <div className="mt-3">
          <Field label="Unit" error={rateErrs.unit}>
            <input value={newRate.unit} onChange={e => setNewRate(f => ({ ...f, unit: e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 15) }))}
              placeholder="bag, piece, box, elf" className={inputCls} style={inputStyle} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Driver rate (₱)" error={rateErrs.driverRate}>
            <input inputMode="decimal" value={newRate.driverRate}
              onChange={e => setNewRate(f => ({ ...f, driverRate: moneyInput(e.target.value) }))}
              className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
          <Field label="Helper rate (₱)" error={rateErrs.helperRate}>
            <input inputMode="decimal" value={newRate.helperRate}
              onChange={e => setNewRate(f => ({ ...f, helperRate: moneyInput(e.target.value) }))}
              className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
        </div>
        <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          Double-area rates default to twice these amounts. If this item works differently, switch
          its row to &quot;Custom&quot; in the table to set the double rate by hand.
        </div>
        {rateError && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{rateError}</span>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <Btn onClick={addRateItem}>Add item</Btn>
          <Btn variant="outline" onClick={() => setAddRateOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Confirm open={!!confirmRetire} onCancel={() => setConfirmRetire(null)}
        onConfirm={() => { retireRateItem(confirmRetire); setConfirmRetire(null); }}
        title={`Retire "${confirmRetire?.itemName}"?`}
        message="It will stop appearing when logging a delivery. Deliveries already logged keep the amounts they were recorded with, so past payslips are unaffected."
        confirmLabel="Retire item" danger />
    </div>
  );
};
