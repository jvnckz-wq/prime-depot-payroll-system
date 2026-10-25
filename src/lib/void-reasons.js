import { freeTextError } from '@/lib/field-rules';

export const VOID_REASONS = [
  'Wrong driver or helper picked',
  'Wrong truck picked',
  'Wrong items or quantity',
  'Wrong double rate',
  'Wrong customer or address',
  'Logged twice',
  'Delivery was cancelled',
];

export const OTHER_REASON = 'Other';
const OTHER_PREFIX = `${OTHER_REASON}: `;

export function buildVoidReason(choice, otherText) {
  if (choice === OTHER_REASON) return `${OTHER_PREFIX}${String(otherText || '').replace(/\s+/g, ' ').trim()}`;
  return choice || '';
}

export function voidChoiceError(choice, otherText) {
  if (!choice) return 'Pick a reason.';
  if (choice === OTHER_REASON) return freeTextError(otherText, { label: 'Reason', min: 5, max: 160 });
  return VOID_REASONS.includes(choice) ? '' : 'Pick a reason from the list.';
}

export function voidReasonError(reason) {
  const s = String(reason || '').replace(/\s+/g, ' ').trim();
  if (VOID_REASONS.includes(s)) return '';
  if (s.startsWith(OTHER_PREFIX)) return freeTextError(s.slice(OTHER_PREFIX.length), { label: 'Reason', min: 5, max: 160 });
  return 'Pick a reason from the list.';
}
