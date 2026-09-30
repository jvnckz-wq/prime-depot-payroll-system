'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar, TopBar } from '@/shell/Nav.jsx';
import { Confirm, Toasts } from '@/components/ui.jsx';
import { IdleTimeout } from '@/shell/IdleTimeout.jsx';
import { BIR_TABLE_INIT, CREW_RATE_FALLBACK, PAGIBIG_INIT, PHILHEALTH_INIT, SSS_TABLE_INIT } from '@/data/seed';
import { deliveriesToLog } from '@/lib/payroll';
import { uid, cutoffLabel, currentCutoffPeriod } from '@/lib/utils';
import { staffRunKey, todayYmdManila } from '@/lib/loan-rules';
import { FONTS, F_BODY, T } from '@/components/theme';
import { AttendanceView } from '@/features/attendance/AttendanceView.jsx';
import { CheckerView } from '@/features/deliveries/CheckerView.jsx';
import { DashboardView } from '@/features/dashboard/DashboardView.jsx';
import { EmployeesView } from '@/features/employees/EmployeesView.jsx';
import { LoansView } from '@/features/loans/LoansView.jsx';
import { LoginView } from '@/features/auth/LoginView.jsx';
import { LegalView } from '@/features/auth/LegalView.jsx';
import { ForcedPasswordChange } from '@/features/auth/AccountView.jsx';
import TwoFactorSetup from '@/features/auth/TwoFactorSetup.jsx';
import { AccountPage } from '@/features/auth/AccountPage.jsx';
import { FAQView } from '@/features/help/FAQView.jsx';
import { ReportsView } from '@/features/reports/ReportsView.jsx';
import { SettingsView } from '@/features/settings/SettingsView.jsx';
import { PayrollView } from '@/features/payroll/PayrollView.jsx';
import { TruckPayrollView } from '@/features/payroll/TruckPayrollView.jsx';

