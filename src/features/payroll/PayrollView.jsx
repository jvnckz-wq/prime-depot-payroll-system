'use client';
// Payroll section: shows Staff Payroll or Crew Payroll.

import React from 'react';
import { StaffPayrollView } from '@/features/payroll/StaffPayrollView.jsx';
import { CrewPayrollView } from '@/features/payroll/CrewPayrollView.jsx';

export const PayrollView = (props) => {
  const navSub = props.navSub || 'staff';
  const isCrew = navSub === 'crew';
  const staffView = navSub === 'staff-history' ? 'history' : 'current';
  return (
    <div>
      {!isCrew ? (
        <StaffPayrollView
          navView={staffView}
          staff={props.staff} loans={props.loans} reloadLoans={props.reloadLoans}
          statutory={props.statutory} toast={props.toast} cutoffLabel={props.cutoffLabel}
          reloadStaff={props.reloadStaff} loading={props.staffLoading} onNavigate={props.onNavigate} />
      ) : (
        <CrewPayrollView
          deliveries={props.deliveries}
          crewRates={props.crewRates} loans={props.loans} reloadLoans={props.reloadLoans}
          toast={props.toast} />
      )}
    </div>
  );
};
