// Date, cutoff and table-style helpers shared by the Attendance tabs.
import { F_BODY, F_HEAD, T } from '@/styles/theme';

export const agoFrom = (iso) => {
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

export const asUTC = (iso) => new Date(iso + 'T00:00:00Z');
export const fmtDay = (iso) => asUTC(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const fmtPeriod = (p) => (p ? `${fmtDay(p.start)} – ${asUTC(p.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : '--');
export const shiftYmd = (iso, delta) => { const d = asUTC(iso); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); };
export const liveThBase = { fontFamily: F_HEAD, fontSize: 11.5, fontWeight: 600, color: T.soft, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', padding: '13px 18px', borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` };
export const liveTdBase = { fontFamily: F_BODY, fontSize: 14.5, color: T.ink, padding: '14px 18px', borderBottom: `1px solid ${T.lineSoft}`, verticalAlign: 'middle' };
export const manilaTodayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const cutoffOf = (y, mi0, half) => {
  const mm = String(mi0 + 1).padStart(2, '0');
  if (half === 'A') return { from: `${y}-${mm}-01`, to: `${y}-${mm}-15` };
  const end = new Date(Date.UTC(y, mi0 + 1, 0)).getUTCDate();
  return { from: `${y}-${mm}-16`, to: `${y}-${mm}-${String(end).padStart(2, '0')}` };
};
export const recentCutoffs = (todayStr, n = 3) => {
  const [y, m, d] = todayStr.split('-').map(Number);
  let yy = y, mi = m - 1, half = d <= 15 ? 'A' : 'B';
  const list = [];
  for (let i = 0; i < n; i += 1) { list.push(cutoffOf(yy, mi, half)); if (half === 'B') { half = 'A'; } else { half = 'B'; mi -= 1; if (mi < 0) { mi = 11; yy -= 1; } } }
  return list;
};
export const cutoffLabel = (c) => `${asUTC(c.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${asUTC(c.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
export const cutoffFor = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return cutoffOf(y, m - 1, d <= 15 ? 'A' : 'B'); };
export const shiftCutoff = (sel, dir) => {
  const [y, m] = sel.from.split('-').map(Number);
  let yy = y, mi = m - 1, half = sel.from.slice(8) === '01' ? 'A' : 'B';
  if (dir > 0) { if (half === 'A') half = 'B'; else { half = 'A'; mi += 1; if (mi > 11) { mi = 0; yy += 1; } } }
  else if (half === 'B') half = 'A'; else { half = 'B'; mi -= 1; if (mi < 0) { mi = 11; yy -= 1; } }
  return cutoffOf(yy, mi, half);
};
