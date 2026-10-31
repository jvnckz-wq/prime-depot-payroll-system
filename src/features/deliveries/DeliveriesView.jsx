'use client';
// Deliveries screen: every trip logged for the day, with Log Delivery and a past-day picker.

import React, { useState, useEffect } from 'react';
import { DeliveryForm } from '@/features/deliveries/DeliveryForm.jsx';
import { DeliveryTable } from '@/features/deliveries/DeliveryTable.jsx';
import { DayBar } from '@/features/deliveries/DayBar.jsx';
import { useDeliveryDay } from '@/features/deliveries/useDeliveryDay';
import { Btn, H1, Modal } from '@/components/ui';
import { CREW_RATE_FALLBACK } from '@/lib/constants';
import { todayYmdManila } from '@/lib/loan-rules';

export const DeliveriesView = ({ deliveries, reloadDeliveries, rates, crewRates = CREW_RATE_FALLBACK, toast, onOpenDtr, deliveriesFilter = 'all' }) => {
  const [trucks, setTrucks] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/trucks')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => { if (!cancelled) setTrucks(data.trucks.filter(t => t.isActive)); })
      .catch(err => console.error('Could not load trucks:', err));
    return () => { cancelled = true; };
  }, []);
  const [logOpen, setLogOpen] = useState(false);

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
      setLogOpen(false);
      return true;
    } catch {
      toast('Could not reach the server.', 'error');
      return false;
    }
  };

  const { viewDate, histLoading, D, readOnly, loadHistory } = useDeliveryDay(deliveries, toast);
  const todayStr = todayYmdManila();

  return (
    <div className="p-4 sm:p-6">
      <H1
        action={readOnly ? null : <div className="flex items-center gap-2">
          <Btn onClick={() => setLogOpen(true)}>Log Delivery</Btn>
        </div>}>Deliveries</H1>

      <DayBar todayStr={todayStr} viewDate={viewDate} readOnly={readOnly} histLoading={histLoading} loadHistory={loadHistory} />

      <DeliveryTable key={`${viewDate || 'today'}|${deliveriesFilter}`} log={D} trucks={trucks} isAdmin bonusTrips={crewRates.bonusTrips} toast={toast}
        title="All Deliveries" initialFilter={deliveriesFilter} onOpenDtr={onOpenDtr} reviewDays={31}
        onChanged={() => (viewDate ? loadHistory(viewDate) : reloadDeliveries())} />

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="Log Delivery" width={560}>
        <DeliveryForm crews={trucks} rates={rates} onSubmit={logDelivery} />
      </Modal>
    </div>
  );
};
