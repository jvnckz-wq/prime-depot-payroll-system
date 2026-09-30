# Prime Depot: File Structure Restructure Plan

**Buod (Taglish):** Paglilipat LANG ng files para maging ayon sa feature ang mga screen, at para makita agad sa folders kung alin ang frontend, backend, security, services, database, at integrations. Walang babaguhing logic, pangalan ng function, o laman ng file maliban sa `import` paths. Gagawin sa sariling branch, paunti-unti, at may lint + tests + build pagkatapos ng bawat hakbang. Kapag may pumalya, huminto at mag-report.

This plan is written for Claude Code. Follow it step by step, in order.

---

## 0. Ground rules (read first, apply to every step)

1. **Move-only refactor.** Do not change logic, function or component names, exports, props, text, styles, or comments. The only edits allowed are: moving files with `git mv`, and updating import/require paths that point to moved files. (Exception: the doc updates in Step 7.)
2. **Always `git mv`**, never delete + create, so each file keeps its history.
3. **Never move or rename** (these paths are load-bearing):
   - `src/app/**` (every `route.js` path IS a public API URL; the sync agent and the browser call them). Only the import lines *inside* these files may change.
   - `prisma/**`, `prisma.config.ts`, `next.config.mjs`, `eslint.config.mjs`, `postcss.config.mjs`, `jsconfig.json`, `package-lock.json`, `public/**`, `src/generated/**`.
   - `scripts/sync-agent.js`, `scripts/pull-cutoff.js`, `scripts/prime-depot-sync.cmd`, `scripts/pull-cutoff.cmd` (the warehouse laptop's Task Scheduler and desktop shortcut run these by path).
   - `.env*` files: never open, print, move, or commit them.
4. **Import style:**
   - Files under `src/app`, `src/shell`, `src/components`, `src/features` import project files with the `@/` alias (defined in `jsconfig.json`: `@/*` → `./src/*`), e.g. `import { Btn } from '@/components/ui.jsx'`.
   - Files under `src/lib/**` and `src/data/**` keep **relative** imports between themselves. Reason: the test scripts load them directly with `tsx` and plain `node`, which do not read the `@/` alias.
   - Test scripts keep relative `require`/`import` paths.
5. **After every step:** run all of these; all must pass before committing.
   ```
   npm run lint
   npm run test:pairing
   npm run test:loans
   npm run test:loans2
   npm run test:loans3
   npm run build
   ```
   Then `git grep` for the old path of every moved file; it must return nothing (outside `RESTRUCTURE-PLAN.md`). Commit with the message given in the step.
6. If anything fails and the fix is not an import path, **stop and report**. Do not "fix" logic.
7. Do not push. The owner reviews and pushes.

---

## Step 0. Safety net

```
git checkout main
git pull
git checkout -b restructure
```
Run the Ground rule 5 checks once on the untouched code to confirm a green baseline. If the baseline is not green, stop and report.

## Step 1. Switch imports to the `@/` alias (no moves yet)

In every file under `src/app`, `src/views`, `src/components`, and `src/PrimeDepotPayrollUI.jsx`, rewrite relative imports of project files to `@/…` (e.g. `'../../../../lib/prisma'` → `'@/lib/prisma'`, `'../components/ui.jsx'` → `'@/components/ui.jsx'`). Keep file extensions exactly as they are written today. Do not touch `src/lib/**`, `src/data/**`, or `scripts/**`.

Why first: after this, moving a file changes one alias path per importer instead of a chain of `../../..`.
Commit: `refactor: use @/ alias for project imports`

## Step 2. App shell

| From | To |
|---|---|
| `src/PrimeDepotPayrollUI.jsx` | `src/shell/PrimeDepotPayrollUI.jsx` |
| `src/components/Nav.jsx` | `src/shell/Nav.jsx` |
| `src/components/IdleTimeout.jsx` | `src/shell/IdleTimeout.jsx` |
| `src/data/nav.js` | `src/shell/nav.js` |
| `src/theme.js` | `src/components/theme.js` |

Update `src/app/page.js` to import the shell from `@/shell/PrimeDepotPayrollUI.jsx`.
Commit: `refactor: move app shell into src/shell`

## Step 3. Features (one commit per feature, in this order)

Create `src/features/<feature>/` and move:

| Feature | From | To |
|---|---|---|
| loans | `src/views/LoansView.jsx` | `src/features/loans/LoansView.jsx` |
| loans | `src/views/loans/*` (6 files) | `src/features/loans/` (same names) |
| payroll | `src/views/PayrollView.jsx`, `StaffPayrollView.jsx`, `TruckPayrollView.jsx`, `FinalPayView.jsx` | `src/features/payroll/` |
| attendance | `src/views/AttendanceView.jsx` | `src/features/attendance/` |
| deliveries | `src/views/CheckerView.jsx`, `src/components/DeliveryForm.jsx` | `src/features/deliveries/` |
| employees | `src/views/EmployeesView.jsx` | `src/features/employees/` |
| dashboard | `src/views/DashboardView.jsx` | `src/features/dashboard/` |
| reports | `src/views/ReportsView.jsx` | `src/features/reports/` |
| settings | `src/views/SettingsView.jsx`, `FleetPanel.jsx`, `AccountsPanel.jsx` | `src/features/settings/` |
| auth | `src/views/LoginView.jsx`, `TwoFactorSetup.jsx`, `AccountView.jsx`, `AccountPage.jsx`, `LegalView.jsx` | `src/features/auth/` |
| help | `src/views/FAQView.jsx` | `src/features/help/` |

Imports between files of the SAME feature folder may stay relative (`./parts.jsx`); everything else uses `@/`.
After the last feature, `src/views/` must be empty; remove the empty folder.
Commits: `refactor: move <feature> into src/features/<feature>`

## Step 4. Split `src/lib` into server-only layers and shared rules

Rule: everything under `src/lib/server/` runs only on the server (database, secrets, email, sessions, uploads). **The browser must never import from it.** Inside it, one subfolder per layer, so the folder name says what the code is. Shared business rules (run in both the browser and the server) stay in `src/lib/`.

| Layer | From | To |
|---|---|---|
| database | `src/lib/prisma.js` | `src/lib/server/db/prisma.js` |
| database | `src/lib/db-retry.js` | `src/lib/server/db/db-retry.js` |
| security | `src/lib/auth.js` | `src/lib/server/security/auth.js` |
| security | `src/lib/twofactor.js` | `src/lib/server/security/twofactor.js` |
| security | `src/lib/uploads.js` | `src/lib/server/security/uploads.js` |
| services | `src/lib/employees.js` | `src/lib/server/services/employees.js` |
| services | `src/lib/loans.js` | `src/lib/server/services/loans.js` |
| services | `src/lib/loans-apply.js` | `src/lib/server/services/loans-apply.js` |
| services | `src/lib/payroll-inputs.js` | `src/lib/server/services/payroll-inputs.js` |
| services | `src/lib/statutory.js` | `src/lib/server/services/statutory.js` |
| services | `src/lib/attendance-import.js` | `src/lib/server/services/attendance-import.js` |
| integrations | `src/lib/email.js` | `src/lib/server/integrations/email.js` |

Stay in `src/lib/` (shared rules, or browser helpers): `payroll.js`, `loan-rules.js`, `attendance.js`, `utils.js`.

Fix every import that points to a moved file: the relative imports inside `src/lib/**` (e.g. `src/lib/server/services/loans-apply.js` importing the shared rules now uses `../../loan-rules`, and `src/lib/server/security/auth.js` importing the client uses `../db/prisma`), the `@/lib/...` imports in `src/app/api/**`, the relative `require` paths in the three `scripts/loans-phase*.test.cjs` files, and any file under `scripts/` or `prisma.config.ts` that imports a moved file (check with `git grep`).
Checks: `git grep -n "lib/server" src/features src/shell src/components` must return nothing, and every file directly under `src/lib/server/` must now be inside one of the four subfolders.
Commit: `refactor: separate server-only lib code by layer (db, security, services, integrations)`

## Step 5. Tests and maintenance scripts

| From | To |
|---|---|
| `scripts/loans-phase1.test.cjs`, `loans-phase2.test.cjs`, `loans-phase3.test.cjs`, `pairing-parity.test.mjs` | `tests/` |
| `scripts/clear-demo-employees.ts`, `clear-for-preview.ts`, `dedupe-attendance-batches.ts`, `disable-2fa.ts`, `reset-password.ts` | `scripts/admin/` |

Update the relative paths inside the moved files (e.g. `../src/lib/...` becomes `../src/lib/...` from `tests/`, and `../../src/...` from `scripts/admin/` if they import app code), the `test:*` entries in `package.json`, and any README or doc line that shows how to run the admin scripts.
Do NOT move the sync agent files listed in Ground rule 3.
Commit: `refactor: move tests to tests/ and admin scripts to scripts/admin/`

## Step 6. Full check

1. Run the full check list from Ground rule 5.
2. `npm run dev`, sign in, and open every screen once: Dashboard; Payroll (Staff, Crew, History); Loans (Loans, Cash Advances, History); Employees (open one Final Pay); Attendance (Live, DTR, Unmapped, Import History); Deliveries; Reports (all tabs); Settings (all tabs); Account; FAQs. Check the browser console for errors. **Do not press Apply Cutoff Deductions, Finalize / Release, or Record deduction: `.env.local` points to the PRODUCTION database.**
3. Report the final tree: `git ls-files src tests scripts`.

## Step 7. Docs

1. Update every path mentioned in `AGENTS.md`, `CLAUDE.md`, and `README.md` to the new locations.
2. Add a **"Project structure"** section to `README.md`, organized by layer. For each layer, list its folders and one plain sentence on what it does. Use exactly these layers:
   - **Frontend** (runs in the browser; never touches the database, only calls `/api/...`): `src/app/page.js`, `src/app/layout.js`, `src/app/globals.css`, `src/shell`, `src/features/<feature>`, `src/components`, `src/data`.
   - **Backend: API routes** (`src/app/api/**`): the folder path is the URL; the exported function name (`GET`, `POST`, `PATCH`, `DELETE`) is the action; every route checks the user's role first.
   - **Backend: services** (`src/lib/server/services`): business logic the routes call, computed from the database (shaping records, loan deductions, payroll inputs, attendance import).
   - **Shared business rules** (`src/lib/payroll.js`, `loan-rules.js`, `attendance.js`): the same functions run in the browser for previews and on the server for the real result; the server always recomputes from the database and never trusts numbers sent by the browser. `src/lib/utils.js` is browser-only helpers.
   - **Authentication and security** (`src/lib/server/security`, `src/app/api/auth/**`, `src/shell/IdleTimeout.jsx`, security headers in `next.config.mjs`): bcrypt password hashes, hashed session tokens in httpOnly cookies, login throttling, TOTP two-factor with hashed backup codes, ADMIN and CHECKER roles, idle logout, upload size limits, the device sync token, and the audit log.
   - **Database** (`prisma/schema.prisma`, `prisma/migrations`, `src/lib/server/db`, `src/generated/prisma`): Neon Postgres through Prisma; never edit `src/generated`.
   - **Integrations and external services** (`src/lib/server/integrations`, `scripts/sync-agent.js`, `scripts/pull-cutoff.js`): Gmail for email, the authenticator app for 2FA, the ZKTeco biometric device through the sync agent on the warehouse laptop, Vercel for hosting, Neon for the database.
   - **Tooling** (`package.json`, the config files, `tests/`, `scripts/admin/`): builds, checks, tests, and admin maintenance tools.
3. Do **not** list any secret value or the contents of `.env.local`. It is enough to say that secrets live in `.env.local`, which is never committed or shown.

Commit: `docs: update paths and document the project structure by layer`

## After Claude Code finishes (owner)

1. Review the commits (`git log --oneline main..restructure`).
2. `git push -u origin restructure`. Vercel builds a **Preview** deployment for the branch: open it and click through the screens once more.
3. If the preview is fine: merge `restructure` into `main` and push. If not: `main` is untouched; fix or delete the branch.
4. Send the new commit hash back to the chat so GAME-PLAN is updated.

## Target structure (for reference)

```
src/
  app/                    FRONTEND entry (page.js, layout.js, globals.css)
    api/                  BACKEND API routes (unchanged; route paths = URLs)
  shell/                  FRONTEND frame: PrimeDepotPayrollUI.jsx, Nav.jsx, IdleTimeout.jsx, nav.js
  components/             FRONTEND shared UI kit: ui.jsx, theme.js
  features/               FRONTEND screens
    auth/  dashboard/  payroll/  loans/  employees/
    attendance/  deliveries/  reports/  settings/  help/
  lib/
    server/               SERVER ONLY (never imported by the browser)
      db/                 prisma.js, db-retry.js
      security/           auth.js, twofactor.js, uploads.js
      services/           employees.js, loans.js, loans-apply.js,
                          payroll-inputs.js, statutory.js, attendance-import.js
      integrations/       email.js
    payroll.js            SHARED business rules (browser + server)
    loan-rules.js
    attendance.js
    utils.js              browser helpers (peso format, Excel export)
  data/                   seed.js, batangas-areas.js
  generated/prisma/       generated by Prisma (gitignored, never edit)
prisma/                   DATABASE schema + migrations (unchanged)
scripts/                  sync-agent.js, pull-cutoff.js, *.cmd (unchanged), admin/
tests/                    loans-phase1..3, pairing-parity
```
