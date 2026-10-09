'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Sidebar, TopBar } from '@/shell/Nav.jsx';
import { Btn, Confirm, Panel, Toasts } from '@/components/ui.jsx';
import { IdleTimeout } from '@/shell/IdleTimeout.jsx';
import { BIR_TABLE_INIT, CREW_RATE_FALLBACK, PAGIBIG_INIT, PHILHEALTH_INIT, SSS_TABLE_INIT } from '@/data/seed';
import { deliveriesToLog } from '@/lib/payroll';
import { uid, cutoffLabel, currentCutoffPeriod } from '@/lib/utils';
import { staffRunKey, todayYmdManila } from '@/lib/loan-rules';
import { authStateFrom } from '@/lib/auth-state';
import { FONTS, F_BODY, F_HEAD, T } from '@/components/theme';
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
import { ReportsView } from '@/features/reports/ReportsView.jsx';
import { SettingsView } from '@/features/settings/SettingsView.jsx';
import { PayrollView } from '@/features/payroll/PayrollView.jsx';
import { TruckPayrollView } from '@/features/payroll/TruckPayrollView.jsx';

const AUTH_RETRY_MS = 5000;
const AUTH_RETRIES = 3;

const readAuthState = () => fetch('/api/auth/me')
  .then(async (r) => {
    const body = await r.json().catch(() => null);
    return { state: authStateFrom(r.status, body), user: body?.user ?? null };
  })
  .catch(() => ({ state: authStateFrom(0, null), user: null }));

function ServerUnreachable({ checking, retrying, onRetry }) {
  return (
    <Panel className="w-full max-w-sm p-6 text-center" role="status">
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: T.brandBg }}>
        <WifiOff size={20} color={T.brand} aria-hidden="true" />
      </div>
      <div className="text-base font-bold mb-1" style={{ fontFamily: F_HEAD, color: T.ink }}>Can&apos;t reach the server.</div>
      <div className="text-sm mb-5" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
        {retrying ? 'Retrying...' : 'Check your internet connection, then try again.'}
      </div>
      <Btn onClick={onRetry} icon={RefreshCw} loading={checking} full>Retry</Btn>
    </Panel>
  );
}

