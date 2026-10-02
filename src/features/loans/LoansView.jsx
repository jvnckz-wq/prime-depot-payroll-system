'use client';

import React from 'react';
import { currentCutoffPeriod } from '@/lib/utils';
import { cutoffOf, staffRunKey, todayYmdManila } from '@/lib/loan-rules';
import { LoansPage } from '@/features/loans/LoansPage.jsx';
import { CashAdvancesPage } from '@/features/loans/CashAdvancesPage.jsx';
import { LoanHistoryPage } from '@/features/loans/LoanHistoryPage.jsx';

export const LoansView = ({ navSub = 'loans', staff = [], loans = [], reloadLoans, statutory, cutoffPeriod, toast }) => {
  const raw = cutoffPeriod?.start && cutoffPeriod?.end ? cutoffPeriod : currentCutoffPeriod();
  const period = cutoffOf(raw.start);
  const runKey = staffRunKey(raw.start);

  if (navSub === 'advances') {
    return <CashAdvancesPage staff={staff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} period={cutoffOf(todayYmdManila())} toast={toast} />;
  }
  if (navSub === 'history') return <LoanHistoryPage loans={loans} />;
  return <LoansPage staff={staff} loans={loans} reloadLoans={reloadLoans} period={period} runKey={runKey} toast={toast} />;
};
