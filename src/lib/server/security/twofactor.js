import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

authenticator.options = { window: 1 };

const ISSUER = 'Prime Depot Payroll';

export function generateTotpSecret() {
  return authenticator.generateSecret(20);
}

export function totpKeyUri(accountName, secret) {
  return authenticator.keyuri(accountName, ISSUER, secret);
}

export async function totpQrDataUrl(uri) {
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

export function totpStep(token, secret) {
  if (!token || !secret) return null;
  const totp = authenticator.clone({ epoch: Date.now() });
  try {
    const delta = totp.checkDelta(String(token).replace(/\s/g, ''), secret);
    if (typeof delta !== 'number') return null;
    const { epoch, step } = totp.allOptions();
    return Math.floor(epoch / 1000 / step) + delta;
  } catch {
    return null;
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function group() {
  const bytes = randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i += 1) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export function generateBackupCodes(n = 10) {
  return Array.from({ length: n }, () => `${group()}-${group()}`);
}

export const hashBackupCode = (code) =>
  createHash('sha256')
    .update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');
