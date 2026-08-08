'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Truck, LogOut, ShieldCheck, Save, Star } from 'lucide-react';
import { DeliveryForm } from '../components/DeliveryForm.jsx';
import { Av, Badge, BigStat, Btn, EmptyState, Eyebrow, Field, Panel, Skeleton, Td, Th, inputCls, inputStyle } from '../components/ui.jsx';
import { BONUS_HEAD, BONUS_TRIPS, DRIVER_DAILY, HELPER_DAILY } from '../data/seed';
import { crewEarnings, deliveriesToLog, flattenDeliveries } from '../lib/payroll';
import { peso } from '../lib/utils';
import { FONTS, F_BODY, F_HEAD, T } from '../theme';
/* eslint-disable @next/next/no-img-element -- user avatars are base64 data URIs; next/image adds no value and cannot optimize data URIs */

export const CheckerView = ({ currentUser, onUserChange, onSignedOut, deliveries, setDeliveries, reloadDeliveries, rates, onLogout, toast }) => {
  const [page, setPage] = useState('log');
  const todayStr = new Date().toISOString().slice(0, 10);
  const [histDate, setHistDate] = useState(todayStr);
  const [histLog, setHistLog] = useState({});
  const [histLoading, setHistLoading] = useState(false);

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
      if (!res.ok) { toast(data.error || 'Could not save the delivery.', 'error'); return; }
      await reloadDeliveries();
      toast(`Delivery logged for ${payload.truckId}.`);
    } catch {
      toast('Could not reach the server.', 'error');
    }
  };

  const allTrips = useMemo(() => flattenDeliveries(deliveries), [deliveries]);

  // Read-only look-back at any past day's crew earnings — the SAME crewEarnings
  // used on the admin's Truck Payroll. Fetches by date only, so every delivery
  // logged by any checker or the admin is included and visible to all of them.
  const loadHist = async (date) => {
    setHistDate(date);
    setHistLoading(true);
    try {
      const res = await fetch(`/api/deliveries?from=${date}&to=${date}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setHistLog(deliveriesToLog(data.deliveries));
    } catch (err) {
      console.error('Could not load history:', err);
      toast('Could not load that day.', 'error');
    } finally {
      setHistLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
  useEffect(() => { if (page === 'history') loadHist(histDate); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const histPeople = useMemo(() => crewEarnings(histLog, {
    driverDaily: DRIVER_DAILY, helperDaily: HELPER_DAILY, bonusHead: BONUS_HEAD, bonusTrips: BONUS_TRIPS,
  }), [histLog]);
  const trucksActive = new Set(allTrips.map(t => t.crewId)).size;
  const bonusTrucks = Object.values(deliveries).filter(log => {
    const tc = new Set((log.items || []).map(i => i.seq).filter(Boolean)).size;
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
          {[['log', 'Delivery Log'], ['history', 'Crew Earnings']].map(([k, l]) => (
            <button key={k} onClick={() => setPage(k)} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: page === k ? 'rgba(255,255,255,0.1)' : 'transparent', color: page === k ? '#fff' : T.sidebarSoft }}>{l}</button>
          ))}
          {currentUser?.avatar
            ? <img src={currentUser.avatar} alt="" className="rounded-full object-cover" style={{ width: 28, height: 28 }} />
            : <Av name={currentUser?.displayName || 'Checker'} size={28} tone={T.amber} />}
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
              <DeliveryForm crews={trucks} rates={rates} onSubmit={logDelivery} />
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
                      const isBonusTrip = t.seq >= BONUS_TRIPS;
                      return (
                        <tr key={i} style={{ backgroundColor: isBonusTrip ? '#FBF0DE' : 'transparent' }}>
                          <Td mono>{t.date}</Td>
                          <Td mono>{t.crewId}</Td>
                          <Td>{t.driver || '—'}</Td>
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
        {page === 'history' && (
          <>
            <div className="mb-4 flex items-center flex-wrap gap-2">
              <span className="text-xs" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.04em' }}>VIEWING</span>
              <Badge tone={histDate === todayStr ? 'green' : 'amber'}>{histDate === todayStr ? `Today · ${todayStr}` : `History · ${histDate}`}</Badge>
              <input type="date" max={todayStr} value={histDate} onChange={e => loadHist(e.target.value)}
                className="px-3 py-2 rounded border text-sm" style={{ borderColor: T.line, fontFamily: F_BODY, minWidth: 168, colorScheme: 'light', color: T.ink, backgroundColor: T.surface }} />
              {histLoading && <Skeleton w={72} h={11} />}
              <span className="text-xs w-full sm:w-auto" style={{ fontFamily: F_BODY, color: T.soft }}>Read-only · shared across all checkers and admin.</span>
            </div>

            <Panel className="overflow-hidden">
              <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>Crew Earnings · {histDate}</Eyebrow>
              </div>
              {histPeople.length === 0 ? (
                <EmptyState icon={Truck} title="No deliveries" desc="No deliveries were logged on this day." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr><Th>Name</Th><Th>Role</Th><Th center>Trips</Th><Th right>Piece Rate</Th><Th right>Daily</Th><Th right>Bonus</Th><Th right>Total</Th></tr></thead>
                    <tbody>
                      {histPeople.map((p, i) => (
                        <tr key={i}>
                          <Td><div className="flex items-center gap-2.5"><Av name={p.name} size={26} tone={p.role === 'Driver' ? T.blue : T.amber} /><span className="font-semibold text-sm" style={{ fontFamily: F_BODY }}>{p.name}</span></div></Td>
                          <Td><Badge tone={p.role === 'Driver' ? 'blue' : 'amber'}>{p.role}</Badge></Td>
                          <Td center mono>{p.trips}</Td>
                          <Td right mono>{peso(p.pieceRate)}</Td>
                          <Td right mono>{peso(p.dailyRate)}</Td>
                          <Td right mono>{p.bonus > 0 ? peso(p.bonus) : '—'}</Td>
                          <Td right mono style={{ fontWeight: 700 }}>{peso(p.total)}</Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ position: 'sticky', bottom: 0, backgroundColor: T.surface }}>
                      <tr><Td colSpan={6}><b>Total payout</b></Td><Td right mono><b>{peso(histPeople.reduce((s, p) => s + p.total, 0))}</b></Td></tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
};


/* ============================= APP ============================= */
