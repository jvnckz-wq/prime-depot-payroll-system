// API responses never show a raw error message to the user (it can name tables and columns).
// The full error goes to the server log with console.error; the user gets a short message.
// Allowed: errors made on purpose for the user (they carry a status, e.g. importError).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/app/api', import.meta.url));
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts)$/.test(name)) out.push(p);
  }
  return out;
};

const leaks = [];
for (const file of walk(root)) {
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (!line.includes('NextResponse.json')) return;
    if (/\berr\??\.status\b/.test(line)) return;
    if (/\b(err|e|error)\??\.message\b/.test(line)) leaks.push(`${file.slice(root.length + 1)}:${i + 1}`);
  });
}

assert.deepEqual(leaks, [], `Raw error messages in API responses:\n${leaks.join('\n')}`);
console.log('ok - no API response passes a raw error message');
