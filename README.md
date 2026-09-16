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

## Project layout

- `src/app/api` holds the backend. Each `route.js` file is one API endpoint, and its folder path is the URL.
- `src/lib` holds the shared business logic, such as payroll math, attendance parsing, and the statutory tables.
- `src/views` holds one screen per file, and `src/components` holds shared UI parts.
- `prisma/schema.prisma` is the database model.

There is a longer guide in `ARCHITECTURE.md` that maps each feature to its files.

## Getting started

You will need Node.js 18.18 or newer and a Neon PostgreSQL database.

1. Install the packages. This also generates the Prisma client.

   ```bash
   npm install
   ```

2. Create a file named `.env.local` in the project root with these values:

   ```
   DATABASE_URL=your_pooled_neon_connection_string
   DATABASE_URL_UNPOOLED=your_direct_neon_connection_string
   EMAIL_USER=the_gmail_address_used_to_send_email
   EMAIL_APP_PASSWORD=the_gmail_app_password
   SEED_ADMIN_PASSWORD=the_first_admin_password
   ```

   The email values are only needed for password reset and email verification. The pooled URL is used by the app, and the unpooled URL is used for schema changes.

3. Set up the database tables. You can apply the migration history:

   ```bash
   npx prisma migrate deploy
   ```

   Or create the tables directly from the current schema:

   ```bash
   npx prisma db push
   ```

   Then generate the Prisma client if it was not generated already:

   ```bash
   npx prisma generate
   ```

4. Seed the first admin account and the starting reference data. This is safe to run more than once, and the admin password comes from `SEED_ADMIN_PASSWORD`:

   ```bash
   npx tsx prisma/seed.ts
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 in your browser.

## Scripts

- `npm run dev` starts the development server.
- `npm run build` builds the app for production.
- `npm run start` runs the built app.
- `npm run lint` checks the code with ESLint.

## Deployment

The app is hosted on Vercel. Set the same environment variables in the Vercel project settings. Vercel builds and deploys automatically on every push to the main branch.

## Notes on the database

The datasource in `prisma/schema.prisma` only declares the provider. The running app connects through a driver adapter, and the connection string for schema work is read from the environment. When you add a column or table, apply the change to the database first, then run `npx prisma generate`, then restart the server so the app picks up the new client.
