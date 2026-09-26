'use client';

import React from 'react';
import { StaffPayrollView } from './StaffPayrollView.jsx';
import { TruckPayrollView } from './TruckPayrollView.jsx';

// Staff and Crew payroll live in the sidebar now (Payroll -> Staff Payroll /
// Staff History / Crew Payroll), so this wrapper only maps the sidebar choice
// to the right inner view. navSub: 'staff' | 'staff-history' | 'crew'.
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
          reloadStaff={props.reloadStaff} loading={props.staffLoading} />
      ) : (
        <TruckPayrollView
          mode="payslips"
          deliveries={props.deliveries} setDeliveries={props.setDeliveries}
          reloadDeliveries={props.reloadDeliveries} rates={props.rates} setRates={props.setRates}
          crewRates={props.crewRates} loans={props.loans} reloadLoans={props.reloadLoans}
          crewNames={props.crewNames} toast={props.toast} />
      )}
    </div>
  );
};
