'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Btn, Eyebrow, Panel } from '../components/ui.jsx';
import { F_BODY, F_HEAD, T } from '../theme';

// Terms and Conditions + Privacy Policy.
//
// A note on what these are for. This is not a public app — nobody signs up, and
// only two accounts exist. So the Terms here are not consumer terms; they are
// the conditions of use for the two people entrusted with the system.
//
// The Privacy Policy matters more, and its audience is not the user reading the
// screen — it is the EMPLOYEES whose personal information the system holds.
// Under the Data Privacy Act of 2012 (RA 10173), people whose data is processed
// are entitled to know what is collected, why, how long it is kept, who can see
// it, and what rights they have over it. That is what the second half sets out.
//
// This text is written for an academic system. A live deployment handling real
// employee records should have it reviewed by someone qualified, and the
// company details filled in.

const Section = ({ n, title, children }) => (
  <div className="mb-6">
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="text-sm font-bold tabular-nums" style={{ fontFamily: F_HEAD, color: T.brand }}>{n}</span>
      <h3 className="text-base font-bold" style={{ fontFamily: F_HEAD, color: T.ink }}>{title}</h3>
    </div>
    <div className="text-sm space-y-2" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.65 }}>{children}</div>
  </div>
);

const Bullets = ({ items }) => (
  <ul className="space-y-1 pl-1">
    {items.map((t, i) => (
      <li key={i} className="flex gap-2">
        <span style={{ color: T.brand }}>·</span><span>{t}</span>
      </li>
    ))}
  </ul>
);