export default function PrimeDepotPayroll() {

  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [serverDown, setServerDown] = useState(null);
  const [authRound, setAuthRound] = useState(0);
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

  const staff = React.useMemo(() => allStaff.filter((e) => !e.daily), [allStaff]);

  const [loans, setLoans] = useState([]);
  const [sessionNotice, setSessionNotice] = useState('');
  const expireSession = React.useCallback(() => {
    setUser(null);
    setTab('dashboard');
    setAllStaff([]);
    setLoans([]);
    setSessionNotice('Your session has ended. Please sign in again.');
  }, []);

  const getJson = React.useCallback(async (url) => {
    const res = await fetch(url);
    if (res.status === 401) { expireSession(); return null; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }, [expireSession]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let tries = 0;
    const check = () => readAuthState().then(({ state, user: me }) => {
      if (cancelled) return;
      if (state === 'unreachable') {
        tries += 1;
        const retrying = tries <= AUTH_RETRIES;
        setServerDown({ checking: false, retrying });
        if (retrying) timer = setTimeout(() => { setServerDown({ checking: true, retrying: true }); check(); }, AUTH_RETRY_MS);
        return;
      }
      setServerDown(null);
      setUser(me);
      setAuthChecking(false);
    });
    check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [authRound]);

  const retryAuth = () => {
    setServerDown({ checking: true, retrying: true });
    setAuthRound((n) => n + 1);
  };

  const reloadStaff = React.useCallback(async () => {
    try {
      const data = await getJson('/api/employees');
      if (!data) return;
      setAllStaff(data.employees);
    } catch (err) {
      console.error('Could not load employees:', err);

    } finally {
      setStaffLoading(false);
    }
  }, [getJson]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadStaff();
  }, [user, reloadStaff]);

  const [deliveries, setDeliveries] = useState({});

  const reloadDeliveries = React.useCallback(async () => {
    try {

      const today = todayYmdManila();
      const data = await getJson(`/api/deliveries?from=${today}&to=${today}`);
      if (!data) return;
      setDeliveries(deliveriesToLog(data.deliveries));
    } catch (err) {
      console.error('Could not load deliveries:', err);
    }
  }, [getJson]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    getJson('/api/rates')
      .then(data => {
        if (cancelled || !data) return;
        const active = data.rates.filter(r => r.isActive);
        if (active.length) setRates(active);
        if (data.crewRates) setCrewRates(data.crewRates);
      })
      .catch(err => console.error('Could not load piece rates:', err));
    return () => { cancelled = true; };
  }, [user, getJson]);

  const reloadLoans = React.useCallback(async () => {
    try {
      const data = await getJson('/api/loans');
      if (!data) return;
      setLoans(data.loans);
    } catch (err) {
      console.error('Could not load loans:', err);
    }
  }, [getJson]);

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
      const d = await getJson('/api/statutory');
      if (!d) return;
      if (d.sss?.length) setSssTable(d.sss);
      if (d.philhealth) setPhilhealthRates(d.philhealth);
      if (d.pagibig?.brackets?.length) setPagibigRates(d.pagibig);
      if (d.bir?.length) setBirTable(d.bir);
    } catch (err) {
      console.error('Could not load statutory tables:', err);
    }
  }, [getJson]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    reloadStatutory();
  }, [user, reloadStatutory]);

  const [cutoffPeriod, setCutoffPeriod] = useState(null);
  const [attSummaries, setAttSummaries] = useState([]);
  const [attLoading, setAttLoading] = useState(true);
  const [unmappedCount, setUnmappedCount] = useState(0);
  useEffect(() => {
    if (!user || user.role !== 'ADMIN' || !user.totpEnabled) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load/sync state on mount or when deps change
    getJson('/api/attendance')
      .then(d => {
        if (cancelled || !d) return;
        setCutoffPeriod(d.period || null);
        setAttSummaries(d.summaries || []);
        setUnmappedCount(d.unmappedCount || 0);
      })
      .catch(err => console.error('Could not load current cutoff:', err))
      .finally(() => { if (!cancelled) setAttLoading(false); });
    return () => { cancelled = true; };
  }, [user, getJson]);

  useEffect(() => {
    if (!user) return undefined;
    let last = 0;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 60000) return;
      last = now;
      readAuthState().then(({ state }) => { if (state === 'signed-out') expireSession(); });
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [user, expireSession]);
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.sidebar }}>
        <style>{FONTS}</style>
        {serverDown ? (
          <ServerUnreachable checking={serverDown.checking} retrying={serverDown.retrying} onRetry={retryAuth} />
        ) : (
          <div className="pd-spin" aria-label="Loading" role="status" style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.22)', borderTopColor: '#FFFFFF' }} />
        )}
      </div>
    );
  }

  if (!user) return <>
    <style>{FONTS}</style>
    <LoginView notice={sessionNotice} onSignedIn={(u) => { setSessionNotice(''); setUser(u); }} onShowLegal={setLegalPage} />
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
      onGoToEmployees={() => setTab('employees')}
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
          {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} totalEmployees={allStaff.filter(e => e.status !== 'Inactive').length} loans={loans} statutory={statutory} setTab={setTab} onNavigate={navSelect} dataLoading={staffLoading || attLoading} cutoffLabel={cutoffText} runKey={staffKey} attendanceSummaries={attSummaries} unmappedCount={unmappedCount} />}
          {tab === 'employees' && <EmployeesView staff={allStaff} loading={staffLoading} reloadStaff={reloadStaff} toast={toast} prefill={employeePrefill} onPrefillConsumed={() => setEmployeePrefill(null)} />}
          {tab === 'attendance' && <AttendanceView navSub={subs.attendance} staff={allStaff} toast={toast} onNavigate={navSelect} onRegister={(id, name) => { setEmployeePrefill({ id, name }); setTab('employees'); }} />}
          {tab === 'payroll' && <PayrollView navSub={subs.payroll} onNavigate={navSelect} staff={staff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} toast={toast} cutoffLabel={cutoffText} reloadStaff={reloadStaff} staffLoading={staffLoading} deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} crewRates={crewRates} crewNames={allStaff.filter(e => e.crew).map(e => e.name)} />}
          {tab === 'deliveries' && <TruckPayrollView mode="logging" deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} crewRates={crewRates} loans={loans} reloadLoans={reloadLoans} crewNames={allStaff.filter(e => e.crew).map(e => e.name)} toast={toast} />}
          {tab === 'loans' && <LoansView navSub={subs.loans} staff={allStaff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} cutoffPeriod={cutoffPeriod} toast={toast} />}
          {tab === 'reports' && <ReportsView navTab={subs.reports} onNavigate={navSelect} dataLoading={staffLoading || attLoading} staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} cutoffLabel={cutoffText} runKey={staffKey} attendanceSummaries={attSummaries} crewRates={crewRates} />}
          {tab === 'settings' && <SettingsView navTab={subs.settings} currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} checkers={checkers} setCheckers={setCheckers} sssTable={sssTable} setSssTable={setSssTable} philhealthRates={philhealthRates} setPhilhealthRates={setPhilhealthRates} pagibigRates={pagibigRates} setPagibigRates={setPagibigRates} birTable={birTable} setBirTable={setBirTable} toast={toast} />}
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}
