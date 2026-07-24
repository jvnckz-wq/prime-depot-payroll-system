'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar, TopBar } from './components/Nav.jsx';
import { Toasts } from './components/ui.jsx';
import { ADMIN_NAV, BIR_TABLE_INIT, CHECKERS_INIT, DELIVERIES_INIT, LOANS_INIT, PAGIBIG_INIT, PHILHEALTH_INIT, RATES_INIT, SSS_TABLE_INIT, STAFF_INIT } from './data/seed';
import { deliveriesToLog } from './lib/payroll';
import { uid } from './lib/utils';
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
import { StaffPayrollView } from './views/StaffPayrollView.jsx';
import { TruckPayrollView } from './views/TruckPayrollView.jsx';

export default function PrimeDepotPayroll() {
  // Authentication state. `user` is null when signed out; `authChecking` covers
  // the moment between page load and the session lookup returning, so the login
  // screen doesn't flash for someone who is already signed in.
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [legalPage, setLegalPage] = useState(null); // 'terms' | 'privacy' | null
  const [tab, setTab] = useState('dashboard');
  // Employees now come from the database instead of the in-memory seed. The
  // seed list is kept only as a fallback so the UI still renders if the API is
  // unreachable — a payroll screen that silently shows nothing is worse than
  // one that shows stale reference data with an error toast.
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);

  // Restore the session on load, so a refresh doesn't sign anyone out.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => { if (!cancelled) { setUser(data.user); setAuthChecking(false); } })
      .catch(() => { if (!cancelled) setAuthChecking(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Employee data is admin-only, so there is nothing to fetch until an admin
    // is actually signed in.
    if (!user || user.role !== 'ADMIN') return;
    let cancelled = false;
    fetch('/api/employees')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => {
        if (cancelled) return;
        setStaff(data.employees.filter((e) => !e.crew));
        setStaffLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Could not load employees:', err);
        setStaff(STAFF_INIT);
        setStaffLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  // Deliveries come from the database. The seed stays as a fallback for the
  // same reason the employee list does: a payroll screen showing nothing is
  // harder to diagnose than one showing stale data with an error logged.
  const [deliveries, setDeliveries] = useState(DELIVERIES_INIT);

  const reloadDeliveries = React.useCallback(async () => {
    try {
      const res = await fetch('/api/deliveries');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setDeliveries(deliveriesToLog(data.deliveries));
    } catch (err) {
      console.error('Could not load deliveries:', err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    reloadDeliveries();
  }, [user, reloadDeliveries]);

  // Piece rates come from the database so each row carries an id — that id is
  // what lets an edit or a retire target the right record. The seed list stays
  // as a fallback: the delivery form cannot function at all without rates, so
  // showing the last known table beats showing an empty dropdown.
  const [rates, setRates] = useState(RATES_INIT);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/rates')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => {
        if (cancelled) return;
        const active = data.rates.filter(r => r.isActive);
        if (active.length) setRates(active);
      })
      .catch(err => console.error('Could not load piece rates:', err));
    return () => { cancelled = true; };
  }, [user]);

  const [loans, setLoans] = useState(LOANS_INIT);
  const [checkers, setCheckers] = useState(CHECKERS_INIT);
  const [sssTable, setSssTable] = useState(SSS_TABLE_INIT);
  const [philhealthRates, setPhilhealthRates] = useState(PHILHEALTH_INIT);
  const [pagibigRates, setPagibigRates] = useState(PAGIBIG_INIT);
  const [birTable, setBirTable] = useState(BIR_TABLE_INIT);
  const statutory = { sss: sssTable, philhealth: philhealthRates, pagibig: pagibigRates, bir: birTable };
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
    setStaff([]);
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
        <div className="text-sm" style={{ fontFamily: F_BODY, color: T.sidebarSoft }}>Loading...</div>
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
    <CheckerView currentUser={user} onUserChange={u => setUser(prev => ({ ...prev, ...u }))} onSignedOut={() => { setUser(null); setTab('dashboard'); }} deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} onLogout={logout} toast={toast} />
  </>;

  const titles = {
    dashboard: 'Overview', employees: 'Employees', attendance: 'Attendance', truck: 'Truck Payroll',
    staff: 'Staff Payroll', loans: 'Loans & Advances', reports: 'Reports', settings: 'Settings',
    account: 'My Account',
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: T.bg, fontFamily: F_BODY }}>
      <style>{FONTS}</style>
      <Toasts toasts={toasts} />
      <Sidebar tab={tab} setTab={setTab} onLogout={logout} user={user} onOpenAccount={() => setTab('account')} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title={titles[tab]} role={user.displayName} cutoff="May 01–15" />
        <div className="flex-1 overflow-y-auto">
          {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} loans={loans} statutory={statutory} setTab={setTab} />}
          {tab === 'employees' && <EmployeesView staff={staff} setStaff={setStaff} toast={toast} />}
          {tab === 'attendance' && <AttendanceView staff={staff} toast={toast} />}
          {tab === 'truck' && <TruckPayrollView deliveries={deliveries} setDeliveries={setDeliveries} reloadDeliveries={reloadDeliveries} rates={rates} setRates={setRates} loans={loans} setLoans={setLoans} toast={toast} />}
          {tab === 'staff' && <StaffPayrollView staff={staff} loans={loans} setLoans={setLoans} statutory={statutory} toast={toast} />}
          {tab === 'loans' && <LoansView staff={staff} loans={loans} setLoans={setLoans} toast={toast} />}
          {tab === 'reports' && <ReportsView staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} />}
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
      </div>
      <div className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around py-2 z-10" style={{ backgroundColor: T.sidebar }}>
        {ADMIN_NAV.slice(0, 5).map(item => {
          const Icon = item.icon;
          return <button key={item.key} onClick={() => setTab(item.key)} className="p-2"><Icon size={18} color={tab === item.key ? '#fff' : T.sidebarSoft} /></button>;
        })}
      </div>
    </div>
  );
}
