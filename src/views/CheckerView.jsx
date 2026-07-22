'use client';

import React, { useState, useMemo } from 'react';
import { Truck, LogOut, ShieldCheck, Save, Star } from 'lucide-react';
import { DeliveryForm } from '../components/DeliveryForm.jsx';
import { Av, Badge, BigStat, Btn, EmptyState, Eyebrow, Field, Panel, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { BONUS_TRIPS, CREWS } from '../data/seed';
import { flattenDeliveries } from '../lib/payroll';
import { peso } from '../lib/utils';
import { FONTS, F_BODY, F_HEAD, T } from '../theme';

export const CheckerView = ({ deliveries, setDeliveries, rates, onLogout, toast }) => {
  const [page, setPage] = useState('log');

  const logDelivery = (cId, address, customer, items, helpers) => {
    setDeliveries(prev => {
      const existing = prev[cId] || { date: 'Jul 16, 2026', items: [], kaltas: [] };
      const nums = existing.items.map(i => i.seq).filter(Boolean);
      const nextSeq = nums.length ? Math.max(...nums) + 1 : 1;
      const crewDef = (CREWS.find(c => c.id === cId)?.helpers || []).filter(h => h !== '—');
      const usedHelpers = helpers !== undefined ? helpers : crewDef; // [] means the checker explicitly recorded no helper that trip
      const isSwap = JSON.stringify(usedHelpers) !== JSON.stringify(crewDef);
      const newItems = items.map((r, i) => ({ seq: i === 0 ? nextSeq : null, address: i === 0 ? address : '', customer: i === 0 ? customer : '', item: r.item, qty: r.qty, unit: r.unit, d: r.d, h: r.h, dbl: r.dbl, helpers: i === 0 ? usedHelpers : undefined, swap: i === 0 ? isSwap : undefined }));
      return { ...prev, [cId]: { ...existing, items: [...existing.items, ...newItems] } };
    });
    const crew = CREWS.find(c => c.id === cId);
    toast(`Delivery logged for ${crew.driver}'s truck (${cId}).`);
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries), [deliveries]);
  const trucksActive = new Set(allTrips.map(t => t.crewId)).size;
  const bonusTrucks = CREWS.filter(c => {
    const log = deliveries[c.id];
    const tc = log ? new Set(log.items.map(i => i.seq).filter(Boolean)).size : 0;
    return tc >= BONUS_TRIPS;
  }).length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg }}>
      <style>{FONTS}</style>
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-5 py-3" style={{ backgroundColor: T.sidebar }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-white text-xs shrink-0" style={{ backgroundColor: T.amber, fontFamily: F_HEAD }}>PD</div>
          <div>
            <div className="text-xs uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.08em' }}>Prime Depot — Checker</div>
            <div className="text-sm font-bold text-white" style={{ fontFamily: F_HEAD }}>Delivery Dispatch — All Trucks</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[['log', 'Delivery Log'], ['account', 'Account']].map(([k, l]) => (
            <button key={k} onClick={() => setPage(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: page === k ? 'rgba(255,255,255,0.1)' : 'transparent', color: page === k ? '#fff' : T.sidebarSoft }}>{l}</button>
          ))}
          <Av name="Checker" size={28} tone={T.amber} />
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}><LogOut size={15} /></button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3.5 sm:p-5">
        {page === 'log' && (
          <>
            <div className="mb-4 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.blueBg }}>
              <ShieldCheck size={16} color={T.blue} className="mt-0.5 shrink-0" />
              <div className="text-xs" style={{ fontFamily: F_BODY, color: T.ink }}>You can log a delivery for any truck, and swap in a substitute pahinante for the day if a regular helper is out. Salaries, personal details, and other admin pages are not visible from here.</div>
            </div>

            <Panel className="p-4 mb-4">
              <div className="flex flex-wrap justify-around gap-3">
                <BigStat value={allTrips.length} label="Deliveries Logged" />
                <BigStat value={trucksActive} label="Trucks Active" tone={T.blue} />
                <BigStat value={bonusTrucks} label="Trucks at Bonus" tone={T.amber} />
              </div>
            </Panel>

            <Panel className="p-4 mb-4">
              <Eyebrow>New Delivery</Eyebrow>
              <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Pick the truck this delivery is for — you can log for any crew, and swap a helper if needed.</div>
              <DeliveryForm crews={CREWS} rates={rates} onSubmit={logDelivery} />
            </Panel>

            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>Delivery History ({allTrips.length})</Eyebrow>
              </div>
              {allTrips.length === 0 ? (
                <EmptyState icon={Truck} title="No entries yet" desc="Log the first delivery above for any truck." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><Th>Date</Th><Th>Truck</Th><Th>Driver</Th><Th>Pahinante</Th><Th>Address</Th><Th right>Driver Earn</Th><Th>Trip</Th></tr></thead>
                    <tbody>{allTrips.slice().reverse().map((t, i) => {
                      const crew = CREWS.find(c => c.id === t.crewId);
                      const isBonusTrip = t.seq >= BONUS_TRIPS;
                      return (
                        <tr key={i} style={{ backgroundColor: isBonusTrip ? '#FBF0DE' : 'transparent' }}>
                          <Td mono>{t.date}</Td>
                          <Td mono>{t.crewId}</Td>
                          <Td>{crew?.driver || '—'}</Td>
                          <Td>{t.helpers?.length ? <span className="flex items-center gap-1.5">{t.helpers.join(' & ')}{t.swap && <Badge tone="amber">SUB</Badge>}</span> : '—'}</Td>
                          <Td>{t.address}</Td>
                          <Td right mono>{peso(t.d)}</Td>
                          <Td>
                            {t.seq && (
                              <span className="flex items-center gap-1">
                                #{t.seq}{isBonusTrip && <Star size={11} color={T.amber} fill={T.amber} />}
                              </span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
        {page === 'account' && (
          <Panel className="p-5 max-w-md">
            <Eyebrow>Profile</Eyebrow>
            <div className="text-sm mb-4" style={{ fontFamily: F_BODY, color: T.soft }}>Checker account — general dispatch access (all trucks).</div>
            <div className="space-y-3">
              <Field label="Username"><input defaultValue="checker01" className={inputCls} style={inputStyle} readOnly /></Field>
              <Field label="New password"><input type="password" placeholder="Leave blank to keep current" className={inputCls} style={inputStyle} /></Field>
            </div>
            <div className="mt-4"><Btn icon={Save} onClick={() => toast('Account settings saved.')} full>Save changes</Btn></div>
          </Panel>
        )}
      </div>
    </div>
  );
};


/* ============================= APP ============================= */
