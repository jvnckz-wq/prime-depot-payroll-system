'use client';

import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Users, Truck, Wallet, FileText, AlertTriangle, TrendingUp, Check } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Av, Eyebrow, H1, Panel, StatCard, Td, Th } from '../components/ui.jsx';
import { computeStaffPayroll, flattenDeliveries, loanBalance } from '../lib/payroll';
import { peso } from '../lib/utils';
import { F_BODY, T } from '../theme';

// Measure before paint on the client; fall back to useEffect on the server (no SSR warning).
const useIsoLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

export const DashboardView = ({ deliveries, staff = [], totalEmployees = 0, loans = [], statutory, setTab, cutoffLabel = '', attendanceSummaries = [], unmappedCount = 0 }) => {
  const loggedToday = Object.keys(deliveries).length;
  const deliveriesLogged = useMemo(() => flattenDeliveries(deliveries).length, [deliveries]);

  // Keep the payroll snapshot exactly as tall as the charts column on desktop so the two
  // panels align and no space is wasted; the table scrolls internally past that height.
  const chartsColRef = useRef(null);
  const [snapshotHeight, setSnapshotHeight] = useState(undefined);
  useIsoLayoutEffect(() => {
    const el = chartsColRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setSnapshotHeight(mq.matches ? el.offsetHeight : undefined);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    mq.addEventListener('change', sync);
    return () => { ro.disconnect(); mq.removeEventListener('change', sync); };
  }, []);

  // Index the imported attendance so the dashboard uses the SAME real days the
  // Staff Payroll page does — otherwise the headline net would be an estimate
  // and wouldn't match the payslips.
  const attById = useMemo(() => {
    const m = {};
    for (const s of attendanceSummaries) m[s.id] = s;
    return m;
  }, [attendanceSummaries]);
  const cutoffKey = `staff-${cutoffLabel}`;

  // Net pay this cutoff — sum of every staff payslip's net, using the same shared math the
  // Staff Payroll page uses (same attendance AND same cutoff key), so the headline number
  // always agrees with the payslips down to the loan deductions.
  const netThisCutoff = useMemo(
    () => staff.reduce((s, e) => s + computeStaffPayroll(e, loans, statutory, attById[e.id], cutoffKey).net, 0),
    [staff, loans, statutory, attById, cutoffKey]
  );
  // Active loans & advances — total outstanding balance across every unpaid ledger.
  const activeLoans = useMemo(() => loans.reduce((s, l) => s + Math.max(0, loanBalance(l)), 0), [loans]);
  const activeLoanCount = loans.filter(l => loanBalance(l) > 0).length;

  // Present / Late / Absent per recent cutoff, so imports can be compared
  // side by side. Fetched on mount (the dashboard remounts on tab switch, so a
  // new import shows up once you return here). Falls back to the current cutoff
  // if the trend hasn't loaded yet.
  const [attTrend, setAttTrend] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/attendance?trend=1')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => { if (!cancelled) setAttTrend(d.trend || []); })
      .catch(err => console.error('Could not load attendance trend:', err));
    return () => { cancelled = true; };
  }, []);
  const attendanceData = useMemo(() => {
    if (attTrend.length) {
      return attTrend.map(t => ({ label: t.label, Present: t.present || 0, Late: t.late || 0, Absent: t.absent || 0 }));
    }
    let present = 0, late = 0, absent = 0;
    for (const s of attendanceSummaries) {
      present += s.present || 0;
      late += s.daysLate || 0;
      absent += s.absent || 0;
    }
    return [{ label: cutoffLabel || 'This cutoff', Present: present, Late: late, Absent: absent }];
  }, [attTrend, attendanceSummaries, cutoffLabel]);

  // Payslip snapshot — first rows of the current staff payroll, matching the mockup table.
  const snapshot = useMemo(
    () => staff.map(e => { const c = computeStaffPayroll(e, loans, statutory, attById[e.id], cutoffKey); return { name: e.name, gross: c.gross, net: c.net }; }),
    [staff, loans, statutory, attById, cutoffKey]
  );

  // Real payroll trend: net released per released cut-off, oldest → newest.
  // Replaces the old seed series, so the chart only shows what's actually been paid.
  const [releases, setReleases] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/payroll/history')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => { if (!cancelled) setReleases(d.periods || []); })
      .catch(err => console.error('Could not load payroll trend:', err));
    return () => { cancelled = true; };
  }, []);
  const trendData = useMemo(
    () => releases.slice(0, 6).reverse().map(p => ({ mo: (p.label || '').replace(/,\s*\d{4}$/, ''), payroll: p.totalNet })),
    [releases]
  );

  const go = (t) => setTab && setTab(t);

  return (
    <div className="p-4 sm:p-6">
      <H1 sub="Snapshot of headcount, this cutoff's payroll, deliveries, and outstanding advances.">Dashboard Overview</H1>

      {/* Top row: 4 stat cards + Attention Needed, mirroring the approved layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 grid grid-cols-2 gap-4 pd-stagger">
          <StatCard label="Total Employees" value={totalEmployees} icon={Users} onClick={() => go('employees')} />
          <StatCard label="Net Pay This Cutoff" value={peso(netThisCutoff)} tone="amber" icon={Wallet} onClick={() => go('payroll')} />
          <StatCard label="Deliveries Logged" value={deliveriesLogged} tone="green" icon={Truck} onClick={() => go('deliveries')} />
          <StatCard label="Active Loans & Advances" value={peso(activeLoans)} tone="amber" icon={FileText} onClick={() => go('loans')} />
        </div>
        <Panel className="p-4">
          <Eyebrow>Attention Needed</Eyebrow>
          {unmappedCount > 0 && (
            <button onClick={() => go('attendance')} className="pd-clickable w-full text-left mt-2 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.warnBg }}>
              <AlertTriangle size={16} color={T.warn} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{unmappedCount} biometric ID{unmappedCount > 1 ? 's are' : ' is'} unmapped</div>
                <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>Scans aren&apos;t linked to a registered employee yet — resolve them so their attendance counts.</div>
              </div>
            </button>
          )}
          {activeLoanCount > 0 && (
            <button onClick={() => go('loans')} className="pd-clickable w-full text-left mt-3 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.brandBg }}>
              <FileText size={16} color={T.brand} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>{activeLoanCount} loan{activeLoanCount > 1 ? 's' : ''} awaiting cutoff deduction</div>
                <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>Review balances before releasing this cutoff&apos;s payroll.</div>
              </div>
            </button>
          )}
          {unmappedCount === 0 && activeLoanCount === 0 && (
            <div className="mt-2 flex items-start gap-3 p-3 rounded" style={{ backgroundColor: T.greenBg }}>
              <Check size={16} color={T.green} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: F_BODY, color: T.ink }}>All clear</div>
                <div className="text-xs mt-0.5" style={{ fontFamily: F_BODY, color: T.soft }}>Nothing needs attention this cutoff.</div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Payroll snapshot table + two charts */}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel className="overflow-hidden lg:flex lg:flex-col" style={{ height: snapshotHeight }}>
          <div className="px-4 pt-4 pb-2 shrink-0"><Eyebrow>{cutoffLabel} · Payroll Snapshot</Eyebrow></div>
          <div className="overflow-auto lg:flex-1 lg:min-h-0 pd-no-scrollbar">
            <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
              <thead style={{ position: 'sticky', top: 0, backgroundColor: T.surface }}>
                <tr><Th>Employee</Th><Th right>Gross</Th><Th right>Net Pay</Th></tr>
              </thead>
              <tbody>
                {snapshot.map((r, i) => (
                  <tr key={i}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Av name={r.name} size={26} tone={T.brand} />
                        <span className="font-semibold text-sm" style={{ fontFamily: F_BODY }}>{r.name}</span>
                      </div>
                    </Td>
                    <Td right mono>{peso(r.gross)}</Td>
                    <Td right mono style={{ color: r.net < 0 ? T.red : T.ink, fontWeight: 600 }}>{peso(r.net)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, backgroundColor: T.surface }}>
                <tr>
                  <Td><b>Totals</b></Td>
                  <Td right mono><b>{peso(snapshot.reduce((s, r) => s + r.gross, 0))}</b></Td>
                  <Td right mono><b>{peso(snapshot.reduce((s, r) => s + r.net, 0))}</b></Td>
                </tr>
              </tfoot>
            </table></div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4" ref={chartsColRef}>
          <Panel className="p-4">
            <Eyebrow>Attendance</Eyebrow>
            <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Present / Late / Absent · recent cutoffs</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={attendanceData} margin={{ left: -20, right: 5, top: 5, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.soft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: T.soft }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: F_BODY }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: F_BODY }} iconType="circle" iconSize={8} />
                <Bar dataKey="Present" fill={T.green} radius={[2, 2, 0, 0]} animationDuration={800} />
                <Bar dataKey="Late" fill={T.brand} radius={[2, 2, 0, 0]} animationDuration={800} />
                <Bar dataKey="Absent" fill={T.warn} radius={[2, 2, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-1">
              <Eyebrow>Bi-monthly Payroll Cost</Eyebrow>
              <TrendingUp size={14} color={T.soft} />
            </div>
            <div className="text-xs mb-3" style={{ fontFamily: F_BODY, color: T.soft }}>Net salary released · last 6 cutoffs</div>
            {trendData.length === 0 ? (
              <div className="flex items-center justify-center text-center text-xs px-4" style={{ height: 150, color: T.soft, fontFamily: F_BODY }}>
                No released cut-offs yet — finalize a cutoff on Staff Payroll to build this trend.
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={trendData} margin={{ left: -20, right: 5, top: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} vertical={false} />
                <XAxis dataKey="mo" tick={{ fontSize: 11, fill: T.soft }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: T.soft }} axisLine={false} tickLine={false} tickFormatter={v => `₱${v / 1000}k`} />
                <Tooltip formatter={v => [peso(v), 'Payroll']} contentStyle={{ borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: F_BODY }} />
                <Line type="monotone" dataKey="payroll" stroke={T.brand} strokeWidth={2.5} dot={{ r: 3, fill: T.brand }} activeDot={{ r: 5 }} animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};

/* ============================= EMPLOYEES ============================= */
