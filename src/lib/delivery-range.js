export const MAX_RANGE_DAYS = 93;
export const UNBOUNDED_LIMIT = 500;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(s) {
  if (!YMD_RE.test(s)) return null;
  const date = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== s) return null;
  return date;
}

export function deliveryRange(from, to) {
  const f = typeof from === 'string' ? from.trim() : '';
  const t = typeof to === 'string' ? to.trim() : '';
  if (!f && !t) return { take: UNBOUNDED_LIMIT };
  if (!f || !t) return { error: 'Choose both a start date and an end date.' };
  const start = parseYmd(f);
  const end = parseYmd(t);
  if (!start || !end) return { error: 'Dates must be real dates in YYYY-MM-DD format.' };
  const days = Math.round((end - start) / 86400000) + 1;
  if (days < 1) return { error: 'The start date is after the end date.' };
  if (days > MAX_RANGE_DAYS) {
    return { error: `Choose at most ${MAX_RANGE_DAYS} days (about 3 months) at a time. This range has ${days} days.` };
  }
  return { gte: start, lte: end, days };
}