export const LegalView = ({ initialTab = 'terms', onBack, embedded = false }) => {
  const [tab, setTab] = React.useState(initialTab);

  const body = (
    <Panel className="p-6 md:p-8">
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: T.lineSoft }}>
        {[['terms', 'Terms and Conditions'], ['privacy', 'Privacy Policy']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="px-4 py-2.5 text-sm font-semibold"
            style={{
              fontFamily: F_HEAD,
              color: tab === k ? T.ink : T.soft,
              borderBottom: tab === k ? `2px solid ${T.brand}` : '2px solid transparent',
            }}>{label}</button>
        ))}
      </div>

      {tab === 'terms' && (
        <div>
          <Eyebrow>Effective July 2026 · Prime Depot Hardware &amp; Construction Supply</Eyebrow>
          <p className="text-sm mt-2 mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
            These terms govern the use of the Prime Depot Payroll Management System. The system is
            internal to the company. It is not open to the public, and accounts are issued only by the
            Operations Head.
          </p>

          <Section n="1" title="Who may use this system">
            <p>Access is limited to two roles:</p>
            <Bullets items={[
              'Operations Head (Administrator) — full access to employee records, attendance, payroll, loans, reports, and settings.',
              'Checker — may log deliveries only. No access to employee records, personal information, payroll figures, loans, or settings.',
            ]} />
            <p>There is no public registration. Attempting to access functions outside your role is a misuse of the system.</p>
          </Section>

          <Section n="2" title="Your account is yours alone">
            <Bullets items={[
              'Do not share your password with anyone, including co-workers and management.',
              'Change the temporary password given to you on your first sign-in.',
              'Sign out when you leave the computer, especially on shared machines.',
              'Report a password you believe someone else knows to the Operations Head so it can be reset.',
            ]} />
            <p>Actions taken through your account are recorded against your account. Sharing it makes that record meaningless.</p>
          </Section>

          <Section n="3" title="Confidentiality of payroll information">
            <p>
              This system contains salaries, deductions, loan balances, and personal details of real
              employees. Information seen while using the system must not be discussed, copied,
              photographed, or shared outside the company, including after leaving employment.
            </p>
          </Section>

          <Section n="4" title="Accuracy of entries">
            <p>
              Delivery logs, attendance corrections, and loan entries directly determine what people are
              paid. Entries must reflect what actually happened. Manual attendance edits are recorded as
              manual, and corrections are added as new entries rather than by overwriting history.
            </p>
          </Section>

          <Section n="5" title="Availability">
            <p>
              The system is provided for company use as-is. Payroll records should continue to be backed
              up independently. The company remains responsible for meeting its statutory obligations
              regardless of system availability.
            </p>
          </Section>

          <Section n="6" title="Changes to these terms">
            <p>
              These terms may be updated as the system changes. Continued use after an update means the
              current terms apply.
            </p>
          </Section>
        </div>
      )}

      {tab === 'privacy' && (
        <div>
          <Eyebrow>Effective July 2026 · Prime Depot Hardware &amp; Construction Supply</Eyebrow>
          <p className="text-sm mt-2 mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
            This policy explains how the Prime Depot Payroll Management System collects and handles the
            personal information of company employees, in line with the Data Privacy Act of 2012
            (Republic Act No. 10173).
          </p>

          <Section n="1" title="What information is collected">
            <p>For every employee on the payroll:</p>
            <Bullets items={[
              'Identification — employee ID number, full name, position, date hired, employment status.',
              'Contact and personal details — address, contact number, birthdate.',
              'Attendance — daily time-in and time-out records imported from the biometric scanner, tardiness, overtime, and absences.',
              'Compensation — daily rate, declared salary, allowances, overtime pay, and for truck crews, delivery records and piece-rate earnings.',
              'Deductions — SSS, PhilHealth, Pag-IBIG, withholding tax, and loan or cash advance balances.',
            ]} />
          </Section>

          <Section n="2" title="Why it is collected">
            <p>Personal information is processed only for purposes connected to employment:</p>
            <Bullets items={[
              'Computing salaries, overtime, deductions, and net pay each cutoff.',
              'Remitting mandatory government contributions and withholding tax.',
              'Maintaining attendance and payroll records required of employers.',
              'Tracking loans and cash advances, and their repayment.',
              'Producing payslips and statutory reports.',
            ]} />
            <p>
              Information is not used for any purpose unrelated to employment, and is not sold, rented,
              or shared for marketing.
            </p>
          </Section>

          <Section n="3" title="Who can see it">
            <Bullets items={[
              'The Operations Head, who administers payroll.',
              'Checkers can see only delivery records they log — never employee records, personal details, salaries, or loan balances.',
              'Government agencies (SSS, PhilHealth, Pag-IBIG, BIR) receive only what the law requires for remittances and filings.',
            ]} />
            <p>
              Payslips deliberately omit addresses, contact numbers, and birthdates. Only the information
              needed to explain the pay computation is printed.
            </p>
          </Section>

          <Section n="4" title="How it is protected">
            <Bullets items={[
              'Accounts are individually issued, with passwords stored as one-way hashes that cannot be read back.',
              'Every request is checked on the server against the role of the signed-in user, so restrictions cannot be bypassed by editing the page.',
              'Repeated failed sign-in attempts are throttled.',
              'Records are stored in a hosted PostgreSQL database with access restricted to the system.',
              'Attendance edits and loan entries are recorded with dates, so figures can be traced and explained.',
            ]} />
          </Section>

          <Section n="5" title="How long it is kept">
            <p>
              Payroll and attendance records are retained for as long as employment records must be kept
              under Philippine labour and tax rules, and are disposed of securely afterwards. Records of
              former employees are retained for the same period, then removed.
            </p>
          </Section>

          <Section n="6" title="Your rights as an employee">
            <p>Under the Data Privacy Act, employees whose information is held here have the right to:</p>
            <Bullets items={[
              'Be informed that their personal information is being processed.',
              'Access their own records, including their payslips and attendance history.',
              'Correct information that is inaccurate or out of date.',
              'Object to processing, or request erasure or blocking, where the law allows.',
              'Be told if a security incident affects their information.',
              'Lodge a complaint with the National Privacy Commission.',
            ]} />
            <p>
              To exercise any of these, or to ask a question about this policy, speak to the Operations
              Head.
            </p>
          </Section>

          <div className="mt-6 pt-4 text-xs" style={{ borderTop: `1px solid ${T.lineSoft}`, fontFamily: F_BODY, color: T.soft, lineHeight: 1.6 }}>
            This policy accompanies an academic capstone system. Before the system is used to process
            real employee records in production, this text should be reviewed by a qualified person and
            the company&apos;s contact details for privacy concerns should be added.
          </div>
        </div>
      )}
    </Panel>
  );

  if (embedded) return body;

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: T.bg }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <Btn variant="outline" size="sm" icon={ArrowLeft} onClick={onBack}>Back to sign in</Btn>
        </div>
        {body}
      </div>
    </div>
  );
};
