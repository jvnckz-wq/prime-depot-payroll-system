'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MapPin, Phone, Star, AlertTriangle, Truck } from 'lucide-react';
import { Badge, Btn, EmptyState, Eyebrow, Field, Modal, Panel, Td, Th, inputCls, inputStyle } from '@/components/ui.jsx';
import { telHref, timeLabel } from '@/lib/utils';
import { deliveriesToLog } from '@/lib/payroll';
import { cutoffOf, todayYmdManila } from '@/lib/loan-rules';
import { F_BODY, F_HEAD, T } from '@/components/theme';

const longDate = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const daysBefore = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '');

export function tripsFromLog(log) {
  const byId = new Map();
  Object.entries(log || {}).forEach(([truckId, day]) => {
    (day.items || []).forEach((it) => {
      if (!it.deliveryId) return;
      let trip = byId.get(it.deliveryId);
      if (!trip) {
        trip = { id: it.deliveryId, truckId, date: it.date || day.date, items: [] };
        byId.set(it.deliveryId, trip);
      }
      if (it.seq) {
        Object.assign(trip, {
          seq: it.seq, driver: it.driver || '', helpers: it.helpers || [], crew: it.crew || [],
          noScan: it.noScan || [], noScanIds: it.noScanIds || [], customer: it.customer, address: it.address,
          landmark: it.landmark, contactNo: it.contactNo, dbl: it.dbl, voided: it.voided, voidedAt: it.voidedAt,
          voidedBy: it.voidedBy, voidReason: it.voidReason, loggedBy: it.loggedBy, loggedAt: it.loggedAt,
        });
      }
      trip.items.push({ item: it.item, unit: it.unit, qty: it.qty });
    });
  });
  return [...byId.values()]
    .filter((t) => t.seq)
    .sort((a, b) => (a.date === b.date ? String(b.loggedAt || '').localeCompare(String(a.loggedAt || '')) : (a.date < b.date ? 1 : -1)));
}

const FILTERS = [
  ['all', 'All'],
  ['review', 'Needs review'],
  ['voided', 'Voided'],
];

