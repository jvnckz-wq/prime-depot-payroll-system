'use client';

import React, { useState } from 'react';
import { StaffPayrollView } from './StaffPayrollView.jsx';
import { TruckPayrollView } from './TruckPayrollView.jsx';
import { F_HEAD, T } from '../theme';

// #H15 — Staff and Crew payroll are now two tabs of a single "Payroll" section
// instead of two separate sidebar items. Loans stays on its own nav item. Each
// inner view is rendered unchanged; this wrapper only adds the tab switch.
export const PayrollView = (props) => {
  const [sub, setSub] = useState('staff');
  return (
    <div>
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="inline-flex gap-1 rounded-md p-0.5" style={{ backgroundColor: T.lineSoft }}>
          {[['staff', 'Staff Payroll'], ['crew', 'Crew (Truck) Payroll']].map(([k, l]) => (
            <button key={k} onClick={() => setSub(k)} className="px-3.5 py-1.5 rounded text-xs font-semibold"
              style={{ fontFamily: F_HEAD, backgroundColor: sub === k ? T.surface : 'transparent', color: sub === k ? T.ink : T.soft }}>{l}</button>
          ))}
        </div>
      </div>
      {sub === 'staff' ? (
        <StaffPayrollView
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
