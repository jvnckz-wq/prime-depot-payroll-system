'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { H1, Panel } from '../components/ui.jsx';
import { F_BODY, F_HEAD, T } from '../theme';

// Practical help for the day-to-day operator, reached from the bottom of the
// sidebar. Written around the real flows so it also doubles as a quick refresher.
const FAQS = [
  {
    q: 'How do I get attendance into a cutoff for payroll?',
    a: 'Attendance shows in real time on Attendance → Live while the device agent is running. For payroll, use "Pull from device" on the Payroll or Reports view to bring in the whole cutoff at once (present days and absences). Importing the .xls export from the device is still there as a fallback.',
  },
  {
    q: 'How do I run payroll?',
    a: 'Open Payroll → Staff Payroll (or Crew (Truck) Payroll). Review each payslip and make any manual corrections, then press Finalize / Release. Reviewing attendance and running payroll are separate steps, so nothing is paid automatically.',
  },
  {
    q: 'Why is an employee missing from Staff Payroll?',
    a: 'They have no attendance for this cutoff yet. Employees without attendance are hidden so the totals are not inflated by assumed pay. Pull (or import) the cutoff attendance first and they will appear.',
  },
  {
    q: 'What are "Unmapped IDs"?',
    a: 'These are device scans whose biometric User ID has no matching employee in the system. Enroll the employee on the device using their Employee ID, then pull again so their scans attach to them.',
  },
  {
    q: 'The Live status says Offline or Reconnecting. What does that mean?',
    a: 'It reflects the device link, not your browser. Offline means the sync agent on the warehouse PC has not reported recently. Check that the device is powered on and on the network, and that the agent is running on the warehouse PC.',
  },
  {
    q: 'How are loans and cash advances deducted?',
    a: 'Record them under Loans. There is no interest — only the principal. The balance is deducted every cutoff automatically until it is fully paid.',
  },
  {
    q: 'Where do I see past cutoffs and imports?',
    a: 'Released payroll is under Payroll → History. Past attendance imports and device pulls are under Attendance → Import History. To review a specific past day, use the date arrows on Attendance → Live.',
  },
  {
    q: 'Who gets government contributions (SSS, PhilHealth, Pag-IBIG)?',
    a: 'Regular office staff. Crew and other non-regular workers receive 13th month pay only and have no government contributions, so they do not appear on the Government Remittance report.',
  },
];

const FaqItem = ({ q, a, open, onToggle }) => (
  <div style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center justify-between gap-4 text-left"
      style={{ padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <span style={{ fontFamily: F_HEAD, fontWeight: 600, fontSize: 14.5, color: T.ink }}>{q}</span>
      <ChevronDown size={17} color={T.soft} style={{ flex: '0 0 17px', transition: 'transform .18s ease', transform: open ? 'rotate(180deg)' : 'none' }} />
    </button>
    {open && (
      <div style={{ padding: '0 18px 16px', fontFamily: F_BODY, fontSize: 13.5, lineHeight: 1.6, color: T.soft }}>{a}</div>
    )}
  </div>
);

export const FAQView = () => {
  const [open, setOpen] = useState(0);
  return (
    <div className="p-4 sm:p-6">
      <H1>FAQs</H1>
      <p className="mb-4" style={{ fontFamily: F_BODY, fontSize: 13.5, color: T.soft }}>
        Quick answers for everyday use of the payroll and attendance system.
      </p>
      <Panel className="overflow-hidden" style={{ padding: 0 }}>
        {FAQS.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        ))}
      </Panel>
    </div>
  );
};
