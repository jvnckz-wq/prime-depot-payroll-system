import { LayoutDashboard, Users, Clock, Truck, Wallet, Settings as SettingsIcon, FileText, BarChart3 } from 'lucide-react';

export const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: null },
  { key: 'payroll', label: 'Payroll', icon: FileText, group: 'Payroll', children: [
    { key: 'staff', label: 'Staff Payroll' },
    { key: 'crew', label: 'Crew (Truck) Payroll' },
    { key: 'staff-history', label: 'History' },
  ] },
  { key: 'loans', label: 'Loans', icon: Wallet, group: 'Payroll' },
  { key: 'employees', label: 'Employees', icon: Users, group: 'Workforce' },
  { key: 'attendance', label: 'Attendance', icon: Clock, group: 'Workforce', children: [
    { key: 'live', label: 'Live' },
    { key: 'dtr', label: 'Employee DTR' },
    { key: 'unmapped', label: 'Unmapped IDs' },
    { key: 'history', label: 'Import History' },
  ] },
  { key: 'deliveries', label: 'Deliveries', icon: Truck, group: 'Workforce' },
  { key: 'reports', label: 'Reports', icon: BarChart3, group: 'Administration', children: [
    { key: 'register', label: 'Payroll Register' },
    { key: 'remittance', label: 'Government Remittance' },
    { key: '13th', label: '13th Month Pay' },
    { key: 'drivers', label: 'Crew Earnings' },
    { key: 'bir', label: 'BIR Reference' },
  ] },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, group: 'Administration', children: [
    { key: 'statutory', label: 'Statutory Deductions' },
    { key: 'fleet', label: 'Fleet' },
    { key: 'backup', label: 'Backup' },
  ] },
];

export const ADMIN_NAV_GROUPS = ADMIN_NAV.reduce((acc, item) => {
  const last = acc[acc.length - 1];
  if (last && last.group === item.group) last.items.push(item);
  else acc.push({ group: item.group, items: [item] });
  return acc;
}, []);
