# Code Map

This page is a short tour of the code for someone new to it. It says what each folder holds, follows three pieces of data through the system, and explains the business words used in the code.

## Folders

### `src/app`
The Next.js App Router folder. `page.js` is the only page: it shows the whole app (see `src/components/layout/AppShell.jsx`). `layout.js` wraps every page with the fonts and the global styles.

### `src/app/api`
The backend. Each folder is a URL, and each `route.js` exports one function per HTTP method (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`). For example, `src/app/api/deliveries/route.js` answers `GET /api/deliveries` and `POST /api/deliveries`. Every route first checks who is calling: most need a signed-in user or the admin. The two device routes (`attendance/push` and `attendance/pull`) check the sync token instead, and the sign-in and password reset steps work before anyone is signed in.

### `src/components`
Pieces of screen that more than one feature uses. `CodeBoxes.jsx` is the box-per-character input for sign-in and backup codes.

### `src/components/ui`
Small building blocks such as buttons (`Btn`), tables (`Th`, `Td`), dialogs (`Modal`, `Confirm`), form fields (`Field`) and cards (`Panel`). Each one has its own file, and `index.js` re-exports them all, so screens write `import { Btn, Panel } from '@/components/ui'`.

### `src/components/layout`
The frame around the screens. `AppShell.jsx` is the app shell: it signs the user in, loads the shared data (employees, loans, deliveries, rates), and shows the screen picked in the sidebar through `TabContent.jsx` (one line per tab). `Nav.jsx` is the sidebar and top bar, `nav-items.js` lists the sidebar menu, and `IdleTimeout.jsx` signs the user out after a period with no activity.

### `src/features`
One folder per area of the app. Each holds the screens for that area.
- `attendance`: the Attendance screen. `AttendanceView.jsx` holds the shared state and shows one file per tab (`LiveTab.jsx`, `CutoffsTab.jsx` for Employee DTR, `UnmappedTab.jsx`, `HistoryTab.jsx`), plus `EmployeeDtr.jsx` for one employee's DTR. Date and cutoff helpers are in `attendance-helpers.js`.
- `auth`: sign-in, My Account (`AccountPage.jsx`, with its dialogs in `account/`), two-factor setup, the first sign-in password change, and the legal pages.
- `dashboard`: the Dashboard with headcount, this cutoff's payroll and deliveries.
- `deliveries`: the Deliveries screen (`DeliveriesView.jsx`), the delivery form, the delivery list, the Checker's screen, and the day picker shared with Crew Payroll (`DayBar.jsx`, `useDeliveryDay.js`).
- `employees`: the Employees screen (add, edit, deactivate).
- `loans`: the Loans, Cash Advances and Loan History pages, and the new loan dialog.
- `payroll`: Staff Payroll, Crew Payroll (`CrewPayrollView.jsx`) and Final Pay.
- `reports`: payroll register, government remittance, 13th month, crew earnings and withholding tax reports.
- `settings`: the government contribution tables, the fleet, the piece rates (`PieceRatesPanel.jsx`), checker accounts and the audit log.

### `src/lib`
Rules and helpers with no screen of their own. The payroll rules live here: `payroll.js` (staff pay, contributions, crew pay), `loan-rules.js` (cutoffs and loan deductions), `withholding.js`, `thirteenth-month.js`, `attendance.js` (call times, lateness, overtime) and `positions.js`. These files run in the browser for previews and on the server for the real result. They use relative imports, so the tests can load them with plain Node.

### `src/lib/server/db`
The Prisma database client (`prisma.js`) and a helper that retries a database call when the connection drops (`db-retry.js`). Server only.

### `src/lib/server/integrations`
Outside services. `email.js` sends password reset and email confirmation codes through Gmail.

### `src/lib/server/security`
Sign-in and safety: passwords, sessions, roles and the audit log (`auth.js`), two-factor codes (`twofactor.js`), and upload limits (`uploads.js`).

### `src/lib/server/services`
Business logic that needs the database: loading payroll inputs (`payroll-inputs.js`), writing loan deductions (`loans-apply.js`), shaping employee and loan records, reading device exports, and locking released cutoffs.

### `src/styles`
`globals.css` (Tailwind and shared CSS classes) and `theme.js` (the colors and fonts every screen uses).

### `prisma`
`schema.prisma` describes every database table. `migrations/` holds the SQL that built the database, one folder per change, and must never be edited. `seed.ts` fills a new database with starting data.

### `scripts`
Programs that run outside the web app. `sync-agent.js` runs on the warehouse laptop and sends biometric scans to the app. `pull-cutoff.js` reads a whole cutoff from the device. `admin/` has maintenance scripts, and `sql/` keeps one-off SQL scripts that were run by hand.

### `tests`
Automated checks, one file per area, each run by a `test:*` script in `package.json`. `golden-payroll.test.cjs` compares the payroll results for fixed inputs with `fixtures/golden-payroll.json`, so a change to any payroll number is caught.

## Follow the data

### (a) A biometric scan becomes a staff payslip
1. **Device to app.** `scripts/sync-agent.js` runs `cycle()` on a timer. `readToday()` reads today's scans from the ZKTeco device, and `push()` sends them to `POST /api/attendance/push`.
2. **Scans become attendance.** `src/app/api/attendance/push/route.js` matches each biometric ID to an employee, pairs the scans into a time-in and time-out with `pairPunches()`, and builds the day's row with `buildAttendanceRow()` (both in `src/lib/attendance.js`). That function works out the minutes late from the call time (`minutesLate()`) and the overtime after the shift end. The rows are saved in the `attendance` table. IDs that match no employee go to `unmapped_logs`.
3. **The cutoff summary.** `GET /api/attendance` (`src/app/api/attendance/route.js`) adds up each employee's days present, leave, minutes late and weekday or weekend overtime with `summarizeAttendance()`.
4. **The payslip preview.** `src/features/payroll/StaffPayrollView.jsx` loads that summary and calls `computeStaffPayroll()` in `src/lib/payroll.js` for each employee. It works out the basic pay, overtime, SSS, PhilHealth, Pag-IBIG, the late deduction, withholding tax (`cutoffWithholding()` in `src/lib/withholding.js`) and loan deductions.
5. **Loan deductions.** The admin applies the cutoff's loan deductions first (see walkthrough (c)).
6. **Release.** `POST /api/payroll/finalize` (`src/app/api/payroll/finalize/route.js`) reloads everything from the database with `loadStaffPayrollInputs()` (`src/lib/server/services/payroll-inputs.js`), runs `computeStaffPayroll()` again for each employee in `buildSlips()`, and saves a `payroll_periods` row with one `payslips` row per employee. The saved payslips do not change afterwards. `GET /api/payroll/history` reads them back.

### (b) A logged delivery becomes a crew payslip
1. **Logging the trip.** `src/features/deliveries/DeliveryForm.jsx` collects the truck, driver, helpers, address and items. For each item it multiplies the quantity by the rate from the rates table (`regular` or `double`), giving `driverAmount` and `helperAmount`. `CheckerView.jsx` or `DeliveriesView.jsx` sends it to `POST /api/deliveries`.
2. **Saving it.** `src/app/api/deliveries/route.js` checks the form, gives the trip the next trip number for that truck and day, and saves a `deliveries` row with its `delivery_items`.
3. **Loading the day.** `src/components/layout/AppShell.jsx` loads today's deliveries from `GET /api/deliveries` and groups them by truck with `deliveriesToLog()` (`src/lib/payroll.js`).
4. **Crew pay.** `src/features/payroll/CrewPayrollView.jsx` calls `crewEarnings()`, which gives each person their share of the piece rates (a driver gets the driver amount, helpers split the helper amount), plus the daily rate for each day worked, plus the trip bonus. Voided trips are skipped.
5. **Lates and deductions.** The screen loads the daily-paid staff and their attendance from `GET /api/payroll/daily` (`loadDailyStaff()` in `payroll-inputs.js`), and `crewDayPay()` takes ₱3 per minute late, capped at the day's pay. Loan deductions taken for that day are added per person (`loanDeductionsFor()`).
6. **The payslip.** The Per-Person Payslips table and the payslip dialog in `CrewPayrollView.jsx` show the result. Crew payslips are worked out on screen and printed; they are not stored in the `payslips` table.

### (c) A loan from creation to its payroll deduction
1. **Granting it.** `src/features/loans/LoanFormModal.jsx` (opened from `LoansPage.jsx`) sends `POST /api/loans` with `kind: 'LOAN'`. Cash advances come from `CashAdvancesPage.jsx` with `kind: 'CASH_ADVANCE'`.
2. **Checks and saving.** `src/app/api/loans/route.js` allows at most ₱50,000 per loan and only one unpaid loan per person. A cash advance is limited to the cutoff's projected pay and is for office staff only. It saves a `loans` row and a `GRANT` entry in `loan_entries`. The balance is never stored: it is always worked out from the entries.
3. **What is due.** In the browser, `computeStaffPayroll()` asks `dueFor()` (`src/lib/loan-rules.js`) how much each loan owes this run: a cash advance in full, a loan its per-cutoff amount plus any shortfall carried from the last run, never more than the balance.
4. **Applying the deductions.** The admin presses apply on Staff Payroll (or on Crew Payroll for a crew day), which calls `POST /api/loans/apply-deductions`. That route works out each person's available pay (`staffAvailable()` or `crewAvailableOn()` in `payroll-inputs.js`) and calls `applyLoanDeductions()` (`src/lib/server/services/loans-apply.js`). It plans the amounts with `planDeductions()` (cash advances first, then loans, never more than the pay available) and writes one `DEDUCTION` entry per loan with the run key, for example `staff-October 1–15, 2026`.
5. **On the payslip.** When the cutoff is released, `computeStaffPayroll()` is called with that run key and reads back exactly the `DEDUCTION` entries written for it. Those amounts become `loanDeduction` and `advanceDeduction` on the saved payslip.

## Glossary

| Term in the app | Meaning | Name in the database, when it differs |
|---|---|---|
| Helper | A crew member who rides with the driver and helps load and unload. Paid by piece rate like the driver. | The `Position` value `HELPER` is stored as `PAHINANTE`. |
| Piece-rate | Pay per item delivered, from the rates table. Drivers and helpers are paid this way, plus a daily rate for each day they work. | |
| Double rate | A higher rate for far or hard trips. A trip marked double uses each item's `double` rate instead of its `regular` rate. | `isDouble` on `deliveries`, and `driverRateDouble` / `helperRateDouble` on `rate_items`. |
| Trip bonus | Extra pay (by default ₱100) for each truck and day where a person has 5 or more of their own trips that were not voided. | The `Payslip` field `tripBonus` is stored in the `palimaBonus` column. |
| Cutoff | One pay period: the 1st to the 15th, or the 16th to the end of the month. | `payroll_periods` |
| Cash advance | An advance on pay for office staff, taken back in full from the next payroll. | `loans` with type `CASH_ADVANCE` |
