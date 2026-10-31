'use client';
// Shows the screen for the sidebar item that is picked (one line per tab).

import React from 'react';
import { AttendanceView } from '@/features/attendance/AttendanceView.jsx';
import { DashboardView } from '@/features/dashboard/DashboardView.jsx';
import { EmployeesView } from '@/features/employees/EmployeesView.jsx';
import { LoansView } from '@/features/loans/LoansView.jsx';
import { ReportsView } from '@/features/reports/ReportsView.jsx';
import { SettingsView } from '@/features/settings/SettingsView.jsx';
import { PayrollView } from '@/features/payroll/PayrollView.jsx';
import { DeliveriesView } from '@/features/deliveries/DeliveriesView.jsx';
import { PieceRatesPanel } from '@/features/settings/PieceRatesPanel.jsx';
import { AuditLogPanel } from '@/features/settings/AuditLogPanel.jsx';

export const TabContent = ({
  tab, subs, user, setUser, setTab, navSelect, openDtr, toast,
  allStaff, staff, staffLoading, reloadStaff, employeePrefill, setEmployeePrefill, attendanceFocus, setAttendanceFocus,
  loans, reloadLoans, statutory, cutoffPeriod, cutoffText, staffKey, attLoading, attSummaries,
  unmappedCount, unregisteredIds, noScanDeliveries, deliveries, reloadDeliveries, rates, setRates, crewRates,
  checkers, setCheckers, sssTable, setSssTable, philhealthRates, setPhilhealthRates, pagibigRates, setPagibigRates,
  birTable, setBirTable,
}) => (
  <>
    {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} totalEmployees={allStaff.filter(e => e.status !== 'Inactive').length} loans={loans} statutory={statutory} setTab={setTab} onNavigate={navSelect} dataLoading={staffLoading || attLoading} cutoffLabel={cutoffText} runKey={staffKey} attendanceSummaries={attSummaries} unmappedCount={unmappedCount} unregisteredIds={unregisteredIds} noScanDeliveries={noScanDeliveries} />}
    {tab === 'employees' && <EmployeesView staff={allStaff} loading={staffLoading} reloadStaff={reloadStaff} toast={toast} prefill={employeePrefill} onPrefillConsumed={() => setEmployeePrefill(null)} />}
    {tab === 'attendance' && <AttendanceView navSub={subs.attendance} staff={allStaff} toast={toast} onNavigate={navSelect} focus={attendanceFocus} onFocusConsumed={() => setAttendanceFocus(null)} onRegister={(id, name) => { setEmployeePrefill({ id, name }); setTab('employees'); }} />}
    {tab === 'payroll' && <PayrollView navSub={subs.payroll} onNavigate={navSelect} staff={staff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} toast={toast} cutoffLabel={cutoffText} reloadStaff={reloadStaff} staffLoading={staffLoading} deliveries={deliveries} crewRates={crewRates} />}
    {tab === 'deliveries' && <DeliveriesView onOpenDtr={openDtr} deliveriesFilter={subs.deliveries === 'review' ? 'review' : 'all'} deliveries={deliveries} reloadDeliveries={reloadDeliveries} rates={rates} crewRates={crewRates} toast={toast} />}
    {tab === 'loans' && <LoansView navSub={subs.loans} staff={allStaff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} cutoffPeriod={cutoffPeriod} toast={toast} />}
    {tab === 'reports' && <ReportsView navTab={subs.reports} onNavigate={navSelect} dataLoading={staffLoading || attLoading} staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} cutoffLabel={cutoffText} runKey={staffKey} attendanceSummaries={attSummaries} crewRates={crewRates} />}
    {tab === 'settings' && subs.settings === 'rates' && <PieceRatesPanel rates={rates} setRates={setRates} toast={toast} />}
    {tab === 'settings' && subs.settings === 'audit' && <AuditLogPanel toast={toast} />}
    {tab === 'settings' && subs.settings !== 'rates' && subs.settings !== 'audit' && <SettingsView navTab={subs.settings} currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} checkers={checkers} setCheckers={setCheckers} sssTable={sssTable} setSssTable={setSssTable} philhealthRates={philhealthRates} setPhilhealthRates={setPhilhealthRates} pagibigRates={pagibigRates} setPagibigRates={setPagibigRates} birTable={birTable} setBirTable={setBirTable} toast={toast} />}
  </>
);
