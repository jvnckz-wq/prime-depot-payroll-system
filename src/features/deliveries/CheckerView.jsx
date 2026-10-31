'use client';
// Checker's screen: log today's deliveries.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { DeliveryForm } from '@/features/deliveries/DeliveryForm.jsx';
import { DeliveryTable, tripsFromLog } from '@/features/deliveries/DeliveryTable.jsx';
import { Avatar, BigStat, Confirm, Eyebrow, Panel } from '@/components/ui';
import { CREW_RATE_FALLBACK } from '@/lib/constants';
import { FONTS, F_HEAD, T } from '@/styles/theme';
/* eslint-disable @next/next/no-img-element -- user avatars are base64 data URIs; next/image adds no value and cannot optimize data URIs */

export const CheckerView = ({ currentUser, deliveries, reloadDeliveries, rates, crewRates = CREW_RATE_FALLBACK, onLogout, toast }) => {
  const [trucks, setTrucks] = useState([]);
  const [confirmLogout, setConfirmLogout] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/trucks')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => { if (!cancelled) setTrucks(data.trucks.filter(t => t.isActive)); })
      .catch(err => console.error('Could not load trucks:', err));
    return () => { cancelled = true; };
  }, []);

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

  const trips = useMemo(() => tripsFromLog(deliveries), [deliveries]);
  const loggedCount = trips.filter(t => !t.voided).length;
  const reviewCount = trips.filter(t => !t.voided && t.noScan.length > 0).length;
  const voidedCount = trips.filter(t => t.voided).length;
  const [tableFilter, setTableFilter] = useState('all');
  const tableRef = useRef(null);
  const showFilter = (f) => {
    setTableFilter(f);
    if (tableRef.current) tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const stats = [
    ['all', loggedCount, 'Deliveries Logged', T.ink],
    ['review', reviewCount, 'Needs Review', reviewCount ? T.warn : T.soft],
    ['voided', voidedCount, 'Voided Today', voidedCount ? T.red : T.soft],
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.bg }}>
      <style>{FONTS}</style>
      <Confirm
        open={confirmLogout}
        title="Sign out?"
        message="You will need to sign in again to log deliveries."
        confirmLabel="Sign out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); onLogout(); }}
      />
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-5 py-3" style={{ backgroundColor: T.sidebar }}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Prime Depot" className="w-8 h-8 rounded bg-white p-0.5 shrink-0" />
          <div>
            <div className="text-xs uppercase" style={{ fontFamily: F_HEAD, color: T.sidebarSoft, letterSpacing: '0.08em' }}>Prime Depot · Checker</div>
            <div className="text-sm font-bold text-white" style={{ fontFamily: F_HEAD }}>Delivery Dispatch: All Trucks</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUser?.avatar
            ? <img src={currentUser.avatar} alt="" className="rounded-full object-cover" style={{ width: 28, height: 28 }} />
            : <Avatar name={currentUser?.displayName || 'Checker'} size={28} tone={T.amber} />}
          <button type="button" onClick={() => setConfirmLogout(true)} aria-label="Sign out" className="-my-1 -mr-2 w-11 h-11 shrink-0 flex items-center justify-center rounded" style={{ color: T.sidebarSoft }}><LogOut size={15} /></button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3.5 sm:p-5">
        <Panel className="p-4 mb-4">
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-around sm:gap-3">
            {stats.map(([f, value, label, tone]) => (
              <button key={f} type="button" onClick={() => showFilter(f)} aria-pressed={tableFilter === f}
                className="pd-clickable rounded py-1.5" title={`Show ${label.toLowerCase()} in the table`}
                style={{ borderBottom: `2px solid ${tableFilter === f ? T.brand : 'transparent'}` }}>
                <BigStat value={value} label={label} tone={tone} />
              </button>
            ))}
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Panel className="p-4">
            <Eyebrow>New Delivery</Eyebrow>
            <div className="mb-3" />
            <DeliveryForm crews={trucks} rates={rates} onSubmit={logDelivery} />
          </Panel>

          <div ref={tableRef} style={{ scrollMarginTop: 12 }}>
            <DeliveryTable log={deliveries} trucks={trucks} bonusTrips={crewRates.bonusTrips} toast={toast}
              title="Delivery History" onChanged={reloadDeliveries} filter={tableFilter} onFilterChange={setTableFilter} />
          </div>
        </div>
      </div>
    </div>
  );
};