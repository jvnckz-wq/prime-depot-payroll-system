const BASE64_OVERHEAD = 4 / 3;

export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;

export const MAX_AVATAR_BYTES = 150 * 1024;

export const maxBase64Length = (bytes) => Math.ceil(bytes * BASE64_OVERHEAD) + 4;

export function base64TooLarge(value, maxBytes, label) {
  if (typeof value !== 'string') return null;
  if (value.length <= maxBase64Length(maxBytes)) return null;
  const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
  return `${label} is too large. The limit is ${mb}MB.`;
}

const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  webp: [0x52, 0x49, 0x46, 0x46],
};

export function hasImageMagic(type, base64Body) {
  const signature = MAGIC[type];
  if (!signature) return false;

  let head;
  try {
    head = Buffer.from(String(base64Body).slice(0, 16), 'base64');
  } catch {
    return false;
  }

  if (head.length < signature.length) return false;
  if (!signature.every((byte, i) => head[i] === byte)) return false;

  if (type === 'webp') {
    return head.length >= 12 && head.toString('latin1', 8, 12) === 'WEBP';
  }

  return true;
}