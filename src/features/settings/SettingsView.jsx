'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Badge, Btn, Eyebrow, Field, H1, Money, Panel, Td, Th, inputCls, inputStyle } from '@/components/ui';
import { computePagIBIG, computePhilHealth, computeSSS } from '@/lib/payroll';
import { peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '@/styles/theme';
import { FleetPanel } from '@/features/settings/FleetPanel.jsx';
import { moneyInput } from '@/lib/field-rules';

export const SettingsView = ({ currentUser, onUserChange, onSignedOut, checkers, setCheckers, sssTable, setSssTable, philhealthRates, setPhilhealthRates, pagibigRates, setPagibigRates, birTable, setBirTable, toast, navTab }) => {
  const [tab, setTab] = useState(navTab || 'statutory');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the settings panel from the sidebar selection
  useEffect(() => { if (navTab) setTab(navTab); }, [navTab]);
  const [editSss, setEditSss] = useState(false);
  const [sssDraft, setSssDraft] = useState(sssTable);
  const [editPh, setEditPh] = useState(false);
  const [phDraft, setPhDraft] = useState(philhealthRates);
  const [editPi, setEditPi] = useState(false);
  const [piDraft, setPiDraft] = useState(pagibigRates);
  const [editBir, setEditBir] = useState(false);
  const [birDraft, setBirDraft] = useState(birTable);

  const saveTable = async (table, data, label) => {
    try {
      const res = await fetch('/api/statutory', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, data }),
      });
      const result = await res.json();
      if (!res.ok) { toast(result.error || 'Could not save.', 'error'); return false; }
      toast(`${label} saved.`);
      return true;
    } catch {
      toast('Could not reach the server.', 'error');
      return false;
    }
  };


  return (
    <div className="p-4 sm:p-6">
      <H1>{{ statutory: 'Statutory Deductions', fleet: 'Fleet' }[tab] || 'Settings'}</H1>

      {tab === 'statutory' && (
        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>SSS Contribution Table</Eyebrow>
              {editSss ? (
                <div className="flex gap-2">
                  <Btn size="sm" onClick={async () => { if (await saveTable('sss', sssDraft, 'SSS table')) { setSssTable(sssDraft); setEditSss(false); } }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setSssDraft(sssTable); setEditSss(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" onClick={() => { setSssDraft(sssTable); setEditSss(true); }}>Edit</Btn>}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}><tr><Th>Salary Range (₱)</Th><Th right>Employee share / month (₱)</Th><Th right>Per cutoff (₱)</Th>{editSss && <Th></Th>}</tr></thead>
                <tbody>{(editSss ? sssDraft : sssTable).map((r, i, arr) => (
                  <tr key={i}>
                    <Td>{(() => {
                      const from = r.from != null ? r.from : (i > 0 ? arr[i - 1].ceiling : 0);
                      const fromLabel = from ? peso(from) : '₱0';
                      if (editSss) {
                        return r.ceiling === null
                          ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_MONO }}>{fromLabel} and up</span>
                          : <span className="flex items-center gap-1.5 text-xs" style={{ fontFamily: F_MONO, color: T.soft }}>{fromLabel} –
                              <input type="number" value={r.ceiling} onChange={e => setSssDraft(p => p.map((x, j) => j === i ? { ...x, ceiling: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) } : x))} className="px-2 py-1 rounded border w-24" style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink }} />
                            </span>;
                      }
                      if (r.ceiling === null) return <span style={{ fontFamily: F_MONO }}>{fromLabel} and up</span>;
                      if (!from) return <span style={{ fontFamily: F_MONO }}>Below {peso(r.ceiling)}</span>;
                      return <span style={{ fontFamily: F_MONO }}>{peso(from)} – {peso(r.ceiling)}</span>;
                    })()}
                    </Td>
                    <Td right mono>{editSss
                      ? <input type="number" value={r.share} onChange={e => setSssDraft(p => p.map((x, j) => j === i ? { ...x, share: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) } : x))} className="px-2 py-1 rounded border text-xs w-24 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                      : peso(r.share)}
                    </Td>
                    <Td right mono>{peso((editSss ? r.share : r.share) / 2)}</Td>
                    {editSss && <Td><button className="pd-icon-btn pd-icon-danger" title="Remove this row" onClick={() => setSssDraft(p => p.filter((_, j) => j !== i))}><Trash2 size={14} color={T.soft} /></button></Td>}
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
            {editSss && <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
              <button onClick={() => setSssDraft(p => [...p.slice(0, -1), { ceiling: (p[p.length - 2]?.ceiling || 0) + 500, share: p[p.length - 1].share }, p[p.length - 1]])} className="pd-link text-xs" style={{ fontFamily: F_BODY }}><Plus size={12} /> Add bracket</button>
            </div>}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>PhilHealth</Eyebrow>
              {editPh ? (
                <div className="flex gap-2">
                  <Btn size="sm" onClick={async () => { if (await saveTable('philhealth', phDraft, 'PhilHealth rate')) { setPhilhealthRates(phDraft); setEditPh(false); } }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setPhDraft(philhealthRates); setEditPh(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" onClick={() => { setPhDraft(philhealthRates); setEditPh(true); }}>Edit</Btn>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
              {[['rate', 'Premium rate (%)'], ['floor', 'Salary floor (₱)'], ['ceiling', 'Salary ceiling (₱)']].map(([k, l]) => (
                <Field key={k} label={l}>
                  {editPh ? <input type="number" value={phDraft[k]} onChange={e => setPhDraft(p => ({ ...p, [k]: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) }))} className={inputCls} style={inputStyle} />
                    : <div className="text-sm font-semibold" style={{ fontFamily: F_MONO, color: T.ink }}>{k === 'rate' ? `${philhealthRates[k]}%` : peso(philhealthRates[k])}</div>}
                </Field>
              ))}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Pag-IBIG (HDMF)</Eyebrow>
              {editPi ? (
                <div className="flex gap-2">
                  <Btn size="sm" onClick={async () => { if (await saveTable('pagibig', piDraft, 'Pag-IBIG rates')) { setPagibigRates(piDraft); setEditPi(false); } }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setPiDraft(pagibigRates); setEditPi(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" onClick={() => { setPiDraft(pagibigRates); setEditPi(true); }}>Edit</Btn>}
            </div>
            {(() => {
              const src = editPi ? piDraft : pagibigRates;
              const setBracket = (i, key, v) => setPiDraft(p => ({ ...p, brackets: p.brackets.map((x, j) => j === i ? { ...x, [key]: v } : x) }));
              const num = (e) => Math.max(0, parseFloat(moneyInput(e.target.value)) || 0);
              const fields = [];
              src.brackets.forEach((b, i) => {
                if (b.ceiling !== null) {
                  fields.push({ key: `c${i}`, label: 'Salary up to (₱)', view: peso(b.ceiling),
                    edit: <input type="number" value={b.ceiling} onChange={e => setBracket(i, 'ceiling', num(e))} className={inputCls} style={inputStyle} /> });
                }
                const prev = i > 0 ? src.brackets[i - 1].ceiling : null;
                fields.push({ key: `p${i}`, label: b.ceiling !== null ? `Employee % up to ${peso(b.ceiling)}` : `Employee % above ${peso(prev ?? 0)}`, view: `${b.eePct}%`,
                  edit: <input type="number" value={b.eePct} onChange={e => setBracket(i, 'eePct', num(e))} className={inputCls} style={inputStyle} /> });
              });
              fields.push({ key: 'cap', label: 'Monthly cap (₱)', view: peso(src.cap),
                edit: <input type="number" value={piDraft.cap} onChange={e => setPiDraft(p => ({ ...p, cap: num(e) }))} className={inputCls} style={inputStyle} /> });
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                  {fields.map(f => (
                    <Field key={f.key} label={f.label}>
                      {editPi ? f.edit : <div className="text-sm font-semibold" style={{ fontFamily: F_MONO, color: T.ink }}>{f.view}</div>}
                    </Field>
                  ))}
                </div>
              );
            })()}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>BIR Withholding Tax Brackets</Eyebrow>
              {editBir ? (
                <div className="flex gap-2">
                  <Btn size="sm" onClick={async () => { if (await saveTable('bir', birDraft, 'BIR table')) { setBirTable(birDraft); setEditBir(false); } }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setBirDraft(birTable); setEditBir(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" onClick={() => { setBirDraft(birTable); setEditBir(true); }}>Edit</Btn>}
            </div>
            <div className="overflow-x-auto pd-scroll-shadow">
              <table className="w-full">
                <thead><tr><Th>Over</Th><Th>Not over</Th><Th right>Base</Th><Th right>Rate %</Th>{editBir && <Th></Th>}</tr></thead>
                <tbody>{(editBir ? birDraft : birTable).map((r, i) => (
                  <tr key={i}>
                    <Td mono>{editBir ? <input type="number" value={r.over} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, over: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) } : x))} className="px-2 py-1 rounded border text-xs w-20" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.over)}</Td>
                    <Td mono>{editBir
                      ? (r.notOver === null ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>above</span> : <input type="number" value={r.notOver} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, notOver: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) } : x))} className="px-2 py-1 rounded border text-xs w-20" style={{ borderColor: T.line, fontFamily: F_MONO }} />)
                      : (r.notOver === null ? 'Above' : peso(r.notOver))}
                    </Td>
                    <Td right mono>{editBir ? <input type="number" value={r.base} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, base: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) } : x))} className="px-2 py-1 rounded border text-xs w-20 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.base)}</Td>
                    <Td right mono>{editBir ? <input type="number" value={r.rate} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, rate: Math.max(0, parseFloat(moneyInput(e.target.value)) || 0) } : x))} className="px-2 py-1 rounded border text-xs w-14 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : `${r.rate}%`}</Td>
                    {editBir && <Td><button className="pd-icon-btn pd-icon-danger" title="Remove this bracket" onClick={() => setBirDraft(p => p.filter((_, j) => j !== i))}><Trash2 size={14} color={T.soft} /></button></Td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {editBir && <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
              <button onClick={() => setBirDraft(p => [...p.slice(0, -1), { over: p[p.length - 1].over, notOver: p[p.length - 1].over + 100000, base: p[p.length - 1].base, rate: p[p.length - 1].rate }, p[p.length - 1]])} className="pd-link text-xs" style={{ fontFamily: F_BODY }}><Plus size={12} /> Add bracket</button>
            </div>}
          </Panel>
        </div>
      )}

      {tab === 'fleet' && currentUser?.role === 'ADMIN' && (
        <FleetPanel toast={toast} />
      )}

    </div>
  );
};