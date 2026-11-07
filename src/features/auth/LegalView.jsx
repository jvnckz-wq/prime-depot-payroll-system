'use client';
// Terms of Use and Privacy Policy pages. The privacy policy follows RA 10173 Sec. 16(b);
// the reviewed draft with the source of every section is in the Claude Doc
// "Prime Depot: Bagong Terms of Use at Privacy Policy (Draft)".

import React from 'react';

import { Btn, Eyebrow, Panel } from '@/components/ui';
import { F_BODY, F_HEAD, T } from '@/styles/theme';

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
          <Eyebrow>Last updated November 7, 2026 · Prime Depot Hardware &amp; Construction Supply</Eyebrow>
          <p className="text-sm mt-2 mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
            These terms govern the use of the Prime Depot Payroll Management System, an internal system of
            Prime Depot Hardware and Construction Supply. It is not open to the public. Accounts are created
            only by the Operations Head.
          </p>
          <Section n="1" title="Who may use the system">
            <Bullets items={[
              <><b>Operations Head (Administrator):</b> full access to employee records, attendance, payroll, loans, deliveries, reports, and settings.</>,
              <><b>Checker:</b> may log deliveries only, and only while on duty (after timing in and before timing out on the biometric device). Checkers cannot see employee records, salaries, loans, or settings.</>,
            ]} />
            <p>There is no public registration. Using functions outside your role is a misuse of the system.</p>
          </Section>
          <Section n="2" title="Your account">
            <Bullets items={[
              'Your account is for you alone. Do not share your password with anyone.',
              'Change the temporary password given to you on your first sign-in.',
              'The Operations Head signs in with two-factor authentication using an authenticator app, and keeps the one-time backup codes in a safe place.',
              'The system signs you out after 15 minutes without activity. Sign out yourself when you leave the computer.',
              'If you think someone else knows your password, tell the Operations Head so it can be reset.',
            ]} />
            <p>Actions taken through your account are recorded under your name.</p>
          </Section>
          <Section n="3" title="Confidentiality">
            <p>
              The system holds the salaries, deductions, loan balances, attendance, and personal details of real
              employees, and the names, addresses, and contact numbers of customers. Do not discuss, copy,
              photograph, or share this information outside your work. This duty continues even after you
              leave the company.
            </p>
          </Section>
          <Section n="4" title="Accurate entries">
            <p>Attendance, deliveries, and loans directly decide what people are paid, so every entry must reflect what actually happened.</p>
            <Bullets items={[
              'Attendance corrections are marked as manual and carry a note.',
              "Trips that do not match the crew's or the checker's attendance are held for review by the Operations Head.",
              'A finalized payroll is locked. It can be un-finalized only on the day it was finalized, with a written reason, and that action is recorded.',
            ]} />
          </Section>
          <Section n="5" title="Prohibited use">
            <p>
              Do not try to access accounts, records, or functions you are not allowed to use, change records to
              alter anyone&apos;s pay, or get around the system&apos;s checks. Misuse may lead to disciplinary action
              under company rules, and unauthorized access to personal information is punishable under the Data
              Privacy Act of 2012 and the Cybercrime Prevention Act of 2012.
            </p>
          </Section>
          <Section n="6" title="Records and availability">
            <p>
              The system records sign-ins, password and account changes, payroll finalization, rate changes, and
              delivery reviews, with who did them and when. The company remains responsible for its legal
              obligations to employees and the government, whether or not the system is available, and keeps its
              own backups of payroll records.
            </p>
          </Section>
          <Section n="7" title="Changes to these terms">
            <p>These terms may be updated when the system changes. Users will be told before an update takes effect.</p>
          </Section>
        </div>
      )}
      {tab === 'privacy' && (
        <div>
          <Eyebrow>Last updated November 7, 2026 · Prime Depot Hardware &amp; Construction Supply</Eyebrow>
          <p className="text-sm mt-2 mb-6" style={{ fontFamily: F_BODY, color: T.soft, lineHeight: 1.65 }}>
            Prime Depot Hardware and Construction Supply (&ldquo;the company&rdquo;) uses this system to compute payroll
            and monitor attendance. This policy explains what personal information the system processes, why,
            and how it is protected, in line with the Data Privacy Act of 2012 (Republic Act No. 10173).
          </p>
          <Section n="1" title="Information we process">
            <p>
              <b>Employees:</b> employee ID, name, position, employment status, date hired, address, contact number,
              and birthdate; daily rate, declared salary, and allowances; attendance (time in, time out, late
              minutes, overtime, leave, and absences); SSS, PhilHealth, and Pag-IBIG contributions and withholding
              tax; loans and cash advances; payslips; and, for the delivery crew, trips and piece-rate earnings.
            </p>
            <p>
              <b>Fingerprints:</b> fingerprints are stored only on the biometric device and never leave it. The
              system receives only the employee&apos;s ID number, the name saved on the device, and the time of each scan.
            </p>
            <p>
              <b>Delivery customers:</b> name, delivery address and landmark, and contact number, entered when a
              delivery is logged.
            </p>
            <p>
              <b>System users:</b> username, display name, profile photo if added, the Operations Head&apos;s recovery
              email, and sign-in records, including the IP address used.
            </p>
          </Section>
          <Section n="2" title="Why we process it">
            <Bullets items={[
              'To compute salaries, overtime, deductions, and net pay each cutoff.',
              'To remit SSS, PhilHealth, and Pag-IBIG contributions and withholding tax.',
              'To keep the payroll and attendance records that employers are required to keep.',
              'To track loans and cash advances and their repayment.',
              "To record deliveries, compute the crew's pay, and contact customers about their delivery.",
              'To keep the system secure.',
            ]} />
            <p>Personal information is not sold or used for marketing.</p>
          </Section>
          <Section n="3" title="How it is processed">
            <p>
              Information is entered by the Operations Head, recorded by the biometric device through the
              company&apos;s sync agent or a file imported from the device, and entered by checkers when they log
              deliveries. The system computes pay automatically using the company&apos;s rules, but every payroll is
              reviewed and finalized by the Operations Head.
            </p>
          </Section>
          <Section n="4" title="Who receives it">
            <Bullets items={[
              <><b>The Operations Head</b>, who administers payroll.</>,
              <><b>Checkers</b>, who see only delivery information: the crew, the items, and the customer&apos;s delivery details.</>,
              <><b>Government agencies</b> (SSS, PhilHealth, Pag-IBIG, and BIR), only as the law requires.</>,
              <><b>Service providers</b> that host or send data for the company: Vercel (runs the application), Neon (stores the database), and Google Gmail (sends password reset codes). They process the information only to provide these services.</>,
            ]} />
            <p>Printed payslips show only what is needed to explain the pay; they leave out addresses, contact numbers, and birthdates.</p>
          </Section>
          <Section n="5" title="Who to contact">
            <p>
              The company controls this information: Prime Depot Hardware and Construction Supply, Brgy. P. Niogan,
              Mabini, Batangas. For questions, requests, or complaints about your personal information, contact the
              Operations Head at the office. The company designates the person responsible for its compliance with
              the Data Privacy Act, and will tell you who that is on request.
            </p>
          </Section>
          <Section n="6" title="How long it is kept">
            <p>
              Payroll, payslips, and attendance records are kept for at least three years from the last entry, as
              required of employers, and longer when tax rules or a pending claim require it. Delivery records are
              kept for the same period because they support the crew&apos;s pay. Afterwards, records are disposed of
              securely.
            </p>
          </Section>
          <Section n="7" title="Your rights">
            <p>Under the Data Privacy Act, you have the right to:</p>
            <Bullets items={[
              'be informed that your personal information is being processed;',
              'access your information, including your payslips and attendance;',
              'have inaccurate information corrected, such as a wrong time in your attendance;',
              'object to processing, or ask for your information to be blocked or removed, where the law allows;',
              'get a copy of your information in a common electronic format;',
              'be compensated for damage caused by inaccurate or unlawfully used information; and',
              'file a complaint with the National Privacy Commission.',
            ]} />
            <p>These rights can also be exercised by your heirs or authorized representatives. To exercise any of them, contact the Operations Head.</p>
          </Section>
          <Section n="8" title="How it is protected">
            <Bullets items={[
              'Passwords are stored only as one-way hashes that cannot be read back.',
              'The Operations Head signs in with two-factor authentication.',
              "Every request is checked on the server against the user's role, and all traffic is encrypted (HTTPS).",
              'Repeated wrong sign-ins are slowed down, and idle sessions end after 15 minutes.',
              'Sign-ins, account changes, and payroll actions are recorded with who did them and when.',
              'Finalized payroll is locked and cannot be changed after the day it was finalized.',
            ]} />
            <p>
              If a security breach is likely to cause real harm to anyone affected, the company will notify the
              National Privacy Commission and the affected persons as the law requires.
            </p>
          </Section>
          <Section n="9" title="Changes to this policy">
            <p>If this policy changes, you will be told before the change takes effect.</p>
          </Section>
        </div>
      )}
    </Panel>
  );

  if (embedded) return body;

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: T.bg }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <Btn variant="outline" size="sm" onClick={onBack}>Back to sign in</Btn>
        </div>
        {body}
      </div>
    </div>
  );
};
