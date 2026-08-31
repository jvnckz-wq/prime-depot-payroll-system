'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar, TopBar } from './components/Nav.jsx';
import { Toasts } from './components/ui.jsx';
import { IdleTimeout } from './components/IdleTimeout.jsx';
import { BIR_TABLE_INIT, CREW_RATE_FALLBACK, PAGIBIG_INIT, PHILHEALTH_INIT, SSS_TABLE_INIT } from './data/seed';
import { deliveriesToLog } from './lib/payroll';
import { uid, cutoffLabel } from './lib/utils';
import { FONTS, F_BODY, T } from './theme';
import { AttendanceView } from './views/AttendanceView.jsx';
import { CheckerView } from './views/CheckerView.jsx';
import { DashboardView } from './views/DashboardView.jsx';
import { EmployeesView } from './views/EmployeesView.jsx';
import { LoansView } from './views/LoansView.jsx';
import { LoginView } from './views/LoginView.jsx';
import { LegalView } from './views/LegalView.jsx';
import { ForcedPasswordChange } from './views/AccountView.jsx';
import { AccountPage } from './views/AccountPage.jsx';
import { ReportsView } from './views/ReportsView.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { PayrollView } from './views/PayrollView.jsx';
import { TruckPayrollView } from './views/TruckPayrollView.jsx';

