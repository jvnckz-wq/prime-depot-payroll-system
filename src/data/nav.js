// Sidebar navigation for the Operations Head.
//
// Split out of data/seed.js so that file stays free of UI imports. seed.js is
// pulled in by lib/payroll.js, which the payroll finalize route now runs
// server-side — and dragging the whole icon library into a serverless function
// to compute somebody's net pay is dead weight. Icons belong with the nav that
// uses them.

import { LayoutDashboard, Users, Clock, Truck, Wallet, Settings as SettingsIcon, FileText, BarChart3 } from 'lucide-react';

// Sidebar destinations. `group` is presentation only — the Sidebar renders one
// labelled section per group, in the order the groups first appear here. Eight
// undifferentiated links made every screen look equally important and forced you
// to read the whole list to find anything; grouping them by what you are doing
// (paying people vs. managing people) makes the list scannable at a glance.
// `null` means the item stands on its own, outside any section.
export const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: null },
  { key: 'truck', label: 'Truck Payroll', icon: Truck, group: 'Payroll' },
  { key: 'staff', label: 'Staff Payroll', icon: FileText, group: 'Payroll' },
  { key: 'loans', label: 'Loans', icon: Wallet, group: 'Payroll' },
  { key: 'employees', label: 'Employees', icon: Users, group: 'Workforce' },
  { key: 'attendance', label: 'Attendance', icon: Clock, group: 'Workforce' },
  { key: 'reports', label: 'Reports', icon: BarChart3, group: 'Administration' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, group: 'Administration' },
];

// ADMIN_NAV in render order, collapsed into [{ group, items }]. Kept next to the
// data it derives from so a new nav entry only ever needs adding above.
export const ADMIN_NAV_GROUPS = ADMIN_NAV.reduce((acc, item) => {
  const last = acc[acc.length - 1];
  if (last && last.group === item.group) last.items.push(item);
  else acc.push({ group: item.group, items: [item] });
  return acc;
}, []);
