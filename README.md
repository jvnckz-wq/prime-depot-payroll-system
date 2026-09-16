# Prime Depot Payroll System

A web-based payroll and attendance system for Prime Depot Hardware and Construction Supply in Mabini, Batangas. It handles two kinds of pay in one place: office staff on a monthly salary with government deductions, and truck crew who are paid per delivery (pakyawan). Attendance comes from a biometric device, so the payroll is based on real time records.

Live site: https://prime-depot-payroll-system.vercel.app

## What it does

The system replaces the old manual, spreadsheet-based payroll. In short, it lets the Operations Head:

- Import attendance from the biometric device, review each person's Daily Time Record, and track leave credits.
- Compute office staff salaries with SSS, PhilHealth, Pag-IBIG, and withholding tax, then print payslips.
- Log truck deliveries, apply the piece rates (with an optional double rate for far or hard routes), and compute each crew member's pay.
- Keep employee records for both staff and crew, deactivate a person who leaves, and produce a final pay slip.
- Record loans and apply the deductions to payroll.
- Finalize a cutoff so the records for that period become the official copy, and look back on past cutoffs.
- Export data and view simple reports.

## Who uses it

- Operations Head (admin): full access to everything above. There is only one admin account.
- Checker: can log deliveries only. Checker accounts are created by the admin.

Accounts are never deleted, only deactivated, so the delivery and payroll history stays complete.

## Security

- Password login with a forced password change on first sign in.
- Two-factor authentication (authenticator app plus backup codes) for the admin.
- Password reset by verified email.
- Sensitive actions are written to an audit log.

## Tech stack

- Next.js (App Router) and React for the app.
- Tailwind CSS for styling.
- Prisma with a Neon PostgreSQL database.
- Deployed on Vercel.
- Supporting libraries: recharts (charts), xlsx (Excel import and export), node-zklib (biometric device), nodemailer (email), otplib and qrcode (two-factor).

The code is JavaScript. A few helper scripts under the project use TypeScript.
