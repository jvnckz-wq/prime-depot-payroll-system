// Reads the attlog.dat file exported from the biometric device.
import { pairPunches } from './attendance.js';
import { cutoffOf } from './loan-rules.js';

const LINE = /^\s*(\d{1,20})\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?(?:\s|$)/;

const validDate = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export class AttlogError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function decodeAttlog(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[1] === 0x00 && buf[0] !== 0x00) return buf.toString('utf16le');
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

export function readAttlog(text) {
  const scans = [];
  let badLines = 0;
  let lastYmd = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = raw.match(LINE);
    if (!m) { badLines += 1; continue; }
    const [, userId, y, mo, d, hh, mm] = m;
    if (!validDate(+y, +mo, +d) || +hh > 23 || +mm > 59) { badLines += 1; continue; }
    const ymd = `${y}-${mo}-${d}`;
    scans.push({ userId, ymd, hhmm: `${hh}:${mm}` });
    if (!lastYmd || ymd > lastYmd) lastYmd = ymd;
  }
  return { scans, badLines, lastYmd };
}

export function attlogForCutoff(text, cutoffStart, todayYmd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(cutoffStart || ''))) throw new AttlogError('Choose the cutoff to import into.');
  const cutoff = cutoffOf(cutoffStart);
  if (cutoff.start !== cutoffStart) throw new AttlogError('That is not a valid cutoff.');
  if (cutoff.start > todayYmd) throw new AttlogError('That cutoff has not started yet.');

  const { scans, badLines, lastYmd } = readAttlog(text);
  if (!scans.length) throw new AttlogError('Could not read any scans. Is this the attlog .dat file from the device\'s USB export?');

  const end = [cutoff.end, lastYmd, todayYmd].sort()[0];
  const inCutoff = scans.filter((s) => s.ymd >= cutoff.start && s.ymd <= end);
  if (!inCutoff.length) throw new AttlogError(`This file has no scans from ${cutoff.start} to ${cutoff.end}. Choose the cutoff the scans belong to.`);

  const byUserDay = new Map();
  for (const s of inCutoff) {
    if (!byUserDay.has(s.userId)) byUserDay.set(s.userId, {});
    const days = byUserDay.get(s.userId);
    (days[s.ymd] ||= new Set()).add(s.hhmm);
  }

  const punches = new Map();
  for (const [userId, days] of byUserDay) {
    const out = {};
    for (const [ymd, set] of Object.entries(days)) out[ymd] = pairPunches([...set]);
    punches.set(userId, { name: '', days: out });
  }

  const ids = [...new Set(scans.map((s) => s.userId))].sort((a, b) => Number(a) - Number(b));
  const [sy, sm, sd] = cutoff.start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return {
    period: { start: new Date(Date.UTC(sy, sm - 1, sd)), end: new Date(Date.UTC(ey, em - 1, ed)) },
    roster: ids.map((userId) => ({ userId, name: '' })),
    punches,
    cutoffEnd: cutoff.end,
    scansUsed: inCutoff.length,
    badLines,
  };
}

export const isAttlogName = (name) => /\.dat$/i.test(String(name || ''));
