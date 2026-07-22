'use client';

import React, { useState } from 'react';
import { Sidebar, TopBar } from './components/Nav.jsx';
import { Toasts } from './components/ui.jsx';
import { ADMIN_NAV, BIR_TABLE_INIT, CHECKERS_INIT, DELIVERIES_INIT, LOANS_INIT, PAGIBIG_INIT, PHILHEALTH_INIT, RATES_INIT, SSS_TABLE_INIT, STAFF_INIT } from './data/seed';
import { uid } from './lib/utils';
import { FONTS, F_BODY, T } from './theme';
import { AttendanceView } from './views/AttendanceView.jsx';
import { CheckerView } from './views/CheckerView.jsx';
import { DashboardView } from './views/DashboardView.jsx';
import { EmployeesView } from './views/EmployeesView.jsx';
import { LoansView } from './views/LoansView.jsx';
import { LoginView } from './views/LoginView.jsx';
import { ReportsView } from './views/ReportsView.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { StaffPayrollView } from './views/StaffPayrollView.jsx';
import { TruckPayrollView } from './views/TruckPayrollView.jsx';

export default function PrimeDepotPayroll() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [staff, setStaff] = useState(STAFF_INIT);
  const [deliveries, setDeliveries] = useState(DELIVERIES_INIT);
  const [rates, setRates] = useState(RATES_INIT);
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

  if (!role) return <LoginView onLogin={setRole} />;
  if (role === 'checker') return <>
    <Toasts toasts={toasts} />
    <CheckerView deliveries={deliveries} setDeliveries={setDeliveries} rates={rates} onLogout={() => setRole(null)} toast={toast} />
  </>;

  const titles = {
    dashboard: 'Overview', employees: 'Employees', attendance: 'Attendance', truck: 'Truck Payroll',
    staff: 'Staff Payroll', loans: 'Loans & Advances', reports: 'Reports', settings: 'Settings',
  };

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: T.bg, fontFamily: F_BODY }}>
      <style>{FONTS}</style>
      <Toasts toasts={toasts} />
      <Sidebar tab={tab} setTab={setTab} onLogout={() => setRole(null)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title={titles[tab]} role={role} cutoff="May 01–15" />
        <div className="flex-1 overflow-y-auto">
          {tab === 'dashboard' && <DashboardView deliveries={deliveries} staff={staff} loans={loans} statutory={statutory} setTab={setTab} />}
          {tab === 'employees' && <EmployeesView staff={staff} setStaff={setStaff} toast={toast} />}
          {tab === 'attendance' && <AttendanceView staff={staff} toast={toast} />}
          {tab === 'truck' && <TruckPayrollView deliveries={deliveries} setDeliveries={setDeliveries} rates={rates} setRates={setRates} loans={loans} setLoans={setLoans} toast={toast} />}
          {tab === 'staff' && <StaffPayrollView staff={staff} loans={loans} setLoans={setLoans} statutory={statutory} toast={toast} />}
          {tab === 'loans' && <LoansView staff={staff} loans={loans} setLoans={setLoans} toast={toast} />}
          {tab === 'reports' && <ReportsView staff={staff} deliveries={deliveries} loans={loans} statutory={statutory} />}
          {tab === 'settings' && <SettingsView checkers={checkers} setCheckers={setCheckers} sssTable={sssTable} setSssTable={setSssTable} philhealthRates={philhealthRates} setPhilhealthRates={setPhilhealthRates} pagibigRates={pagibigRates} setPagibigRates={setPagibigRates} birTable={birTable} setBirTable={setBirTable} toast={toast} />}
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
