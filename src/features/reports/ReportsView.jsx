'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CalendarX, CircleCheck, ReceiptText, Truck, Users } from 'lucide-react';
import { Badge, Btn, EmptyState, Eyebrow, H1, Panel, Skeleton, SkeletonRows, Td, Th } from '@/components/ui.jsx';
import { positionLabel } from '@/data/seed';
import { computeStaffPayroll } from '@/lib/payroll';
import { shortDate, todayYmdManila } from '@/lib/loan-rules';
import { cutoffThreshold, cutoffWithholding, taxableForCutoff } from '@/lib/withholding';
import { deliveryRange } from '@/lib/delivery-range';
import { exportXLSX, peso } from '@/lib/utils';
import { F_BODY, F_HEAD, F_MONO, T } from '@/components/theme';

export const ReportsView = ({ staff, deliveries, loans, statutory, cutoffLabel = '', runKey = '', attendanceSummaries = [], navTab, onNavigate, dataLoading = false }) => {
  const [tab, setTab] = useState(navTab || 'register');
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the report from the sidebar selection
  useEffect(() => { if (navTab) setTab(navTab); }, [navTab]);

  const todayStr = todayYmdManila();
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [rangeApi, setRangeApi] = useState([]);
  const [loadingRange, setLoadingRange] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const rangeError = deliveryRange(from, to).error || fetchError;
  useEffect(() => {
    if (deliveryRange(from, to).error) return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    setLoadingRange(true);
    setFetchError('');
    const t = setTimeout(() => {
      fetch(`/api/payroll/daily?summary=crew&from=${from}&to=${to}`)
        .then(async r => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || 'Could not load the crew report for this range.');
          return data;
        })
        .then(data => { if (!cancelled) setRangeApi(data.rows || []); })
        .catch(err => { if (!cancelled) { setRangeApi([]); setFetchError(err.message); } })
        .finally(() => { if (!cancelled) setLoadingRange(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [from, to]);

  const attById = useMemo(() => {
    const m = {};
    for (const s of attendanceSummaries) m[s.id] = s;
    return m;
  }, [attendanceSummaries]);
  const cutoffKey = runKey || `staff-${cutoffLabel}`;

  const payrollRows = useMemo(
    () => staff.filter(e => Number(e.rate) > 0).map(e => ({ emp: e, calc: computeStaffPayroll(e, loans, statutory, attById[e.id], cutoffKey) })).filter(r => r.calc.hasAttendance),
    [staff, loans, statutory, attById, cutoffKey]
  );
  const remitRows = payrollRows;

  const [t13, setT13] = useState({ loading: true, error: '', year: null, rows: [] });
  useEffect(() => {
    if (tab !== '13th') return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    setT13(prev => ({ ...prev, loading: true, error: '' }));
    fetch('/api/payroll/thirteenth')
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Could not load the 13th month report.');
        return data;
      })
      .then(data => { if (!cancelled) setT13({ loading: false, error: '', year: data.year, rows: data.rows || [] }); })
      .catch(err => { if (!cancelled) setT13({ loading: false, error: err.message, year: null, rows: [] }); });
    return () => { cancelled = true; };
  }, [tab]);
  const year13 = t13.year || Number(todayStr.slice(0, 4));

  const go = (key, child) => onNavigate && onNavigate(key, child);
  const staffCount = staff.filter(e => Number(e.rate) > 0).length;
  const payrollEmpty = staffCount === 0 ? (
    <EmptyState icon={Users} title="No staff registered yet"
      desc="Payroll reports list office staff. Register them in Employees first."
      action={<Btn variant="outline" onClick={() => go('employees')}>Go to Employees</Btn>} />
  ) : (
    <EmptyState icon={CalendarX} title={`No attendance for ${cutoffLabel || 'this cutoff'} yet`}
      desc="Payroll is computed from attendance. Pull it from the device and this report fills in."
      action={<Btn variant="outline" onClick={() => go('attendance', 'dtr')}>Go to Attendance</Btn>} />
  );
  const payrollReady = !dataLoading && payrollRows.length > 0;
  const whtRows = payrollRows.map(r => {
    const taxable = taxableForCutoff(r.calc);
    return { id: r.emp.id, name: r.emp.name, taxable, tax: cutoffWithholding(taxable, statutory.bir || []) };
  });
  const whtTotal = whtRows.reduce((sum, r) => sum + r.tax, 0);
  const whtAbove = whtRows.filter(r => r.tax > 0).length;
  const whtThreshold = cutoffThreshold(statutory.bir || []);
  const crewRowsAll = rangeApi;
  const crewRows = rangeError ? [] : crewRowsAll;

  const exportRegister = () => exportXLSX('Payroll-Register.xlsx', [{ name: 'Register', rows: payrollRows.map(r => ({ Employee: r.emp.name, Days: r.calc.days, Gross: r.calc.gross, OT: r.calc.ot, Deductions: r.calc.totalDeductions, 'Net Pay': r.calc.net })) }]);
  const exportRemit = () => exportXLSX('Gov-Remittance.xlsx', [
    { name: 'Remittance', rows: remitRows.map(r => ({ Employee: r.emp.name, SSS: r.calc.sss, PhilHealth: r.calc.phic, 'Pag-IBIG': r.calc.hdmf, Total: r.calc.sss + r.calc.phic + r.calc.hdmf })) },
  ]);
  const exportWht = () => exportXLSX('Withholding-Tax.xlsx', [{ name: 'Withholding Tax', rows: whtRows.map(r => ({ Employee: r.name, 'Taxable Pay': r.taxable, 'Estimated Tax': r.tax, Status: r.tax > 0 ? 'Above threshold' : 'Below threshold' })) }]);
  const export13 = () => exportXLSX('13th-Month-Pay.xlsx', [{ name: '13th Month', rows: t13.rows.map(r => ({ Employee: r.name, 'Months Worked': r.months, 'Total Basic': r.basic, '13th Month Pay': r.pay })) }]);
  const exportDriver = () => exportXLSX('Crew-Earnings.xlsx', [{ name: 'Crew', rows: crewRows.map(r => ({
    Name: r.name, Role: positionLabel(r.role), Trucks: r.trucks.join(', '), Days: r.days, Trips: r.trips,
    'Daily Rate': r.dailyRate, 'Piece Rate': r.pieceRate, 'Palima Bonus': r.bonus, Gross: r.total,
    Late: r.late, Loans: r.loans, Net: r.net,
  })) }]);

  return (
    <div className="p-4 sm:p-6">
      <H1 sub="Payroll, government compliance, and delivery earnings reports.">Reports</H1>

      {tab === 'register' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Payroll Register — {cutoffLabel || 'Current cutoff'}</Eyebrow>
            <Btn size="sm" variant="outline" onClick={exportRegister} disabled={!payrollReady}>Export Excel</Btn>
          </div>
          {!dataLoading && !payrollRows.length ? payrollEmpty : (
          <div className="overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr><Th>Employee</Th><Th center>Days</Th><Th right>Gross</Th><Th right>OT</Th><Th right>Deductions</Th><Th right>Net Pay</Th></tr></thead>
              <tbody>{dataLoading ? <SkeletonRows cols={6} rows={5} /> : payrollRows.map((r, i) => (
                <tr key={i}>
                  <Td>{r.emp.name}</Td>
                  <Td center mono>{r.calc.days}</Td>
                  <Td right mono>{peso(r.calc.gross)}</Td>
                  <Td right mono>{r.calc.ot ? peso(r.calc.ot) : '—'}</Td>
                  <Td right mono>{r.calc.totalDeductions ? <span style={{ color: T.red }}>−{peso(r.calc.totalDeductions)}</span> : peso(0)}</Td>
                  <Td right mono><span style={{ fontWeight: 600 }}>{peso(r.calc.net)}</span></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          )}
        </Panel>
      )}
      {tab === 'remittance' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Government Remittance (Employee Share) — {cutoffLabel || 'Current cutoff'}</Eyebrow>
            <Btn size="sm" variant="outline" onClick={exportRemit} disabled={!payrollReady}>Export Excel</Btn>
          </div>
          {!dataLoading && !remitRows.length ? payrollEmpty : (
          <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
            <thead><tr><Th>Employee</Th><Th right>SSS</Th><Th right>PhilHealth</Th><Th right>Pag-IBIG</Th><Th right>Total Withheld</Th></tr></thead>
            <tbody>{dataLoading ? <SkeletonRows cols={5} rows={5} /> : remitRows.map((r, i) => <tr key={i}><Td>{r.emp.name}</Td><Td right mono>{peso(r.calc.sss)}</Td><Td right mono>{peso(r.calc.phic)}</Td><Td right mono>{peso(r.calc.hdmf)}</Td><Td right mono>{peso(r.calc.sss + r.calc.phic + r.calc.hdmf)}</Td></tr>)}</tbody>
          </table></div>
          )}
        </Panel>
      )}
      {tab === '13th' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>13th Month Pay — FY {year13} (Basic ÷ 12)</Eyebrow>
            <Btn size="sm" variant="outline" onClick={export13} disabled={t13.loading || !t13.rows.length}>Export Excel</Btn>
          </div>
          {t13.error ? (
            <div role="alert" className="m-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: T.brandBg, color: T.brand, fontFamily: F_BODY }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{t13.error}</span>
            </div>
          ) : !t13.loading && !t13.rows.length ? (
            <EmptyState icon={ReceiptText} title={`No released payroll in ${year13} yet`}
              desc="13th month pay is the basic pay from released payslips this year, divided by 12. It fills in after you finalize a cutoff."
              action={<Btn variant="outline" onClick={() => go('payroll', 'staff')}>Go to Staff Payroll</Btn>} />
          ) : (
            <>
              <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
                <thead><tr><Th>Employee</Th><Th center>Months Worked</Th><Th right>Total Basic</Th><Th right>13th Month Pay</Th></tr></thead>
                <tbody>{t13.loading ? <SkeletonRows cols={4} rows={5} /> : t13.rows.map(r => <tr key={r.employeeId}><Td>{r.name}</Td><Td center mono>{r.months}</Td><Td right mono>{peso(r.basic)}</Td><Td right mono>{peso(r.pay)}</Td></tr>)}</tbody>
              </table></div>
              {!t13.loading && (
                <p className="text-xs px-4 py-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6, borderTop: `1px solid ${T.line}` }}>
                  Basic pay from released staff payslips in {year13}, divided by 12, the same source as Final Pay. Resigned employees receive theirs through Final Pay.
                </p>
              )}
            </>
          )}
        </Panel>
      )}
      {tab === 'drivers' && (
        <Panel className="overflow-hidden">
          <div className="px-4 py-2.5 flex justify-between items-center flex-wrap gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Eyebrow>Crew Earnings — per person</Eyebrow>
              <input type="date" max={todayStr} value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded border text-sm" style={{ borderColor: T.line, fontFamily: F_MONO, minWidth: 168, colorScheme: 'light', color: T.ink, backgroundColor: T.surface }} />
              <span className="text-xs" style={{ color: T.soft, fontFamily: F_BODY }}>to</span>
              <input type="date" max={todayStr} value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded border text-sm" style={{ borderColor: T.line, fontFamily: F_MONO, minWidth: 168, colorScheme: 'light', color: T.ink, backgroundColor: T.surface }} />
              {loadingRange && <Skeleton w={72} h={11} />}
            </div>
            <Btn size="sm" variant="outline" onClick={exportDriver} disabled={!!rangeError || loadingRange || !crewRows.length}>Export Excel</Btn>
          </div>
          {rangeError && (
            <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: T.brandBg, color: T.brand, fontFamily: F_BODY }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{rangeError}</span>
            </div>
          )}
          <p className="text-xs px-4 pb-3" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            One row per person, totalled across every truck they rode. A pahinante who worked with two
            different drivers appears once here, not twice. Net is gross minus late and loan
            deductions, the same as the daily payslips.
          </p>
          {!rangeError && !loadingRange && !crewRows.length ? (
            <EmptyState icon={Truck}
              title={from === to ? (from === todayStr ? 'No crew earnings today' : `No crew earnings on ${shortDate(from, true)}`) : 'No crew earnings in this date range'}
              desc="Earnings appear once deliveries are logged for these dates."
              action={<Btn variant="outline" onClick={() => go('deliveries')}>Go to Deliveries</Btn>} />
          ) : !rangeError && (
          <div className="overflow-x-auto pd-scroll-shadow">
            <table className="w-full">
              <thead><tr><Th>Name</Th><Th>Role</Th><Th>Trucks</Th><Th center>Days</Th><Th center>Trips</Th><Th right>Daily</Th><Th right>Piece Rate</Th><Th right>Palima</Th><Th right>Gross</Th><Th right>Late</Th><Th right>Loans</Th><Th right>Net</Th></tr></thead>
              <tbody>{loadingRange && !crewRows.length ? <SkeletonRows cols={12} rows={4} /> : crewRows.map((r, i) => (
                <tr key={i}>
                  <Td>{r.name}</Td>
                  <Td><Badge tone={r.role === 'Driver' ? 'amber' : 'neutral'}>{positionLabel(r.role)}</Badge></Td>
                  <Td mono><span style={{ color: T.soft }}>{r.trucks.join(', ')}</span></Td>
                  <Td center mono>{r.days}</Td>
                  <Td center mono>{r.trips}</Td>
                  <Td right mono>{peso(r.dailyRate)}</Td>
                  <Td right mono>{peso(r.pieceRate)}</Td>
                  <Td right mono>{r.bonus ? <span style={{ color: T.green }}>{peso(r.bonus)}</span> : '—'}</Td>
                  <Td right mono>{peso(r.total)}</Td>
                  <Td right mono>{r.late ? <span style={{ color: T.red }}>-{peso(r.late)}</span> : '—'}</Td>
                  <Td right mono>{r.loans ? <span style={{ color: T.red }}>-{peso(r.loans)}</span> : '—'}</Td>
                  <Td right mono><span style={{ fontWeight: 700 }}>{peso(r.net)}</span></Td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          )}
        </Panel>
      )}
      {tab === 'bir' && (
        <Panel className="overflow-hidden">
          <div className="flex justify-between items-center px-4 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
            <Eyebrow>Withholding Tax — {cutoffLabel || 'Current cutoff'}</Eyebrow>
            <Btn size="sm" variant="outline" onClick={exportWht} disabled={!payrollReady}>Export Excel</Btn>
          </div>
          {!dataLoading && !whtRows.length ? payrollEmpty : (
            <>
              {!dataLoading && (whtAbove > 0 ? (
                <div role="alert" className="px-4 py-3 text-xs flex items-start gap-2" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.6, backgroundColor: T.warnBg, borderBottom: `1px solid ${T.line}` }}>
                  <AlertTriangle size={14} color={T.warn} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>{whtAbove} of {whtRows.length} staff {whtAbove === 1 ? 'is' : 'are'} above the BIR threshold this cutoff.</strong> Estimated tax: {peso(whtTotal)}. Payslips do not deduct withholding tax, following the current payroll, so this is for the owner to act on.</span>
                </div>
              ) : (
                <div className="px-4 py-2.5 text-xs flex items-center gap-2" style={{ fontFamily: F_BODY, color: T.green, backgroundColor: T.greenBg, borderBottom: `1px solid ${T.line}` }}>
                  <CircleCheck size={13} className="shrink-0" aria-hidden="true" />
                  All {whtRows.length} staff are below the BIR threshold this cutoff, so no withholding tax is due.
                </div>
              ))}
              <div className="overflow-x-auto pd-scroll-shadow"><table className="w-full">
                <thead><tr><Th>Employee</Th><Th right>Taxable Pay</Th><Th right>Estimated Tax</Th></tr></thead>
                <tbody>{dataLoading ? <SkeletonRows cols={3} rows={5} /> : whtRows.map(r => (
                  <tr key={r.id}>
                    <Td>{r.name}{r.tax > 0 && <span className="ml-2 align-middle"><Badge tone="amber">Above threshold</Badge></span>}</Td>
                    <Td right mono>{peso(r.taxable)}</Td>
                    <Td right mono>{r.tax > 0 ? <b>{peso(r.tax)}</b> : peso(0)}</Td>
                  </tr>
                ))}</tbody>
              </table></div>
              {!dataLoading && (
                <p className="px-4 py-3 text-xs" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6, borderTop: `1px solid ${T.line}` }}>
                  Taxable pay is gross pay, overtime and allowance, minus tardiness and the employee&apos;s SSS, PhilHealth and Pag-IBIG share. The estimate uses the BIR table in Settings on a semi-monthly basis, so tax starts above {peso(whtThreshold)} per cutoff. It is not deducted on the payslip.
                </p>
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
};