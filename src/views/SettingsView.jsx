'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Check, Edit2, Save, Trash2, Copy, KeyRound, UserX, UserCheck, ShieldCheck } from 'lucide-react';
import { Badge, Btn, Eyebrow, Field, H1, Money, Panel, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { computePagIBIG, computePhilHealth, computeSSS } from '../lib/payroll';
import { peso } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';
import { FleetPanel } from './FleetPanel.jsx';

export const SettingsView = ({ currentUser, onUserChange, onSignedOut, checkers, setCheckers, sssTable, setSssTable, philhealthRates, setPhilhealthRates, pagibigRates, setPagibigRates, birTable, setBirTable, toast }) => {
  const [tab, setTab] = useState('statutory');
  const [editSss, setEditSss] = useState(false);
  const [sssDraft, setSssDraft] = useState(sssTable);
  const [editPh, setEditPh] = useState(false);
  const [phDraft, setPhDraft] = useState(philhealthRates);
  const [editPi, setEditPi] = useState(false);
  const [piDraft, setPiDraft] = useState(pagibigRates);
  const [editBir, setEditBir] = useState(false);
  const [birDraft, setBirDraft] = useState(birTable);
  const [testSalary, setTestSalary] = useState('16900');

  // Persist one table to the database; only update the on-screen values on success.
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

  const testResult = useMemo(() => {
    const sal = parseFloat(testSalary) || 0;
    return { sss: computeSSS(sal, sssTable), ph: computePhilHealth(sal, philhealthRates), pi: computePagIBIG(sal, pagibigRates) };
  }, [testSalary, sssTable, philhealthRates, pagibigRates]);

  return (
    <div className="p-6">
      <H1 sub="Admin-editable rates. Editing these changes real payslip numbers going forward — past payslips already computed are unaffected.">Settings</H1>
      <div className="flex gap-1 mb-4 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft, width: 'fit-content' }}>
        {(currentUser?.role === 'ADMIN'
          // Configuration only. Anything about a person now lives on the
          // Account page, reached from your own name in the sidebar.
          ? [['statutory', 'Statutory Deductions'], ['fleet', 'Fleet & Areas']]
          : []
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ fontFamily: F_HEAD, backgroundColor: tab === k ? T.surface : 'transparent', color: tab === k ? T.ink : T.soft }}>{l}</button>
        ))}
      </div>

      {tab === 'statutory' && (
        <div className="space-y-4">
          <Panel className="p-4">
            <Eyebrow>Try a declared salary</Eyebrow>
            <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Check what the tables below actually produce, before saving changes to a live payslip.</div>
            <div className="flex items-end gap-4 flex-wrap">
              <div style={{ width: 180 }}><Field label="Declared monthly salary (₱)"><input type="number" value={testSalary} onChange={e => setTestSalary(e.target.value)} className={inputCls} style={inputStyle} /></Field></div>
              <div className="flex gap-6">
                <div><Eyebrow>SSS / cutoff</Eyebrow><Money value={testResult.sss} bold size="text-base" /></div>
                <div><Eyebrow>PhilHealth / cutoff</Eyebrow><Money value={testResult.ph} bold size="text-base" /></div>
                <div><Eyebrow>Pag-IBIG / cutoff</Eyebrow><Money value={testResult.pi} bold size="text-base" /></div>
              </div>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>SSS Contribution Table — employee share by declared monthly salary</Eyebrow>
              {editSss ? (
                <div className="flex gap-2">
                  <Btn size="sm" icon={Save} onClick={async () => { if (await saveTable('sss', sssDraft, 'SSS table')) { setSssTable(sssDraft); setEditSss(false); } }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setSssDraft(sssTable); setEditSss(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setSssDraft(sssTable); setEditSss(true); }}>Edit</Btn>}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              <table className="w-full">
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
                              <input type="number" value={r.ceiling} onChange={e => setSssDraft(p => p.map((x, j) => j === i ? { ...x, ceiling: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border w-24" style={{ borderColor: T.line, fontFamily: F_MONO, color: T.ink }} />
                            </span>;
                      }
                      if (r.ceiling === null) return <span style={{ fontFamily: F_MONO }}>{fromLabel} and up</span>;
                      if (!from) return <span style={{ fontFamily: F_MONO }}>Below {peso(r.ceiling)}</span>;
                      return <span style={{ fontFamily: F_MONO }}>{peso(from)} – {peso(r.ceiling)}</span>;
                    })()}
                    </Td>
                    <Td right mono>{editSss
                      ? <input type="number" value={r.share} onChange={e => setSssDraft(p => p.map((x, j) => j === i ? { ...x, share: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-24 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                      : peso(r.share)}
                    </Td>
                    <Td right mono>{peso((editSss ? r.share : r.share) / 2)}</Td>
                    {editSss && <Td><button onClick={() => setSssDraft(p => p.filter((_, j) => j !== i))}><Trash2 size={13} color={T.red} /></button></Td>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {editSss && <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
              <button onClick={() => setSssDraft(p => [...p.slice(0, -1), { ceiling: (p[p.length - 2]?.ceiling || 0) + 500, share: p[p.length - 1].share }, p[p.length - 1]])} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.blue }}><Plus size={12} /> Add bracket</button>
            </div>}
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>PhilHealth — % of declared salary, split 50/50 employer/employee</Eyebrow>
              {editPh ? (
                <div className="flex gap-2">
                  <Btn size="sm" icon={Save} onClick={async () => { if (await saveTable('philhealth', phDraft, 'PhilHealth rate')) { setPhilhealthRates(phDraft); setEditPh(false); } }}>Save</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { setPhDraft(philhealthRates); setEditPh(false); }}>Cancel</Btn>
                </div>
              ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setPhDraft(philhealthRates); setEditPh(true); }}>Edit</Btn>}
            </div>
            <div className="grid grid-cols-3 gap-4 p-4">
              {[['rate', 'Premium rate (%)'], ['floor', 'Salary floor (₱)'], ['ceiling', 'Salary ceiling (₱)']].map(([k, l]) => (
                <Field key={k} label={l}>
                  {editPh ? <input type="number" value={phDraft[k]} onChange={e => setPhDraft(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))} className={inputCls} style={inputStyle} />
                    : <div className="text-sm font-semibold" style={{ fontFamily: F_MONO, color: T.ink }}>{k === 'rate' ? `${philhealthRates[k]}%` : peso(philhealthRates[k])}</div>}
                </Field>
              ))}
            </div>
          </Panel>

          <div className="grid md:grid-cols-2 gap-4">
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>Pag-IBIG (HDMF)</Eyebrow>
                {editPi ? (
                  <div className="flex gap-2">
                    <Btn size="sm" icon={Save} onClick={async () => { if (await saveTable('pagibig', piDraft, 'Pag-IBIG rates')) { setPagibigRates(piDraft); setEditPi(false); } }}>Save</Btn>
                    <Btn size="sm" variant="outline" onClick={() => { setPiDraft(pagibigRates); setEditPi(false); }}>Cancel</Btn>
                  </div>
                ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setPiDraft(pagibigRates); setEditPi(true); }}>Edit</Btn>}
              </div>
              <table className="w-full">
                <thead><tr><Th>Salary up to (₱)</Th><Th right>Employee %</Th></tr></thead>
                <tbody>{(editPi ? piDraft.brackets : pagibigRates.brackets).map((b, i) => (
                  <tr key={i}>
                    <Td>{editPi
                      ? (b.ceiling === null ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>and up</span>
                        : <input type="number" value={b.ceiling} onChange={e => setPiDraft(p => ({ ...p, brackets: p.brackets.map((x, j) => j === i ? { ...x, ceiling: parseFloat(e.target.value) || 0 } : x) }))} className="px-2 py-1 rounded border text-xs w-24" style={{ borderColor: T.line, fontFamily: F_MONO }} />)
                      : (b.ceiling === null ? 'and up' : peso(b.ceiling))}
                    </Td>
                    <Td right mono>{editPi
                      ? <input type="number" value={b.eePct} onChange={e => setPiDraft(p => ({ ...p, brackets: p.brackets.map((x, j) => j === i ? { ...x, eePct: parseFloat(e.target.value) || 0 } : x) }))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                      : `${b.eePct}%`}
                    </Td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${T.line}` }}>
                <span className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.soft }}>Monthly cap (₱)</span>
                {editPi ? <input type="number" value={piDraft.cap} onChange={e => setPiDraft(p => ({ ...p, cap: parseFloat(e.target.value) || 0 }))} className="px-2 py-1 rounded border text-xs w-24 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} />
                  : <span className="text-sm font-semibold" style={{ fontFamily: F_MONO }}>{peso(pagibigRates.cap)}</span>}
              </div>
            </Panel>
            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>BIR Withholding Tax Brackets</Eyebrow>
                {editBir ? (
                  <div className="flex gap-2">
                    <Btn size="sm" icon={Save} onClick={async () => { if (await saveTable('bir', birDraft, 'BIR table')) { setBirTable(birDraft); setEditBir(false); } }}>Save</Btn>
                    <Btn size="sm" variant="outline" onClick={() => { setBirDraft(birTable); setEditBir(false); }}>Cancel</Btn>
                  </div>
                ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setBirDraft(birTable); setEditBir(true); }}>Edit</Btn>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr><Th>Over</Th><Th>Not over</Th><Th right>Base</Th><Th right>Rate %</Th>{editBir && <Th></Th>}</tr></thead>
                  <tbody>{(editBir ? birDraft : birTable).map((r, i) => (
                    <tr key={i}>
                      <Td mono>{editBir ? <input type="number" value={r.over} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, over: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-20" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.over)}</Td>
                      <Td mono>{editBir
                        ? (r.notOver === null ? <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>above</span> : <input type="number" value={r.notOver} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, notOver: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-20" style={{ borderColor: T.line, fontFamily: F_MONO }} />)
                        : (r.notOver === null ? 'Above' : peso(r.notOver))}
                      </Td>
                      <Td right mono>{editBir ? <input type="number" value={r.base} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, base: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-20 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.base)}</Td>
                      <Td right mono>{editBir ? <input type="number" value={r.rate} onChange={e => setBirDraft(p => p.map((x, j) => j === i ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} className="px-2 py-1 rounded border text-xs w-14 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : `${r.rate}%`}</Td>
                      {editBir && <Td><button onClick={() => setBirDraft(p => p.filter((_, j) => j !== i))}><Trash2 size={13} color={T.red} /></button></Td>}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {editBir && <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${T.line}` }}>
                <button onClick={() => setBirDraft(p => [...p.slice(0, -1), { over: p[p.length - 1].over, notOver: p[p.length - 1].over + 100000, base: p[p.length - 1].base, rate: p[p.length - 1].rate }, p[p.length - 1]])} className="text-xs font-semibold flex items-center gap-1" style={{ fontFamily: F_HEAD, color: T.blue }}><Plus size={12} /> Add bracket</button>
              </div>}
              <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.green, borderTop: `1px solid ${T.line}`, backgroundColor: T.greenBg }}><Check size={12} /> Reference only — not yet wired into an actual withholding deduction. All current employees fall below the exempt threshold anyway.</div>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'fleet' && currentUser?.role === 'ADMIN' && (
        <FleetPanel toast={toast} />
      )}

    </div>
  );
};

/* ============================= CHECKER VIEW (top-nav, all trucks) ============================= */