export const DeliveryTable = ({ log, trucks = [], isAdmin = false, bonusTrips = Infinity, toast, onChanged, onOpenDtr, initialFilter = 'all', title = 'Deliveries', reviewDays = 0 }) => {
  const [filter, setFilter] = useState(initialFilter);
  const [truckFilter, setTruckFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);

  const today = todayYmdManila();
  const [reviewLog, setReviewLog] = useState(null);
  const [reviewTick, setReviewTick] = useState(0);
  useEffect(() => {
    if (!reviewDays) return undefined;
    let cancelled = false;
    fetch(`/api/deliveries?from=${daysBefore(today, reviewDays - 1)}&to=${today}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => { if (!cancelled) setReviewLog(deliveriesToLog(d.deliveries)); })
      .catch((err) => console.error('Could not load trips to review:', err));
    return () => { cancelled = true; };
  }, [reviewDays, today, reviewTick, log]);

  const trips = useMemo(() => tripsFromLog(log), [log]);
  const reviewTrips = useMemo(() => (reviewLog ? tripsFromLog(reviewLog) : trips), [reviewLog, trips]);
  const byTruck = (t) => !truckFilter || t.truckId === truckFilter;
  const inTruck = trips.filter(byTruck);
  const needsReview = reviewTrips.filter((t) => byTruck(t) && !t.voided && t.noScan.length > 0);
  const voided = inTruck.filter((t) => t.voided);
  const shown = filter === 'review' ? needsReview : filter === 'voided' ? voided : inTruck;
  const open = trips.find((t) => t.id === openId) || reviewTrips.find((t) => t.id === openId) || null;
  const refresh = async () => { setReviewTick((n) => n + 1); if (onChanged) await onChanged(); };
  const canVoid = open && !open.voided && (isAdmin || open.date === today);

  const close = () => { setOpenId(null); setVoiding(false); setReason(''); setReasonErr(''); };

  const patch = async (body) => {
    const res = await fetch(`/api/deliveries/${open.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const submitVoid = async () => {
    const trimmed = reason.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 3) { setReasonErr('Give a short reason so the correction can be understood later.'); return; }
    setBusy(true);
    try {
      const { res, data } = await patch({ action: 'void', reason: trimmed });
      if (!res.ok) { setReasonErr(data.error || 'Could not void the delivery.'); return; }
      toast(data.warning || 'Delivery voided. It no longer counts toward pay.', data.warning ? 'error' : 'success');
      close();
      await refresh();
    } catch { setReasonErr('Could not reach the server.'); }
    finally { setBusy(false); }
  };

  const undoVoid = async () => {
    setBusy(true);
    try {
      const { res, data } = await patch({ action: 'unvoid' });
      if (!res.ok) { toast(data.error || 'Could not restore the delivery.', 'error'); return; }
      toast('Delivery restored. It counts toward pay again.');
      close();
      await refresh();
    } catch { toast('Could not reach the server.', 'error'); }
    finally { setBusy(false); }
  };

  const queuePull = async () => {
    const c = cutoffOf(open.date);
    setBusy(true);
    try {
      const res = await fetch('/api/attendance/pull-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: c.start, to: c.end }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Could not queue the pull.', 'error'); return; }
      toast(`Pull queued for ${longDate(c.start)} to ${longDate(c.end)}. The flag clears once the scans arrive.`);
    } catch { toast('Could not reach the server.', 'error'); }
    finally { setBusy(false); }
  };

  const chip = (key, label, count) => {
    const on = filter === key;
    return (
      <button key={key} onClick={() => setFilter(key)} className="pd-clickable text-xs font-semibold px-3 py-1 rounded-full"
        style={{ fontFamily: F_BODY, border: `1px solid ${on ? T.ink : T.line}`, backgroundColor: on ? T.ink : T.surface, color: on ? '#fff' : T.soft }}>
        {label}{count != null && count > 0 ? ` (${count})` : ''}
      </button>
    );
  };

  const emptyText = filter === 'review'
    ? ['Nothing to review', reviewDays ? `Every crew member on the last ${reviewDays} days of trips has a scan.` : 'Every crew member on these trips has a scan for the day.']
    : filter === 'voided'
      ? ['No voided trips', 'Voided trips stay here, crossed out, so the record is never lost.']
      : ['No deliveries logged yet', 'Deliveries appear here once they are logged.'];

  return (
    <Panel className="overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Eyebrow>{title} ({shown.length})</Eyebrow>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(([k, l]) => chip(k, l, k === 'review' ? needsReview.length : k === 'voided' ? voided.length : null))}
          {trucks.length > 1 && (
            <select value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)} aria-label="Filter by truck"
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: T.line, fontFamily: F_BODY, color: T.ink, backgroundColor: T.surface }}>
              <option value="">All trucks</option>
              {trucks.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
            </select>
          )}
        </div>
      </div>

      {shown.length === 0 ? <EmptyState icon={Truck} title={emptyText[0]} desc={emptyText[1]} /> : (
        <div className="overflow-x-auto pd-scroll-shadow">
          <table className="w-full">
            <thead><tr><Th>Date</Th><Th>Trip</Th><Th>Truck</Th><Th>Driver</Th><Th>Helpers</Th><Th>Customer</Th><Th>Address</Th><Th>Logged by</Th><Th action> </Th></tr></thead>
            <tbody>{shown.map((t) => {
              const strike = t.voided ? { textDecoration: 'line-through' } : undefined;
              return (
                <tr key={t.id} onClick={() => setOpenId(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(t.id); } }}
                  tabIndex={0} role="button" aria-label={`Open trip ${t.seq} on ${t.truckId}, ${t.date}`}
                  className="pd-clickable" style={{ cursor: 'pointer', opacity: t.voided ? 0.55 : 1 }}>
                  <Td mono><span style={strike}>{t.date}</span></Td>
                  <Td><span className="flex items-center gap-1" style={strike}>#{t.seq}{t.seq >= bonusTrips && !t.voided && <Star size={11} color={T.amber} fill={T.amber} />}</span></Td>
                  <Td mono><span style={strike}>{t.truckId}</span></Td>
                  <Td>
                    <span style={strike}>{t.driver || '--'}</span>
                    {!t.voided && t.noScan.length > 0 && <div className="mt-1"><Badge tone="amber">No scan: {t.noScan.length}</Badge></div>}
                  </Td>
                  <Td><span style={strike}>{t.helpers.length ? t.helpers.join(' & ') : '--'}</span></Td>
                  <Td><span style={strike}>{t.customer || '--'}</span></Td>
                  <Td>
                    <div style={strike}>{t.address}</div>
                    {t.voided && <div className="mt-1"><Badge tone="red">Voided</Badge></div>}
                    {!t.voided && t.contactNo && <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: T.brand }}><Phone size={11} className="shrink-0" />{t.contactNo}</div>}
                  </Td>
                  <Td>{t.loggedBy ? <span className="text-xs" style={{ color: T.ink }}>{t.loggedBy}{t.loggedAt && <span style={{ color: T.soft }}> · {timeLabel(t.loggedAt)}</span>}</span> : <span style={{ color: T.soft }}>--</span>}</Td>
                  <Td action><ChevronRight size={16} color={T.soft} /></Td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <Modal open={!!open} onClose={close} title={open ? `${open.truckId} · Trip #${open.seq}` : ''} width={560}>
        {open && (
          <div style={{ fontFamily: F_BODY }}>
            <div className="text-xs mb-3" style={{ color: T.soft }}>
              {longDate(open.date)}{open.loggedBy ? ` · logged by ${open.loggedBy}` : ''}{open.loggedAt ? ` at ${timeLabel(open.loggedAt)}` : ''}
            </div>

            {open.voided && (
              <div className="p-3 rounded mb-3 text-sm" style={{ backgroundColor: T.redBg, color: T.ink, lineHeight: 1.6 }}>
                <div className="font-semibold" style={{ color: T.red }}>Voided{open.voidedBy ? ` by ${open.voidedBy}` : ''}{open.voidedAt ? ` on ${stamp(open.voidedAt)}` : ''}</div>
                {open.voidReason && <div>Reason: {open.voidReason}</div>}
                <div className="text-xs mt-1" style={{ color: T.soft }}>This trip does not count toward pay.</div>
              </div>
            )}

            {!open.voided && open.noScan.length > 0 && (
              <div className="p-3 rounded mb-3 text-sm flex items-start gap-2" style={{ backgroundColor: T.warnBg, color: T.ink, lineHeight: 1.6 }}>
                <AlertTriangle size={15} color={T.warn} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">{open.noScan.length === 1 ? '1 crew member has' : `${open.noScan.length} crew members have`} no scan on this day.</span>{' '}
                  {isAdmin
                    ? 'If the scanner was offline, pull attendance. If they worked but forgot to scan, fix their DTR. If they were not on this trip, void it.'
                    : 'The Operations Head will review it. If the wrong person was picked, void this trip and log it again.'}
                </span>
              </div>
            )}

            <Section label="Crew">
              {open.crew.map((c) => {
                const missing = !open.voided && open.noScanIds.includes(c.id);
                return (
                  <Line key={c.role} left={<>{c.name}<span style={{ color: T.soft }}> · {c.role}</span></>}
                    right={<span className="flex items-center gap-3">
                      {missing && <Badge tone="amber">No scan</Badge>}
                      {missing && isAdmin && onOpenDtr && (
                        <button className="pd-clickable text-xs font-semibold" style={{ color: T.brand }} onClick={() => { close(); onOpenDtr(c.id, open.date); }}>Open DTR</button>
                      )}
                    </span>} />
                );
              })}
            </Section>

            <Section label="Items">
              {open.items.map((it, i) => (
                <Line key={i} left={it.unit ? `${it.item} · per ${it.unit}` : it.item} right={<span className="pd-num">{it.qty}</span>} />
              ))}
              <div className="text-xs mt-1.5" style={{ color: open.dbl ? T.brand : T.soft }}>{open.dbl ? 'Double rate' : 'Normal rate'}</div>
            </Section>

            <Section label="Customer">
              <div className="text-sm" style={{ color: T.ink, lineHeight: 1.7 }}>
                <div>{open.customer || '--'}</div>
                {open.contactNo && <a href={telHref(open.contactNo)} className="flex items-center gap-1" style={{ color: T.brand }}><Phone size={12} />{open.contactNo}</a>}
                <div>{open.address}</div>
                {open.landmark && <div className="flex items-center gap-1 text-xs" style={{ color: T.soft }}><MapPin size={11} />{open.landmark}</div>}
              </div>
            </Section>

            {voiding ? (
              <div className="mt-4">
                <Field label="Why is this trip being voided?" error={reasonErr}>
                  <input autoFocus value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitVoid(); }}
                    placeholder="e.g. Wrong helper picked, logged again as trip #3" className={inputCls} style={inputStyle} />
                </Field>
                <div className="flex justify-end gap-2 mt-3">
                  <Btn variant="outline" onClick={() => { setVoiding(false); setReason(''); setReasonErr(''); }} disabled={busy}>Cancel</Btn>
                  <Btn variant="amber" onClick={submitVoid} disabled={busy}>{busy ? 'Voiding...' : 'Void delivery'}</Btn>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 mt-5 flex-wrap">
                {isAdmin && !open.voided && open.noScan.length > 0 && <Btn variant="outline" onClick={queuePull} disabled={busy}>Pull attendance</Btn>}
                {isAdmin && open.voided && <Btn variant="outline" onClick={undoVoid} disabled={busy}>Undo void</Btn>}
                {canVoid && <Btn variant="amber" onClick={() => setVoiding(true)} disabled={busy}>Void delivery</Btn>}
                {!open.voided && !canVoid && (
                  <div className="text-xs" style={{ color: T.soft }}>Only today&apos;s trips can be voided here. Ask the Operations Head to correct an earlier trip.</div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </Panel>
  );
};

const Section = ({ label, children }) => (
  <div className="mt-3">
    <div className="text-xs uppercase mb-1" style={{ fontFamily: F_HEAD, color: T.soft, letterSpacing: '0.06em' }}>{label}</div>
    {children}
  </div>
);

const Line = ({ left, right }) => (
  <div className="flex items-center justify-between gap-3 text-sm py-1.5" style={{ color: T.ink, borderBottom: `1px solid ${T.lineSoft}` }}>
    <span className="min-w-0">{left}</span>
    <span className="shrink-0">{right}</span>
  </div>
);
