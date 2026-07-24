'use client';

import React, { useState, useMemo } from 'react';
import { Wallet, Plus, Package, ArrowLeft, Printer, Edit2, Save, Trash2, Check, AlertTriangle } from 'lucide-react';
import { DeliveryForm } from '../components/DeliveryForm.jsx';
import { Av, Badge, Btn, Confirm, EmptyState, Eyebrow, Field, H1, Modal, Panel, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { BONUS_HEAD, BONUS_TRIPS, CREWS, DRIVER_DAILY, HELPER_DAILY } from '../data/seed';
import { crewEarnings, flattenDeliveries, loanBalance } from '../lib/payroll';
import { peso, todayLabel } from '../lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '../theme';

export const TruckPayrollView = ({ deliveries, setDeliveries, reloadDeliveries, rates, setRates, loans, setLoans, toast }) => {
  const [selected, setSelected] = useState(null);
  const [editingRates, setEditingRates] = useState(false);
  const [ratesDraft, setRatesDraft] = useState(rates);
  const [logOpen, setLogOpen] = useState(false);
  const [filterCrew, setFilterCrew] = useState('');
  const [confirmApply, setConfirmApply] = useState(false);
  const [addRateOpen, setAddRateOpen] = useState(false);
  const [newRate, setNewRate] = useState({ cat: '', unit: '', driverRate: '', helperRate: '' });
  const [rateError, setRateError] = useState('');
  const [confirmRetire, setConfirmRetire] = useState(null);
  const [savingRates, setSavingRates] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Corrections are voids, never deletions. The reason travels with it so the
  // Operations Head can see not just that something changed, but why.
  const submitVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/deliveries/${voidTarget.deliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', reason: voidReason }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not void the delivery.', 'error'); return; }
      await reloadDeliveries();
      setVoidTarget(null); setVoidReason('');
      // A released cutoff still allows the correction, but says plainly that a
      // payslip already handed out no longer matches the record behind it.
      toast(data.warning || 'Delivery voided. It no longer counts toward pay.', data.warning ? 'error' : 'success');
    } catch {
      toast('Could not reach the server.', 'error');
    } finally { setVoiding(false); }
  };

  const restoreDelivery = async (row) => {
    try {
      const res = await fetch(`/api/deliveries/${row.deliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unvoid' }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not restore the delivery.', 'error'); return; }
      await reloadDeliveries();
      toast('Delivery restored.');
    } catch { toast('Could not reach the server.', 'error'); }
  };

  // Editing a rate writes to the database, one PATCH per changed row. Amounts
  // already recorded on a logged delivery are frozen at the moment they were
  // logged, so raising a rate today never rewrites what someone earned last
  // week — the new figure applies only to deliveries logged from here on.
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
            cat: r.cat, unit: r.unit,
            driverRate: r.s[0], helperRate: r.s[1],
            driverRateDouble: r.d[0], helperRateDouble: r.d[1],
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast(data.error || 'Could not save a rate.', 'error');
          setSavingRates(false);
          return;
        }
      }
      setRates(ratesDraft);
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
    if (!newRate.cat.trim()) { setRateError('Item name is required.'); return; }
    if (!newRate.unit.trim()) { setRateError('Unit is required — bag, piece, box, elf, and so on.'); return; }
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
      setNewRate({ cat: '', unit: '', driverRate: '', helperRate: '' });
      setAddRateOpen(false);
      toast(`"${data.rate.cat}" added to the rate table.`);
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
      toast(`"${r.cat}" retired — past deliveries keep their recorded amounts.`);
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

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

  // Logging writes straight to the database. The trip number, the frozen peso
  // amounts, and the record of who entered it are all decided server-side —
  // the browser only reports what was chosen.
  const logDelivery = async (payload) => {
    try {
      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Could not save the delivery.', 'error'); return; }
      await reloadDeliveries();
      toast(`Delivery logged for ${payload.truckId}.`);
      setLogOpen(false);
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries, filterCrew), [deliveries, filterCrew]);

  if (selected) {
    const crew = CREWS.find(c => c.id === selected);
    const log = deliveries[selected];
    // Everything below is computed by crewEarnings — the SAME function the
    // Crew Earnings report uses. When the manifest and the report were worked
    // out separately they disagreed, because a fix applied to one never
    // reached the other. One function means one answer.
    const crewTotals = log
      ? crewEarnings({ [selected]: log }, {
          driverDaily: DRIVER_DAILY, helperDaily: HELPER_DAILY,
          bonusHead: BONUS_HEAD, bonusTrips: BONUS_TRIPS,
        })
      : [];

    // Kaltas recorded against this truck, attributed by name where the entry
    // says who it belongs to.
    const kaltasFor = (name) => (log?.kaltas || [])
      .filter(k => !k.name || k.name === name)
      .reduce((sum, k) => sum + (k.name ? (k.amount || 0) : 0), 0);

    const people = crewTotals.map(p => ({ ...p, kaltas: kaltasFor(p.name), net: p.total - kaltasFor(p.name) }));
    const drivers = people.filter(p => p.role === 'Driver');
    const helpers = people.filter(p => p.role === 'Pahinante');

    const tripCount = log ? new Set(log.items.filter(i => !i.voided).map(i => i.seq).filter(Boolean)).size : 0;
    const bonusEligible = tripCount >= BONUS_TRIPS;
    const grandNet = people.reduce((sum, p) => sum + p.net, 0);

    // ---- Printable Truck Payslip: itemized ledger, split Driver / Pahinante 1 / Pahinante 2 ----
    //
    // The three columns are SLOTS, not people. There is no assigned crew, so a
    // slot has no permanent occupant — each row names whoever actually rode
    // that trip. Column totals are therefore meaningless as a payout figure
    // (slot 1 can be Perlas in the morning and Roderick in the afternoon),
    // which is why the totals below the table are per person instead.
    const payslipRows = [];
    if (log) {
      let currentHelpers = [], currentDriver = null;
      log.items.forEach(it => {
        // A voided trip earns nothing. It stays on the manifest, but never
        // reaches a payslip.
        if (it.voided) return;
        if (it.seq) {
          currentHelpers = it.helpers || [];
          currentDriver = it.driver || null;
        }
        const n = currentHelpers.length;
        const share = n ? it.h / n : 0;
        const h1 = currentHelpers[0], h2 = currentHelpers[1];
        payslipRows.push({
          item: it.item, qty: it.qty, unit: it.unit, dbl: it.dbl,
          driverAmt: it.d, driverWho: currentDriver,
          p1Amt: h1 ? share : 0, p1Who: h1 || null,
          p2Amt: h2 ? share : 0, p2Who: h2 || null,
        });
      });
    }
    // Whoever actually drove this truck during the period.
    const driversWorked = drivers.map(d => d.name);

    // Kaltas rows, attributed to the person the entry names.
    const kaltasRows = (log?.kaltas || []).map(k => ({ who: k.who, amount: k.h ?? k.amount ?? 0 }));

    return (
      <div className="p-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>
          <ArrowLeft size={14} /> Back to Truck Payroll
        </button>
        <Panel className="p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Eyebrow>Delivery Manifest</Eyebrow>
              {/* Truck first, then whoever actually drove it. No assigned crew
                  is named, because there is none. */}
              <div className="text-xl font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>
                {crew.id}
                {driversWorked.length > 0 && <span style={{ color: T.soft, fontWeight: 400 }}> — {driversWorked.join(' / ')}</span>}
              </div>
              <div className="text-sm" style={{ fontFamily: F_BODY, color: T.soft }}>
                {crew.vehicle} · <span style={{ fontFamily: F_MONO }}>{crew.plate}</span> · {log ? log.date : 'No deliveries logged'}
                {bonusEligible && <span style={{ color: T.green, fontWeight: 600 }}> · {tripCount} trips — palima bonus applies</span>}
              </div>
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
                  <tr><Th>Seq.</Th><Th>Address</Th><Th>Customer</Th><Th>Crew</Th><Th>Item Category</Th><Th right>Qty</Th><Th>Unit</Th><Th right>Driver</Th><Th right>Pahinante</Th><Th>Double</Th><Th right>Correct</Th></tr>
                </thead>
                <tbody>
                  {log.items.map((it, idx) => (
                    <tr key={idx} style={it.voided ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                      <Td mono>{it.seq || ''}</Td>
                      <Td>{it.address}</Td>
                      <Td>{it.customer}</Td>
                      <Td>{it.seq ? (
                        <span className="flex items-center gap-1.5">
                          {it.helpers?.length ? it.helpers.join(' & ') : '—'}
                        </span>
                      ) : ''}</Td>
                      <Td>{it.item}</Td>
                      <Td right mono>{it.qty}</Td>
                      <Td>{it.unit}</Td>
                      <Td right mono>{peso(it.d)}</Td>
                      <Td right mono>{peso(it.h)}</Td>
                      <Td>{it.dbl && <Badge tone="amber">DOUBLE</Badge>}</Td>
                      <Td right>
                        {it.seq && (it.voided ? (
                          <button className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.green, textDecoration: 'none' }}
                            onClick={() => restoreDelivery(it)}>Restore</button>
                        ) : (
                          <button className="text-xs font-semibold" style={{ fontFamily: F_HEAD, color: T.red }}
                            onClick={() => { setVoidReason(''); setVoidTarget(it); }}>Void</button>
                        ))}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Totals are per PERSON, not per column. The three columns above
                are slots that different people occupy on different trips, so a
                column total would be two people's money added together and
                payable to neither. */}
            <div className="px-4 py-3" style={{ borderTop: `1px dashed ${T.line}`, backgroundColor: T.bg }}>
              <Eyebrow>Payable — per person</Eyebrow>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full" style={{ fontFamily: F_MONO, fontSize: 13 }}>
                  <thead>
                    <tr>
                      <Th>Name</Th><Th>Role</Th><Th right>Trips</Th>
                      <Th right>Daily</Th><Th right>Piece rate</Th><Th right>Palima</Th><Th right>Kaltas</Th><Th right>Net</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p, i) => (
                      <tr key={i}>
                        <Td>{p.name}</Td>
                        <Td><Badge tone={p.role === 'Driver' ? 'amber' : 'neutral'}>{p.role}</Badge></Td>
                        <Td right mono>{p.trips}</Td>
                        <Td right mono>{peso(p.dailyRate)}</Td>
                        <Td right mono>{peso(p.pieceRate)}</Td>
                        <Td right mono>{p.bonus ? <span style={{ color: T.green }}>+{peso(p.bonus)}</span> : '—'}</Td>
                        <Td right mono>{p.kaltas ? <span style={{ color: T.red }}>-{peso(p.kaltas)}</span> : '—'}</Td>
                        <Td right mono><b style={{ color: T.green }}>{peso(p.net)}</b></Td>
                      </tr>
                    ))}
                    {!people.length && (
                      <tr><Td colSpan={8}><span style={{ color: T.soft }}>No payable trips for this truck yet.</span></Td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {people.length > 0 && (
                <div className="flex justify-between items-baseline mt-3 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
                  <span className="font-bold text-sm" style={{ fontFamily: F_HEAD, color: T.ink }}>TOTAL PAYABLE — {crew.id}</span>
                  <span className="font-bold" style={{ fontFamily: F_MONO, fontSize: 18, color: T.brand }}>{peso(grandNet)}</span>
                </div>
              )}
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
                        <Th right>Driver</Th>
                        <Th right>Pahinante 1</Th>
                        <Th right>Pahinante 2</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslipRows.map((r, i) => (
                        <tr key={i}>
                          <Td>
                            {r.item} <span style={{ color: T.soft }}>({r.qty} {r.unit})</span>
                            {r.dbl && <span className="ml-1.5"><Badge tone="amber">DOUBLE</Badge></span>}
                          </Td>
                          <Td right mono>
                            {peso(r.driverAmt)}
                            {r.driverWho && <div className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>{r.driverWho}</div>}
                          </Td>
                          <Td right mono>
                            {r.p1Who ? peso(r.p1Amt) : '—'}
                            {r.p1Who && <div className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>{r.p1Who}</div>}
                          </Td>
                          <Td right mono>
                            {r.p2Who ? peso(r.p2Amt) : '—'}
                            {r.p2Who && <div className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>{r.p2Who}</div>}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals are per person. The columns above rotate between
                    people, so their sums are not amounts anybody can be paid. */}
                <div className="px-6 pt-5">
                  <Eyebrow>Payable — per person</Eyebrow>
                  <table className="w-full mt-2">
                    <thead>
                      <tr><Th>Name</Th><Th>Role</Th><Th right>Daily</Th><Th right>Piece rate</Th><Th right>Palima</Th><Th right>Kaltas</Th><Th right>Net salary</Th></tr>
                    </thead>
                    <tbody>
                      {people.map((p, i) => (
                        <tr key={i}>
                          <Td><b>{p.name}</b></Td>
                          <Td><span style={{ color: T.soft }}>{p.role}</span></Td>
                          <Td right mono>{peso(p.dailyRate)}</Td>
                          <Td right mono>{peso(p.pieceRate)}</Td>
                          <Td right mono style={{ color: p.bonus ? T.green : T.soft }}>{p.bonus ? `+${peso(p.bonus)}` : '—'}</Td>
                          <Td right mono style={{ color: p.kaltas ? T.red : T.soft }}>{p.kaltas ? `-${peso(p.kaltas)}` : '—'}</Td>
                          <Td right mono><b style={{ color: T.brand }}>{peso(p.net)}</b></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-3 gap-6 px-6 py-6">
                  {people.map(p => p.name).map((n, i) => (
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
        <Modal open={logOpen} onClose={() => setLogOpen(false)} title={`Log Delivery — ${crew.id}`} width={560}>
          <DeliveryForm crews={CREWS} fixedCrewId={selected} rates={rates} onSubmit={logDelivery} />
        </Modal>

      <Modal open={!!voidTarget} onClose={() => setVoidTarget(null)} title="Void this delivery?" width={440}>
          {voidTarget && (
            <div>
              <div className="p-3 rounded mb-3" style={{ backgroundColor: T.bg }}>
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>
                  Trip #{voidTarget.seq} — {voidTarget.address}
                </div>
                <div className="text-xs mt-1" style={{ fontFamily: F_MONO, color: T.soft }}>
                  {voidTarget.item} · {voidTarget.qty} {voidTarget.unit} · {peso(voidTarget.d)} / {peso(voidTarget.h)}
                </div>
              </div>
              <div className="text-sm mb-3" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
                The entry stays on record with your name against it, and stops counting toward anyone's
                pay. Log the corrected delivery separately afterwards.
              </div>
              <Field label="Reason">
                <input value={voidReason} onChange={e => setVoidReason(e.target.value)}
                  placeholder="e.g. wrong quantity, wrong truck" className={inputCls} style={inputStyle} />
              </Field>
              <div className="flex gap-2 mt-4">
                <Btn onClick={submitVoid} icon={Check} disabled={voiding || voidReason.trim().length < 3}>
                  {voiding ? 'Voiding...' : 'Void delivery'}
                </Btn>
                <Btn variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Btn>
              </div>
            </div>
          )}
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
              <Btn size="sm" icon={Plus} variant="outline" onClick={() => setAddRateOpen(true)}>Add item</Btn>
              <Btn size="sm" icon={Save} onClick={saveRates}>Save</Btn>
              <Btn size="sm" variant="outline" onClick={() => { setRatesDraft(rates); setEditingRates(false); }}>Cancel</Btn>
            </div>
          ) : <Btn size="sm" variant="outline" icon={Edit2} onClick={() => { setRatesDraft(rates); setEditingRates(true); }}>Edit</Btn>}
        </div>
        <table className="w-full">
          <thead><tr><Th>Category</Th><Th>Unit</Th><Th right>Single — Drv</Th><Th right>Single — Hlp</Th><Th right>Double — Drv</Th><Th right>Double — Hlp</Th>{editingRates && <Th right>Retire</Th>}</tr></thead>
          <tbody>{(editingRates ? ratesDraft : rates).map((r, i) => (
            <tr key={i}>
              <Td>{editingRates ? <input value={r.cat} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, cat: e.target.value } : x))} className="px-2 py-1 rounded border text-xs w-full" style={{ borderColor: T.line, fontFamily: F_BODY }} /> : r.cat}</Td>
              <Td>{r.unit}</Td>
              {[0, 1].map(k => <Td right mono key={'s' + k}>{editingRates ? <input type="number" value={r.s[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, s: x.s.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.s[k])}</Td>)}
              {[0, 1].map(k => <Td right mono key={'d' + k}>{editingRates ? <input type="number" value={r.d[k]} onChange={e => setRatesDraft(p => p.map((x, j) => j === i ? { ...x, d: x.d.map((v, vi) => vi === k ? parseFloat(e.target.value) || 0 : v) } : x))} className="px-2 py-1 rounded border text-xs w-16 text-right" style={{ borderColor: T.line, fontFamily: F_MONO }} /> : peso(r.d[k])}</Td>)}
              {editingRates && (
                <Td right>
                  <button title="Retire this item" onClick={() => setConfirmRetire(r)}>
                    <Trash2 size={13} color={T.red} />
                  </button>
                </Td>
              )}
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
          // Same function as the payslip and the report, so a card can never
          // show a figure the payslip disagrees with.
          const cardCrew = log ? crewEarnings({ [c.id]: log }, {
            driverDaily: DRIVER_DAILY, helperDaily: HELPER_DAILY,
            bonusHead: BONUS_HEAD, bonusTrips: BONUS_TRIPS,
          }) : [];
          const cardTotal = cardCrew.reduce((sum, p) => sum + p.total, 0);
          const cardNames = cardCrew.map(p => p.name);
          const tripCount = log ? new Set(log.items.filter(i => !i.voided).map(i => i.seq).filter(Boolean)).size : 0;
          const bonusEligible = tripCount >= BONUS_TRIPS;
          return (
            <button key={c.id} onClick={() => setSelected(c.id)} className="text-left">
              <Panel className="p-4 h-full" style={{ borderLeftWidth: 3, borderLeftColor: log ? T.brand : T.line }}>
                <div className="flex items-center justify-between mb-2">
                  <Eyebrow>{c.id}</Eyebrow>
                  <span className="text-xs tabular-nums px-1.5 py-0.5 rounded" style={{ fontFamily: F_MONO, backgroundColor: T.lineSoft, color: T.soft }}>{c.plate}</span>
                </div>
                <div className="text-sm font-semibold mb-0.5" style={{ fontFamily: F_BODY, color: T.ink }}>
                  {cardNames.length ? cardNames.join(', ') : <span style={{ color: T.soft, fontWeight: 400 }}>No crew logged yet</span>}
                </div>
                <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>{c.vehicle}</div>
                {log ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-1.5">
                      <Badge tone="blue">{tripCount} trips</Badge>
                      {bonusEligible && <Badge tone="amber">Bonus</Badge>}
                    </div>
                    <span style={{ fontFamily: F_MONO, color: T.green }}>{peso(cardTotal)}</span>
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
                  <Td>{t.helpers?.length ? t.helpers.join(' & ') : '—'}</Td>
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

      <Modal open={addRateOpen} onClose={() => setAddRateOpen(false)} title="Add Rate Item" width={440}>
        <Field label="Item category">
          <input value={newRate.cat} onChange={e => setNewRate(f => ({ ...f, cat: e.target.value }))}
            placeholder="e.g. Paint, Plywood, Roofing" className={inputCls} style={inputStyle} />
        </Field>
        <div className="mt-3">
          <Field label="Unit">
            <input value={newRate.unit} onChange={e => setNewRate(f => ({ ...f, unit: e.target.value }))}
              placeholder="bag, piece, box, elf" className={inputCls} style={inputStyle} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Driver rate (₱)">
            <input type="number" step="0.01" value={newRate.driverRate}
              onChange={e => setNewRate(f => ({ ...f, driverRate: e.target.value }))}
              className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
          <Field label="Pahinante rate (₱)">
            <input type="number" step="0.01" value={newRate.helperRate}
              onChange={e => setNewRate(f => ({ ...f, helperRate: e.target.value }))}
              className={inputCls} style={{ ...inputStyle, fontFamily: F_MONO }} />
          </Field>
        </div>
        <div className="text-xs mt-2.5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
          Double-area rates are set to twice these amounts automatically. Adjust them in the table
          afterwards if this item works differently.
        </div>
        {rateError && (
          <div className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded text-xs"
            style={{ backgroundColor: T.brandBg, fontFamily: F_BODY, color: T.brandDark }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{rateError}</span>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <Btn onClick={addRateItem} icon={Check}>Add item</Btn>
          <Btn variant="outline" onClick={() => setAddRateOpen(false)}>Cancel</Btn>
        </div>
      </Modal>

      <Confirm open={!!confirmRetire} onCancel={() => setConfirmRetire(null)}
        onConfirm={() => { retireRateItem(confirmRetire); setConfirmRetire(null); }}
        title={`Retire "${confirmRetire?.cat}"?`}
        message="It will stop appearing when logging a delivery. Deliveries already logged keep the amounts they were recorded with, so past payslips are unaffected."
        confirmLabel="Retire item" />
    </div>
  );
};

/* ============================= STAFF PAYROLL (list + printable payslip) ============================= */
