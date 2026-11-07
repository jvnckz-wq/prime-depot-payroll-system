'use client';
// Settings > Piece Rates: the driver and helper rate for each item. The double rate is always
// single × 2 (Nov 2026: no custom double rates), so only the single rates are edited.

import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Btn, Confirm, Eyebrow, Field, H1, Modal, Panel, Td, Th, inputCls, inputStyle } from '@/components/ui';
import { round2 } from '@/lib/money';
import { peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { labelTextError, moneyError, moneyInput, RATE_UNITS, unitError, flagErrors } from '@/lib/field-rules';

export const PieceRatesPanel = ({ rates, setRates, toast }) => {
  const [editingRates, setEditingRates] = useState(false);
  const [ratesDraft, setRatesDraft] = useState(rates);
  const [addRateOpen, setAddRateOpen] = useState(false);
  const [newRate, setNewRate] = useState({ itemName: '', unit: '', driverRate: '', helperRate: '' });
  const [rateError, setRateError] = useState('');
  const [confirmRetire, setConfirmRetire] = useState(null);
  const [savingRates, setSavingRates] = useState(false);
  const [rateErrs, setRateErrs] = useState({});

  const saveRates = async () => {
    setSavingRates(true);
    try {
      const changed = ratesDraft.filter((r, i) => JSON.stringify(r) !== JSON.stringify(rates[i]));
      for (const r of changed) {
        if (!r.id) continue;
        const res = await fetch(`/api/rates/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemName: r.itemName, unit: r.unit,
            driverRate: r.regular[0], helperRate: r.regular[1],
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast(data.error || 'Could not save a rate.', 'error');
          setSavingRates(false);
          return;
        }
      }
      setRates(ratesDraft.map(r => ({ ...r, double: r.regular.map(v => round2((v || 0) * 2)) })));
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
      const next = [...ratesDraft, data.rate];
      setRatesDraft(next);
      setRates(next);
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
      setRates(next);
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
          ) : <Btn size="sm" variant="outline" onClick={() => { setRatesDraft(rates); setEditingRates(true); }}>Edit</Btn>}
        </div>
        <div className="overflow-auto pd-scroll-shadow" style={{ maxHeight: 440 }}><table className="w-full">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: T.surface }}><tr><Th>Category</Th><Th>Unit</Th><Th right>Driver (Single)</Th><Th right>Helper (Single)</Th><Th right>Driver (Double)</Th><Th right>Helper (Double)</Th>{editingRates && <Th right>Retire</Th>}</tr></thead>
          <tbody>{(editingRates ? ratesDraft : rates).map((r, i) => (
            <tr key={i}>
              <Td>{editingRates ? <input value={r.itemName} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} className="px-2 py-1 rounded border text-xs w-full" style={{ borderColor: T.line, fontFamily: F_BODY }} /> : r.itemName}</Td>
              <Td>{r.unit}</Td>
              {[0, 1].map(k => <Td right mono key={'s' + k}>{editingRates ? <input type="number" value={r.regular[k]} onChange={e => { const nv = parseFloat(e.target.value) || 0; setRatesDraft(p => p.map((x, j) => j === i ? { ...x, regular: x.regular.map((v, vi) => vi === k ? nv : v), double: x.double.map((v, vi) => vi === k ? round2(nv * 2) : v) } : x)); }} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.regular[k])}</Td>)}
              {[0, 1].map(k => <Td right mono key={'d' + k}>{
                editingRates
                  ? <span style={{ color: T.soft }}>{peso(round2((r.regular[k] || 0) * 2))}</span>
                  : peso(round2((r.regular[k] || 0) * 2))
              }</Td>)}
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
            <select value={newRate.unit} onChange={e => setNewRate(f => ({ ...f, unit: e.target.value }))} className={inputCls} style={inputStyle}>
              <option value="" disabled>Choose unit...</option>
              {RATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
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
