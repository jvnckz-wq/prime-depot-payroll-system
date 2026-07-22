'use client';

import React, { useState, useMemo } from 'react';
import { Wallet, Plus, Package, ArrowLeft, Printer, Edit2, Save } from 'lucide-react';
import { DeliveryForm } from '../components/DeliveryForm.jsx';
import { Av, Badge, Btn, Confirm, EmptyState, Eyebrow, H1, Modal, Panel, Td, Th } from '../components/ui.jsx';
import { BONUS_HEAD, BONUS_TRIPS, CREWS, DRIVER_DAILY, HELPER_DAILY } from '../data/seed';
import { flattenDeliveries, loanBalance } from '../lib/payroll';
import { peso, todayLabel } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const TruckPayrollView = ({ deliveries, setDeliveries, rates, setRates, loans, setLoans, toast }) => {
  const [selected, setSelected] = useState(null);
  const [editingRates, setEditingRates] = useState(false);
  const [ratesDraft, setRatesDraft] = useState(rates);
  const [logOpen, setLogOpen] = useState(false);
  const [filterCrew, setFilterCrew] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);

  // Loans belonging to any driver/pahinante (matched by name), still owing and not paused —
  // truck crew are paid daily, so this applies today's deduction rather than a cutoff's.
  const crewPeople = new Set(CREWS.flatMap(c => [c.driver, ...c.helpers.filter(h => h !== '—')]));
  const dueLoans = loans.filter(l => crewPeople.has(l.person) && !l.paused && loanBalance(l) > 0);
  const dueTotal = dueLoans.reduce((s, l) => s + Math.min(l.perCutoff, loanBalance(l)), 0);
  const applyDeductions = () => {
    setLoans(prev => prev.map(l => {
      if (!dueLoans.some(d => d.id === l.id)) return l;
      const amt = Math.min(l.perCutoff, loanBalance(l));
      if (amt <= 0) return l;
      return { ...l, entries: [...l.entries, { date: todayLabel(), type: 'deduction', amount: amt, remark: `Daily deduction — ${todayLabel()}` }] };
    }));
    toast(`Applied ${peso(dueTotal)} in loan deductions across ${dueLoans.length} loan(s).`);
    setConfirmApply(false);
  };

  const logDelivery = (crewId, address, customer, items, helpers) => {
    setDeliveries(prev => {
      const existing = prev[crewId] || { date: 'Jul 16, 2026', items: [], kaltas: [] };
      const nums = existing.items.map(i => i.seq).filter(Boolean);
      const nextSeq = nums.length ? Math.max(...nums) + 1 : 1;
      const crewDef = (CREWS.find(c => c.id === crewId)?.helpers || []).filter(h => h !== '—');
      const usedHelpers = helpers !== undefined ? helpers : crewDef; // [] means the checker explicitly recorded no helper that trip
      const isSwap = JSON.stringify(usedHelpers) !== JSON.stringify(crewDef);
      const newItems = items.map((r, i) => ({ seq: i === 0 ? nextSeq : null, address: i === 0 ? address : '', customer: i === 0 ? customer : '', item: r.item, qty: r.qty, unit: r.unit, d: r.d, h: r.h, dbl: r.dbl, helpers: i === 0 ? usedHelpers : undefined, swap: i === 0 ? isSwap : undefined }));
      return { ...prev, [crewId]: { ...existing, items: [...existing.items, ...newItems] } };
    });
    toast('Delivery logged for ' + crewId + '.');
    setLogOpen(false);
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries, filterCrew), [deliveries, filterCrew]);

  if (selected) {
    const crew = CREWS.find(c => c.id === selected);
    const log = deliveries[selected];
    const subD = log ? log.items.reduce((s, i) => s + i.d, 0) : 0;
    const subH = log ? log.items.reduce((s, i) => s + i.h, 0) : 0;
    const kalD = log ? log.kaltas.reduce((s, k) => s + k.d, 0) : 0;
    const kalH = log ? log.kaltas.reduce((s, k) => s + k.h, 0) : 0;
    const tripCount = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
    const bonusEligible = tripCount >= BONUS_TRIPS;
    const activeHelpers = crew.helpers.filter(h => h !== '—').length;
    const bonusD = bonusEligible ? BONUS_HEAD : 0;
    const bonusH = bonusEligible ? BONUS_HEAD * activeHelpers : 0;
    const netD = DRIVER_DAILY + subD + bonusD - kalD, netH = HELPER_DAILY + subH + bonusH - kalH;
    // Per-person piece-rate breakdown — supplementary to the combined truck total above,
    // useful when a substitute helper worked one or more trips that day.
    const defaultHelperNames = crew.helpers.filter(h => h !== '—');
    const helperBreakdown = [];
    if (log) {
      const map = {};
      let currentHelpers = defaultHelperNames, currentTrip = null;
      log.items.forEach(it => {
        if (it.seq) { currentHelpers = (it.helpers && it.helpers.length) ? it.helpers : defaultHelperNames; currentTrip = it.seq; }
        if (currentHelpers.length) {
          const share = it.h / currentHelpers.length;
          currentHelpers.forEach(h => {
            if (!map[h]) map[h] = { trips: new Set(), earned: 0 };
            map[h].trips.add(currentTrip);
            map[h].earned += share;
          });
        }
      });
      Object.entries(map).forEach(([name, v]) => helperBreakdown.push({ name, trips: v.trips.size, earned: v.earned }));
    }
    // ---- Printable Truck Payslip: full itemized ledger, split Driver / Pahinante 1 / Pahinante 2 ----
    // Positional (by slot, not name) — a mid-day substitute still lands in the right column,
    // annotated inline, rather than needing its own column.
    const p1Name = defaultHelperNames[0] || null;
    const p2Name = defaultHelperNames[1] || null;
    const payslipRows = [];
    if (log) {
      let currentHelpers = defaultHelperNames, currentTrip = null;
      log.items.forEach(it => {
        if (it.seq) { currentHelpers = (it.helpers && it.helpers.length) ? it.helpers : defaultHelperNames; currentTrip = it.seq; }
        const n = currentHelpers.length;
        const share = n ? it.h / n : 0;
        const h1 = currentHelpers[0], h2 = currentHelpers[1];
        payslipRows.push({
          item: it.item, qty: it.qty, unit: it.unit, dbl: it.dbl, driverAmt: it.d,
          p1Amt: h1 ? share : 0, p1Who: h1 || null, p1Sub: !!(h1 && p1Name && h1 !== p1Name),
          p2Amt: h2 ? share : 0, p2Who: h2 || null, p2Sub: !!(h2 && p2Name && h2 !== p2Name),
        });
      });
    }
    const p1SubtotalPiece = payslipRows.reduce((s, r) => s + r.p1Amt, 0);
    const p2SubtotalPiece = payslipRows.reduce((s, r) => s + r.p2Amt, 0);
    const p1Daily = p1Name ? HELPER_DAILY / activeHelpers : 0;
    const p2Daily = p2Name ? HELPER_DAILY / activeHelpers : 0;
    const p1Bonus = bonusEligible && p1Name ? BONUS_HEAD : 0;
    const p2Bonus = bonusEligible && p2Name ? BONUS_HEAD : 0;
    // Kaltas: attribute to whichever named slot the entry mentions; otherwise split across active slots
    const kaltasRows = (log ? log.kaltas : []).map(k => {
      const matchesP1 = p1Name && k.who.toLowerCase().includes(p1Name.toLowerCase());
      const matchesP2 = p2Name && k.who.toLowerCase().includes(p2Name.toLowerCase());
      let p1 = 0, p2 = 0;
      if (matchesP1) p1 = k.h;
      else if (matchesP2) p2 = k.h;
      else {
        const slots = [p1Name, p2Name].filter(Boolean).length || 1;
        if (p1Name) p1 = k.h / slots;
        if (p2Name) p2 = k.h / slots;
      }
      return { who: k.who, d: k.d, p1, p2 };
    });
    const p1Kaltas = kaltasRows.reduce((s, k) => s + k.p1, 0);
    const p2Kaltas = kaltasRows.reduce((s, k) => s + k.p2, 0);
    const p1Net = p1Daily + p1SubtotalPiece + p1Bonus - p1Kaltas;
    const p2Net = p2Daily + p2SubtotalPiece + p2Bonus - p2Kaltas;
    return (
      <div className="p-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Truck Payroll
        </button>
        <Panel className="p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Eyebrow>Delivery Manifest — {crew.id}</Eyebrow>
              <div className="text-xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{crew.driver} + {crew.helpers.join(' & ')}</div>
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>{crew.vehicle} · {log ? log.date : 'No date logged'} {bonusEligible && <span style={{ color: T.amber, fontWeight: 600 }}>· {tripCount} trips — palima bonus applies!</span>}</div>
            </div>
            <div className="flex items-center gap-2">
              <Btn variant="outline" size="sm" icon={Plus} onClick={() => setLogOpen(true)}>Log Delivery</Btn>
              <div className="px-3 py-1.5 rounded text-sm font-semibold tabular-nums" style={{ fontFamily: F_MONO, backgroundColor: T.ink, color: '#fff' }}>{crew.plate}</div>
            </div>
          </div>
        </Panel>
        {!log ? (
          <Panel><EmptyState icon={Package} title="No deliveries logged yet" desc="No Checker has logged a delivery for this truck yet today." action={<Btn icon={Plus} onClick={() => setLogOpen(true)}>Log a delivery</Btn>} /></Panel>
        ) : (
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr><Th>Seq.</Th><Th>Address</Th><Th>Customer</Th><Th>Crew</Th><Th>Item Category</Th><Th right>Qty</Th><Th>Unit</Th><Th right>Driver</Th><Th right>Pahinante</Th><Th>Double</Th></tr>
                </thead>
                <tbody>
                  {log.items.map((it, idx) => (
                    <tr key={idx}>
                      <Td mono>{it.seq || ''}</Td>
                      <Td>{it.address}</Td>
                      <Td>{it.customer}</Td>
                      <Td>{it.seq ? (
                        <span className="flex items-center gap-1.5">
                          {it.helpers?.length ? it.helpers.join(' & ') : '—'}
                          {it.swap && <Badge tone="amber">SUB</Badge>}
                        </span>
                      ) : ''}</Td>
                      <Td>{it.item}</Td>
                      <Td right mono>{it.qty}</Td>
                      <Td>{it.unit}</Td>
                      <Td right mono>{peso(it.d)}</Td>
                      <Td right mono>{peso(it.h)}</Td>
                      <Td>{it.dbl && <Badge tone="amber">DOUBLE</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3" style={{ borderTop: `1px dashed ${T.line}`, backgroundColor: T.bg }}>
              <div className="grid grid-cols-2 gap-x-8 max-w-md ml-auto text-sm" style={{ fontFamily: F_MONO }}>
                <span style={{ color: T.soft }}>Daily (fixed)</span><span className="text-right">{peso(DRIVER_DAILY)} / {peso(HELPER_DAILY)}</span>
                <span style={{ color: T.soft }}>Piece-rate subtotal</span><span className="text-right">{peso(subD)} / {peso(subH)}</span>
                {bonusEligible && <><span style={{ color: T.amber }}>Palima bonus ({tripCount} trips)</span><span className="text-right" style={{ color: T.amber }}>+{peso(bonusD)} / +{peso(bonusH)}</span></>}
                {log.kaltas.map((k, i) => (
                  <React.Fragment key={i}>
                    <span style={{ color: T.red }}>Kaltas — {k.who}</span><span className="text-right" style={{ color: T.red }}>-{peso(k.d)} / -{peso(k.h)}</span>
                  </React.Fragment>
                ))}
                <span className="font-bold pt-2" style={{ color: T.ink, borderTop: `1px solid ${T.line}` }}>NET SALARY</span>
                <span className="text-right font-bold pt-2" style={{ color: T.green, borderTop: `1px solid ${T.line}` }}>{peso(netD)} / {peso(netH)}</span>
              </div>
            </div>
          </Panel>
        )}
        {log && payslipRows.length > 0 && (
          <>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #truck-payslip, #truck-payslip * { visibility: visible; }
                #truck-payslip { position: absolute; left: 0; top: 0; width: 100%; }
                #truck-payslip .no-print { display: none !important; }
              }
            `}</style>
            <div id="truck-payslip" className="mt-4">
              <div className="flex items-center justify-between mb-2 no-print">
                <Eyebrow>Printable Payslip — {crew.id}</Eyebrow>
                <Btn variant="outline" size="sm" icon={Printer} onClick={() => window.print()}>Print Payslip</Btn>
              </div>
              <Panel className="overflow-hidden">
                <div className="px-6 py-5 flex items-center gap-3" style={{ backgroundColor: T.ink }}>
                  <div className="w-10 h-10 rounded flex items-center justify-center font-bold text-white shrink-0" style={{ backgroundColor: T.amber, fontFamily: F_HEAD }}>PD</div>
                  <div>
                    <div className="text-white font-bold text-sm" style={{ fontFamily: F_HEAD }}>PRIME DEPOT HARDWARE AND CONSTRUCTION SUPPLY</div>
                    <div className="text-xs" style={{ color: T.sidebarSoft, fontFamily: F_BODY }}>Mabini, Batangas City</div>
                  </div>
                </div>
                <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <div className="px-5 py-3" style={{ borderRight: `1px solid ${T.line}` }}><Eyebrow>Date</Eyebrow><div className="text-sm font-semibold" style={{ fontFamily: F_BODY }}>{log.date}</div></div>
                  <div className="px-5 py-3"><Eyebrow>Truck / Plate</Eyebrow><div className="text-sm font-semibold" style={{ fontFamily: F_BODY }}>{crew.id} · {crew.plate}</div></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Item</Th>
                        <Th right>Driver — {crew.driver}</Th>
                        <Th right>Pahinante 1{p1Name ? ` — ${p1Name}` : ''}</Th>
                        <Th right>Pahinante 2{p2Name ? ` — ${p2Name}` : ''}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslipRows.map((r, i) => (
                        <tr key={i}>
                          <Td>
                            {r.item} <span style={{ color: T.soft }}>({r.qty} {r.unit})</span>
                            {r.dbl && <span className="ml-1.5"><Badge tone="amber">DOUBLE</Badge></span>}
                          </Td>
                          <Td right mono>{peso(r.driverAmt)}</Td>
                          <Td right mono>
                            {r.p1Who ? peso(r.p1Amt) : '—'}
                            {r.p1Sub && <div className="text-xs" style={{ color: T.amber, fontFamily: F_BODY }}>({r.p1Who} subbed)</div>}
                          </Td>
                          <Td right mono>
                            {r.p2Who ? peso(r.p2Amt) : '—'}
                            {r.p2Sub && <div className="text-xs" style={{ color: T.amber, fontFamily: F_BODY }}>({r.p2Who} subbed)</div>}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: T.bg }}>
                        <Td><b>Piece-rate subtotal</b></Td>
                        <Td right mono><b>{peso(subD)}</b></Td>
                        <Td right mono><b>{p1Name ? peso(p1SubtotalPiece) : '—'}</b></Td>
                        <Td right mono><b>{p2Name ? peso(p2SubtotalPiece) : '—'}</b></Td>
                      </tr>
                      <tr>
                        <Td style={{ color: T.soft }}>Daily (fixed)</Td>
                        <Td right mono>{peso(DRIVER_DAILY)}</Td>
                        <Td right mono>{p1Name ? peso(p1Daily) : '—'}</Td>
                        <Td right mono>{p2Name ? peso(p2Daily) : '—'}</Td>
                      </tr>
                      {bonusEligible && (
                        <tr>
                          <Td style={{ color: T.amber }}>Palima bonus ({tripCount} trips)</Td>
                          <Td right mono style={{ color: T.amber }}>+{peso(bonusD)}</Td>
                          <Td right mono style={{ color: T.amber }}>{p1Name ? `+${peso(p1Bonus)}` : '—'}</Td>
                          <Td right mono style={{ color: T.amber }}>{p2Name ? `+${peso(p2Bonus)}` : '—'}</Td>
                        </tr>
                      )}
                      {kaltasRows.map((k, i) => (
                        <tr key={i}>
                          <Td style={{ color: T.red }}>Kaltas — {k.who}</Td>
                          <Td right mono style={{ color: T.red }}>{k.d ? `-${peso(k.d)}` : '—'}</Td>
                          <Td right mono style={{ color: T.red }}>{p1Name ? (k.p1 ? `-${peso(k.p1)}` : '—') : '—'}</Td>
                          <Td right mono style={{ color: T.red }}>{p2Name ? (k.p2 ? `-${peso(k.p2)}` : '—') : '—'}</Td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: T.ink }}>
                        <Td style={{ color: '#fff' }}><b>NET SALARY</b></Td>
                        <Td right mono style={{ color: T.amber }}><b>{peso(netD)}</b></Td>
                        <Td right mono style={{ color: T.amber }}><b>{p1Name ? peso(p1Net) : '—'}</b></Td>
                        <Td right mono style={{ color: T.amber }}><b>{p2Name ? peso(p2Net) : '—'}</b></Td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="grid grid-cols-3 gap-6 px-6 py-6">
                  {[crew.driver, p1Name || '—', p2Name || '—'].map((n, i) => (
                    <div key={i}>
                      <div className="h-px mb-1.5" style={{ backgroundColor: T.line }} />
                      <div className="text-xs text-center" style={{ fontFamily: F_BODY, color: T.soft }}>{n} — Signature / Date</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </>
        )}
        {log && helperBreakdown.length > 0 && (
          <Panel className="overflow-hidden mt-4">
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Pahinante earnings — today ({crew.id})</Eyebrow>
            </div>
            <table className="w-full">
              <thead><tr><Th>Pahinante</Th><Th right>Trips</Th><Th right>Piece-rate earned</Th></tr></thead>
              <tbody>
                {helperBreakdown.map((h, i) => (
                  <tr key={i}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Av name={h.name} size={22} tone={T.brand} />
                        <span className="font-semibold" style={{ fontFamily: F_BODY }}>{h.name}</span>
                        {!defaultHelperNames.includes(h.name) && <Badge tone="amber">Substitute</Badge>}
                      </div>
                    </Td>
                    <Td right mono>{h.trips}</Td>
                    <Td right mono>{peso(h.earned)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.lineSoft}` }}>
              Piece-rate portion only, split evenly across whoever worked each trip. The fixed daily rate and palima bonus above stay combined per truck.
            </div>
          </Panel>
        )}
        <Modal open={logOpen} onClose={() => setLogOpen(false)} title={`Log Delivery — ${crew.id}`} width={560}>
          <DeliveryForm crews={CREWS} fixedCrewId={selected} rates={rates} onSubmit={logDelivery} />
        </Modal>
      </div>
    );
  }

  return (
    <div className="p-6">
      <H1 sub="Grouped by truck: one driver + two pahinante share the delivery log for the day."
        action={<div className="flex items-center gap-2">
          <Btn variant="outline" icon={Wallet} disabled={dueLoans.length === 0} onClick={() => setConfirmApply(true)}>Apply Today's Deductions</Btn>
          <Btn icon={Plus} onClick={() => setLogOpen(true)}>Log Delivery</Btn>
        </div>}>Truck Payroll — Pakyawan</H1>

      <Panel className="overflow-hidden mb-5">
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>Piece-Rate Table</Eyebrow>
          {editingRates ? (
            <div className="flex gap-2">
              <Btn size="sm" icon={Save} onClick={() => { setRates(ratesDraft); setEditingRates(false); toast('Piece rates saved.'); }}>Save</Btn>
              <Btn size="sm" variant="outline" onClick={() => { setRatesDraft(rates); setEditingRates(false); }}>Cancel</Btn>
            </div>
          ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setRatesDraft(rates); setEditingRates(true); }}>Edit</Btn>}
        </div>
        <table className="w-full">
          <thead><tr><Th>Category</Th><Th>Unit</Th><Th right>Single — Drv</Th><Th right>Single — Hlp</Th><Th right>Double — Drv</Th><Th right>Double — Hlp</Th></tr></thead>
          <tbody>{(editingRates ? ratesDraft : rates).map((r, i) => (
            <tr key={i}>
              <Td>{editingRates ? <input value={r.cat} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, cat: e.target.value } : x))} className="px-2 py-1 rounded border text-xs w-full" style={{ borderColor: T.line, fontFamily: F_BODY }} /> : r.cat}</Td>
              <Td>{r.unit}</Td>
              {[0, 1].map(k => <Td right mono key={'s' + k}>{editingRates ? <input type="number" value={r.s[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, s: x.s.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.s[k])}</Td>)}
              {[0, 1].map(k => <Td right mono key={'d' + k}>{editingRates ? <input type="number" value={r.d[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, d: x.d.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.d[k])}</Td>)}
            </tr>
          ))}</tbody>
        </table>
        <div className="px-4 py-2.5 text-xs" style={{ fontFamily: F_BODY, color: T.soft, borderTop: `1px solid ${T.line}` }}>
          Fixed daily — Driver {peso(DRIVER_DAILY)} · Pahinante (combined) {peso(HELPER_DAILY)} · 5-trip "palima" bonus ₱100/head
        </div>
      </Panel>

      <Eyebrow>Crews</Eyebrow>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2 mb-6">
        {CREWS.map(c => {
          const log = deliveries[c.id];
          const subD = log ? log.items.reduce((s, i) => s + i.d, 0) : 0;
          const subH = log ? log.items.reduce((s, i) => s + i.h, 0) : 0;
          const tripCount = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
          const bonusEligible = tripCount >= BONUS_TRIPS;
          return (
            <button key={c.id} onClick={() => setSelected(c.id)} className="text-left">
              <Panel className="p-4 h-full" style={{ borderLeftWidth: 3, borderLeftColor: log ? T.brand : T.line }}>
                <div className="flex items-center justify-between mb-2">
                  <Eyebrow>{c.id}</Eyebrow>
                  <span className="text-xs tabular-nums px-1.5 py-0.5 rounded" style={{ fontFamily: F_MONO, backgroundColor: T.lineSoft, color: T.soft }}>{c.plate}</span>
                </div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Av name={c.driver} size={24} tone={T.brand} />
                  <span className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{c.driver}</span>
                </div>
                <div className="text-xs mb-3 ml-8" style={{ fontFamily: F_BODY, color: T.soft }}>+ {c.helpers.join(' & ')} · {c.vehicle}</div>
                {log ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-1.5">
                      <Badge tone="blue">{tripCount} trips</Badge>
                      {bonusEligible && <Badge tone="amber">Bonus</Badge>}
                    </div>
                    <span style={{ fontFamily: F_MONO, color: T.green }}>{peso(DRIVER_DAILY + subD + (bonusEligible ? BONUS_HEAD : 0))}</span>
                  </div>
                ) : <Badge tone="neutral">No deliveries yet</Badge>}
              </Panel>
            </button>
          );
        })}
      </div>

      <Panel className="overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow>All Deliveries ({allTrips.length})</Eyebrow>
          <select value={filterCrew} onChange={e => setFilterCrew(e.target.value)} className="px-2 py-1.5 rounded border text-xs" style={{ borderColor: T.line, fontFamily: F_BODY }}>
            <option value="">All crews</option>
            {CREWS.map(c => <option key={c.id} value={c.id}>{c.id} — {c.driver}</option>)}
          </select>
        </div>
        {allTrips.length === 0 ? <EmptyState title="No trips logged" desc="Deliveries will appear here once a Checker logs them." /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><Th>Date</Th><Th>Crew</Th><Th>Pahinante</Th><Th>Address</Th><Th>Customer</Th><Th right>Driver Earn</Th></tr></thead>
              <tbody>{allTrips.map((t, i) => (
                <tr key={i}>
                  <Td mono>{t.date}</Td>
                  <Td>{t.crewId}</Td>
                  <Td>{t.helpers?.length ? <span className="flex items-center gap-1.5">{t.helpers.join(' & ')}{t.swap && <Badge tone="amber">SUB</Badge>}</span> : '—'}</Td>
                  <Td>{t.address}</Td>
                  <Td>{t.customer}</Td>
                  <Td right mono>{peso(t.d)}</Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Delivery" width={560}>
        <DeliveryForm crews={CREWS} rates={rates} onSubmit={logDelivery} />
      </Modal>

      <Confirm open={confirmApply} onCancel={() => setConfirmApply(false)} onConfirm={applyDeductions}
        title="Apply today's deductions?"
        message={`This will deduct ${peso(dueTotal)} total across ${dueLoans.length} active loan(s) for today, each logged with today's date on the Loans & Advances page. This can't be undone from here.`}
        confirmLabel="Apply Deductions" />
    </div>
  );
};

/* ============================= STAFF PAYROLL (list + printable payslip) ============================= */
