const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^[A-Za-z]{2,24}$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isEmail(value) {
  const s = normalizeEmail(value);
  if (!s || s.length > 254) return false;
  const at = s.lastIndexOf('@');
  if (at <= 0 || at !== s.indexOf('@')) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length > 64 || !LOCAL_RE.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (!TLD_RE.test(labels[labels.length - 1])) return false;
  return labels.every((l) => LABEL_RE.test(l));
}

export function maskEmail(value) {
  const [local, domain] = String(value || '').split('@');
  if (!domain) return '•••';
  const parts = domain.split('.');
  const tld = parts.length > 1 ? '.' + parts.slice(1).join('.') : '';
  return `${local[0] || ''}•••@${parts[0][0] || ''}•••${tld}`;
}
