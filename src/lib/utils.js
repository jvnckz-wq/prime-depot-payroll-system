import * as XLSX from 'xlsx';

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const uid = () => Math.random().toString(36).slice(2, 9);

// Excel, LibreOffice, and Google Sheets treat a cell whose text begins with
// =, +, -, or @ as a formula. An employee named `=HYPERLINK("http://evil","x")`
// is harmless everywhere in this app — React escapes it on screen — but becomes
// live code the moment somebody opens the exported file. Leading tabs and
// carriage returns count too, because those spreadsheets strip them and then
// read the character underneath.
//
// Prefixing an apostrophe forces the cell to stay text. Excel does not show the
// apostrophe, so the export still reads normally.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const deFormula = (v) => (typeof v === 'string' && FORMULA_LEAD.test(v) ? `'${v}` : v);

// Numbers, dates, and booleans pass through untouched — only text can carry a
// formula, so a negative number stays a negative number.
const safeRow = (row) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, deFormula(value)]));

export function exportXLSX(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows.map(safeRow));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export const todayLabel = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---- Phone helpers -------------------------------------------------------
// A tel: href built from whatever the user typed — keep a leading + (country
// code) and digits, drop spaces, dashes, and parentheses so the dialer gets a
// clean number to call.
export const telHref = (raw) => 'tel:' + String(raw || '').replace(/[^\d+]/g, '');

// Soft check for a plausible Philippine number: an 11-digit mobile (09XXXXXXXXX),
// its +63 form (+639XXXXXXXXX), or a 7–10 digit landline. Deliberately lenient —
// it drives a gentle hint, never a hard block, because a checker may only have a
// partial number and still needs to save the delivery.
export const looksLikePHPhone = (raw) => {
  const t = String(raw || '').trim();
  if (!t) return true; // empty is fine — the field is optional
  const s = t.replace(/[^\d+]/g, '');
  if (!s) return false; // had content but no digits at all — clearly not a number
  return /^09\d{9}$/.test(s) || /^\+639\d{9}$/.test(s) || /^0\d{7,9}$/.test(s) || /^\d{7,8}$/.test(s);
};

// Short local time, e.g. "2:45 PM" — for "who logged this, and when".
export const timeLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

// ---- Semi-monthly cutoff -------------------------------------------------
// Prime Depot pays twice a month: the 1st–15th, and the 16th–end-of-month.
// The single source of truth for "which cutoff are we in" is the most recent
// imported attendance period; cutoffLabel() takes that period and formats it.
// When nothing has been imported yet, it falls back to the calendar cutoff
// that contains `today`, so the UI never shows a blank or stale label.

const CUTOFF_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');
// Last calendar day of a 1-based month: day 0 of the next month.
const lastDayOfMonth = (year, month1) => new Date(year, month1, 0).getDate();
// Split 'YYYY-MM-DD' by hand so the day never shifts across timezones.
const ymdParts = (s) => { const [y, m, d] = String(s).split('-').map(Number); return { y, m, d }; };

// The cutoff period ({start,end} as 'YYYY-MM-DD') that contains `today`.
export function currentCutoffPeriod(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1-based
  const d = today.getDate();
  if (d <= 15) return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-15` };
  return { start: `${y}-${pad2(m)}-16`, end: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}` };
}

// Human label for a cutoff, e.g. "May 1–15, 2026". Prefers a real imported
// period; falls back to the calendar cutoff containing `today`.
export function cutoffLabel(period, today = new Date()) {
  const p = period && period.start && period.end ? period : currentCutoffPeriod(today);
  const a = ymdParts(p.start);
  const b = ymdParts(p.end);
  if (a.y === b.y && a.m === b.m) return `${CUTOFF_MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
  // Cross-month range (unusual for a cutoff, but format it gracefully).
  const yr = a.y === b.y ? `${a.y}` : `${a.y}–${b.y}`;
  return `${CUTOFF_MONTHS[a.m - 1]} ${a.d} – ${CUTOFF_MONTHS[b.m - 1]} ${b.d}, ${yr}`;
}