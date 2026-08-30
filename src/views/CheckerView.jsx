'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Truck, LogOut, Star, MapPin, Phone } from 'lucide-react';
import { DeliveryForm } from '../components/DeliveryForm.jsx';
import { Av, Badge, BigStat, EmptyState, Eyebrow, Panel, Td, Th } from '../components/ui.jsx';
import { CREW_RATE_FALLBACK } from '../data/seed';
import { flattenDeliveries } from '../lib/payroll';
import { peso, telHref, timeLabel } from '../lib/utils';
import { FONTS, F_BODY, F_HEAD, T } from '../theme';
/* eslint-disable @next/next/no-img-element -- user avatars are base64 data URIs; next/image adds no value and cannot optimize data URIs */

export const CheckerView = ({ currentUser, deliveries, reloadDeliveries, rates, crewRates = CREW_RATE_FALLBACK, onLogout, toast }) => {
  // The delivery form needs the fleet list to pick which truck a delivery is
  // for. Crew (driver/pahinante) are chosen inside the form from /api/crew, per
  // delivery — nothing here ties a person to a truck.
  const [trucks, setTrucks] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/trucks')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => { if (!cancelled) setTrucks(data.trucks.filter(t => t.isActive)); })
      .catch(err => console.error('Could not load trucks:', err));
    return () => { cancelled = true; };
  }, []);

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
      if (!res.ok) { toast(data.error || 'Could not save the delivery.', 'error'); return false; }
      await reloadDeliveries();
      toast(`Delivery logged for ${payload.truckId}.`);
      return true;
    } catch {
      toast('Could not reach the server.', 'error');
      return false;
    }
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries), [deliveries]);
  const trucksActive = new Set(allTrips.map(t => t.crewId)).size;
  const bonusTrucks = Object.values(deliveries).filter(log => {
    const tc = new Set((log.items || []).map(i => i.seq).filter(Boolean)).size;
    return tc >= crewRates.bonusTrips;
  }).length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg }}>
      <style>{FONTS}</style>
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-5 py-3" style={{ backgroundColor: T.sidebar }}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Prime Depot" className="w-8 h-8 rounded bg-white p-0.5 shrink-0" />
          <div>
            <div className="text-xs uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.08em' }}>Prime Depot — Checker</div>
            <div className="text-sm font-bold text-white" style={{ fontFamily: F_HEAD }}>Delivery Dispatch — All Trucks</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUser?.avatar
            ? <img src={currentUser.avatar} alt="" className="rounded-full object-cover" style={{ width: 28, height: 28 }} />
            : <Av name={currentUser?.displayName || 'Checker'} size={28} tone={T.amber} />}
          <button onClick={onLogout} className="flex items-center gap-1.5 text-sm" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}><LogOut size={15} /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3.5 sm:p-5">
        <Panel className="p-4 mb-4">
          <div className="flex flex-wrap justify-around gap-3">
            <BigStat value={allTrips.length} label="Deliveries Logged" />
            <BigStat value={trucksActive} label="Trucks Active" tone={T.blue} />
            <BigStat value={bonusTrucks} label="Trucks at Bonus" tone={T.amber} />
          </div>
        </Panel>

        {/* Two columns on wide screens: log a delivery on the left, review the
            day's logged deliveries on the right. Stacks on phones. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Panel className="p-4">
            <Eyebrow>New Delivery</Eyebrow>
            <div className="mb-3" />
            <DeliveryForm crews={trucks} rates={rates} onSubmit={logDelivery} />
          </Panel>

          <Panel className="overflow-hidden">
            <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Eyebrow>Delivery History ({allTrips.length})</Eyebrow>
            </div>
            {allTrips.length === 0 ? (
              <EmptyState icon={Truck} title="No entries yet" desc="Log the first delivery on the left for any truck." />
            ) : (
              <div className="overflow-x-auto pd-scroll-shadow">
                <table className="w-full">
                  <thead><tr><Th>Date</Th><Th>Truck</Th><Th>Driver</Th><Th>Pahinante</Th><Th>Address</Th><Th right>Driver Earn</Th><Th>Logged by</Th><Th>Trip</Th></tr></thead>
                  <tbody>{allTrips.slice().reverse().map((t, i) => {
                    const isBonusTrip = t.seq >= crewRates.bonusTrips;
                    return (
                      <tr key={i} style={{ backgroundColor: isBonusTrip ? '#FBF0DE' : 'transparent' }}>
                        <Td mono>{t.date}</Td>
                        <Td mono>{t.crewId}</Td>
                        <Td>{t.driver || '—'}</Td>
                        <Td>{t.helpers?.length ? <span className="flex items-center gap-1.5">{t.helpers.join(' & ')}{t.swap && <Badge tone="amber">SUB</Badge>}</span> : '—'}</Td>
                        <Td>
                          <div>{t.address}</div>
                          {t.landmark && <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: T.soft }}><MapPin size={11} className="shrink-0" />{t.landmark}</div>}
                          {t.contactNo && <a href={telHref(t.contactNo)} className="flex items-center gap-1 text-xs mt-0.5" style={{ color: T.brand }}><Phone size={11} className="shrink-0" />{t.contactNo}</a>}
                        </Td>
                        <Td right mono>{peso(t.d)}</Td>
                        <Td>
                          {t.loggedBy ? (
                            <span className="text-xs" style={{ color: T.ink }}>
                              {t.loggedBy}
                              {t.loggedAt && <span style={{ color: T.soft }}> · {timeLabel(t.loggedAt)}</span>}
                            </span>
                          ) : <span style={{ color: T.soft }}>—</span>}
                        </Td>
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
        </div>
      </div>
    </div>
  );
};


/* ============================= APP ============================= */
