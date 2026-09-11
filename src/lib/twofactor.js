// Two-factor (TOTP) helpers, kept behind one module so the routes never touch
// otplib or the QR library directly. SERVER-ONLY.
//
//  * TOTP is the same scheme Google Authenticator, Microsoft Authenticator and
//    1Password implement: a shared secret plus the current time produce a
//    6-digit code that changes every 30 seconds. Nothing travels over the
//    network at login time except the code the user types.
//
//  * Backup codes are the way back in if the phone is lost. They are random and
//    high-entropy, so unlike passwords they need no slow hash — a plain SHA-256
//    is enough, and we store only the hash. Each one works exactly once.
import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// Accept codes from the step before and after the current one, so a phone whose
// clock is a little off still works. One step each way is a 90-second window in
// total, which is standard and not wide enough to matter for guessing.
authenticator.options = { window: 1 };

const ISSUER = 'Prime Depot Payroll';

// 20 bytes is 160 bits, the length RFC 4226 recommends; otplib's default of 10
// bytes is below the 128-bit minimum it sets.
export function generateTotpSecret() {
  return authenticator.generateSecret(20);
}

/// The otpauth:// URI an authenticator app reads from the QR code. The label
/// carries the account and issuer so the app shows "Prime Depot Payroll
/// (username)" in its list.
export function totpKeyUri(accountName, secret) {
  return authenticator.keyuri(accountName, ISSUER, secret);
}

export async function totpQrDataUrl(uri) {
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

/// Check a TOTP code. Returns the 30-second time step the code belongs to, or
/// null if it does not match. Callers store that step and accept a code only
/// for a later one, which is what stops the same code being used twice.
export function totpStep(token, secret) {
  if (!token || !secret) return null;
  // Pin "now" once, so the step worked out below is the one otplib checked.
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

// Human-friendly one-time codes: two groups of four from an alphabet with no
// look-alike characters (no 0/O, 1/I/L), so they are easy to read off paper.
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

// Normalize before hashing so "abcd-efgh", "ABCD EFGH" and "ABCDEFGH" all match
// the same stored hash — the user should not have to reproduce the dash.
export const hashBackupCode = (code) =>
  createHash('sha256')
    .update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');
