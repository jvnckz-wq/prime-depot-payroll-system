// Request size caps.
//
// Both of this app's uploads arrive as base64 inside a JSON body rather than as
// multipart form data — the biometric .xls on the attendance import, and the
// profile picture on /api/auth/me. That keeps the routes simple, but it also
// means the body is parsed into memory before any handler code runs, so the cap
// has to be checked on the encoded string, before it is decoded.
//
// Vercel refuses request bodies over ~4.5MB, which covers production by
// accident. Dev servers and any self-hosted deployment have no such limit, and
// a hostile spreadsheet is expensive to parse regardless of where it lands —
// so the limit is declared here instead of inherited from the platform.

// base64 is 4 characters per 3 bytes, so the encoded string is ~1.37x the file.
const BASE64_OVERHEAD = 4 / 3;

/// Biometric attendance export. A real ZKTeco .xls for a 15-day cutoff and a
/// few dozen employees is well under 1MB; 6MB is generous headroom.
export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;

/// Profile picture. The browser resizes to 128px before upload, which lands
/// around 6KB — this is the backstop for a caller that skips that step.
export const MAX_AVATAR_BYTES = 150 * 1024;

/// Longest acceptable base64 string for a given decoded byte budget.
export const maxBase64Length = (bytes) => Math.ceil(bytes * BASE64_OVERHEAD) + 4;

/// Returns an error message when a base64 payload is over budget, or null when
/// it fits. Callers turn the message into a 413.
export function base64TooLarge(value, maxBytes, label) {
  if (typeof value !== 'string') return null;
  if (value.length <= maxBase64Length(maxBytes)) return null;
  const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
  return `${label} is too large. The limit is ${mb}MB.`;
}

// --- Content checks ---------------------------------------------------------
//
// The MIME type in a data URL is just text the caller wrote. Nothing stops a
// request that skips the browser from labelling arbitrary bytes `image/png`.
// These are the first bytes each format actually starts with, so a stored
// avatar is a real image rather than 150KB of anything at all.
//
// This is a sanity check, not a decoder: it confirms the file begins the way
// the format requires. That is enough for the job here, because the value is
// only ever handed back to an <img> tag, and a browser will simply refuse to
// render bytes that are not the image they claim to be.
const MAGIC = {
  // \x89PNG\r\n\x1a\n
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // JPEG SOI marker.
  jpeg: [0xff, 0xd8, 0xff],
  // RIFF....WEBP — bytes 8-11 identify it, so those are checked separately.
  webp: [0x52, 0x49, 0x46, 0x46],
};

/// True when `base64Body` starts with the signature for `type`
/// ('png' | 'jpeg' | 'webp').
export function hasImageMagic(type, base64Body) {
  const signature = MAGIC[type];
  if (!signature) return false;

  let head;
  try {
    // 16 base64 characters decode to 12 bytes — enough for every signature
    // above, including WebP's format tag at offset 8.
    head = Buffer.from(String(base64Body).slice(0, 16), 'base64');
  } catch {
    return false;
  }

  if (head.length < signature.length) return false;
  if (!signature.every((byte, i) => head[i] === byte)) return false;

  // A RIFF container can hold plenty of things that are not images, so confirm
  // this one says WEBP.
  if (type === 'webp') {
    return head.length >= 12 && head.toString('latin1', 8, 12) === 'WEBP';
  }

  return true;
}
