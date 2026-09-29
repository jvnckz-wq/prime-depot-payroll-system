'use client';

// Loans & Advances. The sidebar picks one of three pages:
//   loans     active loans (installments), with Top-up and Pause
//   advances  cash advances per cutoff (staff only, deducted in full)
//   history   fully paid loans and deducted advances, read-only
// The rules behind all three live in src/lib/loan-rules.js.

import React from 'react';
import { currentCutoffPeriod } from '@/lib/utils';
import { cutoffOf, staffRunKey } from '@/lib/loan-rules';
import { LoansPage } from '@/features/loans/LoansPage.jsx';
import { CashAdvancesPage } from '@/features/loans/CashAdvancesPage.jsx';
import { LoanHistoryPage } from '@/features/loans/LoanHistoryPage.jsx';

export const LoansView = ({ navSub = 'loans', staff = [], loans = [], reloadLoans, statutory, cutoffPeriod, toast }) => {
  // The cutoff being paid: the latest imported attendance period, or the
  // calendar cutoff containing today (same fallback as the rest of the app).
  const raw = cutoffPeriod?.start && cutoffPeriod?.end ? cutoffPeriod : currentCutoffPeriod();
  // An import can cover part of a cutoff (e.g. Sep 16-29); dates and limits use
  // the full calendar cutoff it falls in.
  const period = cutoffOf(raw.start);
  // Same run key Staff Payroll stamps on this cutoff's deductions (it names
  // the calendar cutoff, whatever range the import covered).
  const runKey = staffRunKey(raw.start);

  if (navSub === 'advances') {
    return <CashAdvancesPage staff={staff} loans={loans} reloadLoans={reloadLoans} statutory={statutory} period={period} toast={toast} />;
  }
  if (navSub === 'history') return <LoanHistoryPage loans={loans} />;
  return <LoansPage staff={staff} loans={loans} reloadLoans={reloadLoans} period={period} runKey={runKey} toast={toast} />;
};