export default function PrimeDepotPayroll() {
  // Authentication state. `user` is null when signed out; `authChecking` covers
  // the moment between page load and the session lookup returning, so the login
  // screen doesn't flash for someone who is already signed in.
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [legalPage, setLegalPage] = useState(null); // 'terms' | 'privacy' | null
  const [tab, setTab] = useState('dashboard');
  // Mobile navigation drawer. Below `md` the sidebar is off-canvas, so this is
  // the only way to reach the other sections.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = React.useCallback(() => setNavOpen(false), []);
  // Hand-off from Attendance's "Register" on an unmapped biometric ID: carries
  // the id + name into the Employees Add form, consumed once on arrival.
  const [employeePrefill, setEmployeePrefill] = useState(null);
  // Employees now come from the database instead of the in-memory seed. The
  // seed list is kept only as a fallback so the UI still renders if the API is
  // unreachable — a payroll screen that silently shows nothing is worse than
  // one that shows stale reference data with an error toast.
  // The full roster from the database — office staff AND crew. Kept whole here;
  // the payroll-facing views take the office subset below.
  const [allStaff, setAllStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  // Office staff only. Crew are paid through Truck Payroll (pakyawan), so Staff
  // Payroll, Attendance, Loans, and the dashboard's payroll math must exclude
  // them. The Employees module and the headcount use the full roster instead.
  const staff = React.useMemo(() => allStaff.filter((e) => !e.crew), [allStaff]);

  // Restore the session on load, so a refresh doesn't sign anyone out.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => { if (!cancelled) { setUser(data.user); setAuthChecking(false); } })
      .catch(() => { if (!cancelled) setAuthChecking(false); });
    return () => { cancelled = true; };
  }, []);

  // Employee data is admin-only, so there is nothing to fetch until an admin is
  // signed in. Extracted into a callback so a register or edit can refresh the
  // list the same way — one source of truth, straight from the database.
  const reloadStaff = React.useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setAllStaff(data.employees);
    } catch (err) {
      console.error('Could not load employees:', err);
      // No seed fallback — an empty list with an error logged is honest; stale
      // fake employees on a payroll screen are worse than showing nothing.
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadStaff();
  }, [user, reloadStaff]);

  // Deliveries come from the database. The seed stays as a fallback for the
  // same reason the employee list does: a payroll screen showing nothing is
  // harder to diagnose than one showing stale data with an error logged.
  const [deliveries, setDeliveries] = useState({});

  const reloadDeliveries = React.useCallback(async () => {
    try {
      // Live views show today only. "Today" is the server's date — the same
      // basis a freshly logged delivery is stored under — so a delivery logged
      // now always appears, and a brand-new day starts empty until the first
      // trip is logged. Past days live in Truck Payroll's History.
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/deliveries?from=${today}&to=${today}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setDeliveries(deliveriesToLog(data.deliveries));
    } catch (err) {
      console.error('Could not load deliveries:', err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadDeliveries();
  }, [user, reloadDeliveries]);

  // Piece rates come from the database so each row carries an id — that id is
  // what lets an edit or a retire target the right record. The seed list stays
  // as a fallback: the delivery form cannot function at all without rates, so
  // showing the last known table beats showing an empty dropdown.
  const [rates, setRates] = useState([]);
  // Crew pakyawan rates (daily minimums + palima bonus). These used to be
  // constants in the bundle; they now arrive with the piece rates, from the
  // database. CREW_RATE_FALLBACK covers a failed request so the delivery cards
  // show plausible figures instead of zeroes.
  const [crewRates, setCrewRates] = useState(CREW_RATE_FALLBACK);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/rates')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => {
        if (cancelled) return;
        const active = data.rates.filter(r => r.isActive);
        if (active.length) setRates(active);
        if (data.crewRates) setCrewRates(data.crewRates);
      })
      .catch(err => console.error('Could not load piece rates:', err));
    return () => { cancelled = true; };
  }, [user]);

  const [loans, setLoans] = useState([]);
  // Loans and their ledgers live in the database. Admin-only, so nothing loads
  // until an admin is signed in; reloadLoans is reused after every grant, pause,
  // settle, or deduction run so the ledgers always reflect the stored truth.
  const reloadLoans = React.useCallback(async () => {
    try {
      const res = await fetch('/api/loans');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setLoans(data.loans);
    } catch (err) {
      console.error('Could not load loans:', err);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadLoans();
  }, [user, reloadLoans]);

  const [checkers, setCheckers] = useState([]);
  const [sssTable, setSssTable] = useState(SSS_TABLE_INIT);
  const [philhealthRates, setPhilhealthRates] = useState(PHILHEALTH_INIT);
  const [pagibigRates, setPagibigRates] = useState(PAGIBIG_INIT);
  const [birTable, setBirTable] = useState(BIR_TABLE_INIT);
  const statutory = { sss: sssTable, philhealth: philhealthRates, pagibig: pagibigRates, bir: birTable };

  // Statutory tables live in the database (admin-editable). Seed values above
  // are only a fallback if the load fails.
  const reloadStatutory = React.useCallback(async () => {
    try {
      const res = await fetch('/api/statutory');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      if (d.sss?.length) setSssTable(d.sss);
      if (d.philhealth) setPhilhealthRates(d.philhealth);
      if (d.pagibig?.brackets?.length) setPagibigRates(d.pagibig);
      if (d.bir?.length) setBirTable(d.bir);
    } catch (err) {
      console.error('Could not load statutory tables:', err);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadStatutory();
  }, [user, reloadStatutory]);

  // The current cutoff comes from the most recent imported attendance period,
  // so every screen's label matches the data actually being paid. Falls back to
  // the calendar cutoff (1–15 / 16–end) when nothing has been imported yet.
  const [cutoffPeriod, setCutoffPeriod] = useState(null);
  const [attSummaries, setAttSummaries] = useState([]);
  const [unmappedCount, setUnmappedCount] = useState(0);
  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    let cancelled = false;
    fetch('/api/attendance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(d => {
        if (cancelled) return;
        setCutoffPeriod(d.period || null);
        setAttSummaries(d.summaries || []);
        setUnmappedCount(d.unmappedCount || 0);
      })
      .catch(err => console.error('Could not load current cutoff:', err));
    return () => { cancelled = true; };
  }, [user]);
  const cutoffText = cutoffLabel(cutoffPeriod);

  const [toasts, setToasts] = useState([]);

  const toast = (msg, type = 'success') => {
    const id = uid();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* sign out locally regardless */ }
    setUser(null);
    setTab('dashboard');
    setAllStaff([]);
    setLoans([]);
  };

  // Terms and Privacy are readable without signing in — someone should be able
  // to read what they are agreeing to before they agree to it.
  if (legalPage) {
    return <>
      <style>{FONTS}</style>
      <LegalView initialTab={legalPage} onBack={() => setLegalPage(null)} />
    </>;
  }

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: T.sidebar }}>
        <style>{FONTS}</style>
        <div className="pd-spin" aria-label="Loading" role="status" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.22)', borderTopColor: '#FFFFFF' }} />
      </div>
    );
  }

  if (!user) return <>
    <style>{FONTS}</style>
    <LoginView onSignedIn={setUser} onShowLegal={setLegalPage} />
  </>;

  // A temporary password gets replaced before anything else is reachable.
  if (user.mustChangePassword) return <>
    <style>{FONTS}</style>
    <Toasts toasts={toasts} />
    <ForcedPasswordChange user={user} onDone={() => setUser(u => ({ ...u, mustChangePassword: false }))} />
  </>;

  if (user.role === 'CHECKER') return <>
    <style>{FONTS}</style>
    <Toasts toasts={toasts} />
    <IdleTimeout enabled onExit={logout} />
    <CheckerView currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} crewRates={crewRates} onLogout={logout} toast={toast} />
  </>;

  const titles = {
    dashboard: 'Overview', employees: 'Employees', attendance: 'Attendance', payroll: 'Payroll',
    deliveries: 'Deliveries', loans: 'Loans & Advances', reports: 'Reports', settings: 'Settings',
    account: 'My Account',
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: T.bg, fontFamily: F_BODY }}>
      <style>{FONTS}</style>
      <Toasts toasts={toasts} />
      <IdleTimeout enabled onExit={logout} />
      <Sidebar
        tab={tab}
        setTab={setTab}
        onLogout={logout}
        user={user}
        onOpenAccount={() => setTab('account')}
        open={navOpen}
        onClose={closeNav}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar tab={tab} title={titles[tab]} cutoff={cutoffText} onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div key={tab} className="pd-view-in">
          {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} totalEmployees={allStaff.filter(e => e.status !== 'Inactive').length} loans={loans} statutory={statutory} setTab={setTab} cutoffLabel={cutoffText} attendanceSummaries={attSummaries} unmappedCount={unmappedCount} />}
          {tab === 'employees' && <EmployeesView staff={allStaff} reloadStaff={reloadStaff} toast={toast} prefill={employeePrefill} onPrefillConsumed={() => setEmployeePrefill(null)} />}
          {tab === 'attendance' && <AttendanceView staff={allStaff} toast={toast} onRegister={(id, name) => { setEmployeePrefill({ id, name }); setTab('employees'); }} />}
          {tab === 'payroll' && <PayrollView staff={staff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} toast={toast} cutoffLabel={cutoffText} reloadStaff={reloadStaff} staffLoading={staffLoading} deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} crewRates={crewRates} crewNames={allStaff.filter(e => e.crew).map(e => e.name)} />}
          {tab === 'deliveries' && <TruckPayrollView mode="logging" deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} crewRates={crewRates} loans={loans} reloadLoans={reloadLoans} crewNames={allStaff.filter(e => e.crew).map(e => e.name)} toast={toast} />}
          {tab === 'loans' && <LoansView staff={allStaff} loans={loans} reloadLoans={reloadLoans} toast={toast} />}
          {tab === 'reports' && <ReportsView staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} cutoffLabel={cutoffText} attendanceSummaries={attSummaries} crewRates={crewRates} />}
          {tab === 'account' && (
            <AccountPage
              user={user}
              toast={toast}
              onBack={() => setTab('dashboard')}
              onUserChange={u => setUser(prev => ({ ...prev, ...u }))}
              onSignedOut={() => { setUser(null); setTab('dashboard'); }}
            />
          )}
          {tab === 'settings' && <SettingsView currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} checkers={checkers} setCheckers={setCheckers} sssTable={sssTable} setSssTable={setSssTable} philhealthRates={philhealthRates} setPhilhealthRates={setPhilhealthRates} pagibigRates={pagibigRates} setPagibigRates={setPagibigRates} birTable={birTable} setBirTable={setBirTable} toast={toast} />}
          </div>
        </main>
      </div>
    </div>
  );
}