export default function PrimeDepotPayroll() {

  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [legalPage, setLegalPage] = useState(null);
  const [tab, setTab] = useState('dashboard');

  const [subs, setSubs] = useState({ payroll: 'staff', loans: 'loans', attendance: 'live', reports: 'register', settings: 'statutory' });
  const navSelect = React.useCallback((key, child) => { setTab(key); if (child) setSubs(s => ({ ...s, [key]: child })); }, []);

  const [navOpen, setNavOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const closeNav = React.useCallback(() => setNavOpen(false), []);

  const [employeePrefill, setEmployeePrefill] = useState(null);

  const [allStaff, setAllStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const staff = React.useMemo(() => allStaff.filter((e) => !e.crew), [allStaff]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => { if (!cancelled) { setUser(data.user); setAuthChecking(false); } })
      .catch(() => { if (!cancelled) setAuthChecking(false); });
    return () => { cancelled = true; };
  }, []);

  const reloadStaff = React.useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setAllStaff(data.employees);
    } catch (err) {
      console.error('Could not load employees:', err);

    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadStaff();
  }, [user, reloadStaff]);

  const [deliveries, setDeliveries] = useState({});

  const reloadDeliveries = React.useCallback(async () => {
    try {

      const today = todayYmdManila();
      const res = await fetch(`/api/deliveries?from=${today}&to=${today}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setDeliveries(deliveriesToLog(data.deliveries));
    } catch (err) {
      console.error('Could not load deliveries:', err);
    }
  }, []);

  useEffect(() => {

    if (!user || user.mustChangePassword) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadDeliveries();
  }, [user, reloadDeliveries]);

  const [rates, setRates] = useState([]);

  const [crewRates, setCrewRates] = useState(CREW_RATE_FALLBACK);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
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
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadLoans();
  }, [user, reloadLoans]);

  const [checkers, setCheckers] = useState([]);
  const [sssTable, setSssTable] = useState(SSS_TABLE_INIT);
  const [philhealthRates, setPhilhealthRates] = useState(PHILHEALTH_INIT);
  const [pagibigRates, setPagibigRates] = useState(PAGIBIG_INIT);
  const [birTable, setBirTable] = useState(BIR_TABLE_INIT);
  const statutory = { sss: sssTable, philhealth: philhealthRates, pagibig: pagibigRates, bir: birTable };

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
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadStatutory();
  }, [user, reloadStatutory]);

  const [cutoffPeriod, setCutoffPeriod] = useState(null);
  const [attSummaries, setAttSummaries] = useState([]);
  const [unmappedCount, setUnmappedCount] = useState(0);
  useEffect(() => {
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
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

  const staffKey = staffRunKey(cutoffPeriod?.start || currentCutoffPeriod().start);

  const [toasts, setToasts] = useState([]);

  const toast = (msg, type = 'success') => {
    const id = uid();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };

  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { }
    setUser(null);
    setTab('dashboard');
    setAllStaff([]);
    setLoans([]);
  };

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

  if (user.mustChangePassword) return <>
    <style>{FONTS}</style>
    <Toasts toasts={toasts} />
    <ForcedPasswordChange user={user} onDone={(email) => setUser(u => ({ ...u, mustChangePassword: false, ...(email ? { email } : {}) }))} />
  </>;

  if (user.role === 'ADMIN' && !user.totpEnabled) return <>
    <style>{FONTS}</style>
    <Toasts toasts={toasts} />
    <TwoFactorSetup user={user} onDone={() => setUser(u => ({ ...u, totpEnabled: true }))} />
  </>;

  if (user.role === 'CHECKER') return <>
    <style>{FONTS}</style>
    <Toasts toasts={toasts} />
    <IdleTimeout enabled onExit={logout} />
    <CheckerView currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} crewRates={crewRates} onLogout={logout} toast={toast} />
  </>;

  if (tab === 'account') return <>
    <style>{FONTS}</style>
    <Toasts toasts={toasts} />
    <IdleTimeout enabled onExit={logout} />
    <AccountPage
      user={user}
      toast={toast}
      onBack={() => setTab('dashboard')}
      onUserChange={u => setUser(prev => ({ ...prev, ...u }))}
      onSignedOut={() => { setUser(null); setTab('dashboard'); }}
    />
  </>;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden" style={{ backgroundColor: T.bg, fontFamily: F_BODY }}>
      <style>{FONTS}</style>
      <Toasts toasts={toasts} />
      <IdleTimeout enabled onExit={logout} />
      <Confirm
        open={confirmLogout}
        title="Log out?"
        message="You will be signed out of Prime Depot and need to sign in again to get back in."
        confirmLabel="Log out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); logout(); }}
      />
      <TopBar user={user} onOpenAccount={() => setTab('account')} onLogout={() => setConfirmLogout(true)} onOpenNav={() => setNavOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
      <Sidebar
        tab={tab}
        subs={subs}
        onSelect={navSelect}
        open={navOpen}
        onClose={closeNav}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div key={tab} className="pd-view-in">
          {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} totalEmployees={allStaff.filter(e => e.status !== 'Inactive').length} loans={loans} statutory={statutory} setTab={setTab} cutoffLabel={cutoffText} runKey={staffKey} attendanceSummaries={attSummaries} unmappedCount={unmappedCount} />}
          {tab === 'employees' && <EmployeesView staff={allStaff} reloadStaff={reloadStaff} toast={toast} prefill={employeePrefill} onPrefillConsumed={() => setEmployeePrefill(null)} />}
          {tab === 'attendance' && <AttendanceView navSub={subs.attendance} staff={allStaff} toast={toast} onRegister={(id, name) => { setEmployeePrefill({ id, name }); setTab('employees'); }} />}
          {tab === 'payroll' && <PayrollView navSub={subs.payroll} staff={staff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} toast={toast} cutoffLabel={cutoffText} reloadStaff={reloadStaff} staffLoading={staffLoading} deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} crewRates={crewRates} crewNames={allStaff.filter(e => e.crew).map(e => e.name)} />}
          {tab === 'deliveries' && <TruckPayrollView mode="logging" deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} crewRates={crewRates} loans={loans} reloadLoans={reloadLoans} crewNames={allStaff.filter(e => e.crew).map(e => e.name)} toast={toast} />}
          {tab === 'loans' && <LoansView navSub={subs.loans} staff={allStaff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} cutoffPeriod={cutoffPeriod} toast={toast} />}
          {tab === 'faqs' && <FAQView />}
          {tab === 'reports' && <ReportsView navTab={subs.reports} staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} cutoffLabel={cutoffText} runKey={staffKey} attendanceSummaries={attSummaries} crewRates={crewRates} />}
          {tab === 'settings' && <SettingsView navTab={subs.settings} currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} checkers={checkers} setCheckers={setCheckers} sssTable={sssTable} setSssTable={setSssTable} philhealthRates={philhealthRates} setPhilhealthRates={setPhilhealthRates} pagibigRates={pagibigRates} setPagibigRates={setPagibigRates} birTable={birTable} setBirTable={setBirTable} toast={toast} />}
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}
