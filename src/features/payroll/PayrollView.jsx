'use client';

import React from 'react';
import { StaffPayrollView } from '@/features/payroll/StaffPayrollView.jsx';
import { TruckPayrollView } from '@/features/payroll/TruckPayrollView.jsx';

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
