// Day picker state for Deliveries and Crew Payroll: today's trips, or a past day loaded read-only.
import { useState } from 'react';
import { deliveriesToLog } from '@/lib/payroll';

export function useDeliveryDay(deliveries, toast) {
  const [viewDate, setViewDate] = useState(null);
  const [histDeliveries, setHistDeliveries] = useState({});
  const [histLoading, setHistLoading] = useState(false);

  const D = viewDate ? histDeliveries : deliveries;
  const readOnly = !!viewDate;
  const loadHistory = async (date) => {
    if (!date) { setViewDate(null); setHistDeliveries({}); return; }
    setHistLoading(true);
    try {
      const res = await fetch(`/api/deliveries?from=${date}&to=${date}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setHistDeliveries(deliveriesToLog(data.deliveries));
      setViewDate(date);
    } catch {
      toast('Could not load that day.', 'error');
    } finally {
      setHistLoading(false);
    }
  };

  return { viewDate, histLoading, D, readOnly, loadHistory };
}
