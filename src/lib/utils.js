import * as XLSX from 'xlsx';

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const uid = () => Math.random().toString(36).slice(2, 9);

const FORMULA_LEAD = /^[=+\-@\t\r]/;

const deFormula = (v) => (typeof v === 'string' && FORMULA_LEAD.test(v) ? `'${v}` : v);

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

export const telHref = (raw) => 'tel:' + String(raw || '').replace(/[^\d+]/g, '');

export const looksLikePHPhone = (raw) => {
  const t = String(raw || '').trim();
  if (!t) return true; 
  const s = t.replace(/[^\d+]/g, '');
  if (!s) return false; 
  return /^09\d{9}$/.test(s) || /^\+639\d{9}$/.test(s) || /^0\d{7,9}$/.test(s) || /^\d{7,8}$/.test(s);
};

export const timeLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};


const CUTOFF_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const pad2 = (n) => String(n).padStart(2, '0');
const lastDayOfMonth = (year, month1) => new Date(year, month1, 0).getDate();
const ymdParts = (s) => { const [y, m, d] = String(s).split('-').map(Number); return { y, m, d }; };

export function currentCutoffPeriod(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  if (d <= 15) return { start: `${y}-${pad2(m)}-01`, end: `${y}-${pad2(m)}-15` };
  return { start: `${y}-${pad2(m)}-16`, end: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}` };
}

export function cutoffLabel(period, today = new Date()) {
  const p = period && period.start && period.end ? period : currentCutoffPeriod(today);
  const a = ymdParts(p.start);
  const b = ymdParts(p.end);
  if (a.y === b.y && a.m === b.m) return `${CUTOFF_MONTHS[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
  const yr = a.y === b.y ? `${a.y}` : `${a.y}–${b.y}`;
  return `${CUTOFF_MONTHS[a.m - 1]} ${a.d} – ${CUTOFF_MONTHS[b.m - 1]} ${b.d}, ${yr}`;
}