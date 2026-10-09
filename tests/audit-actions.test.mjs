import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'generated' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const enumBody = schema.match(/enum AuditAction \{([\s\S]*?)\}/)[1];
const enumValues = new Set(enumBody.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean));

const used = new Set();
for (const file of walk(join(root, 'src'))) {
  for (const m of readFileSync(file, 'utf8').matchAll(/logSecurityEvent\(\s*'([A-Z0-9_]+)'/g)) used.add(m[1]);
}

const migrated = new Set();
const migDir = join(root, 'prisma/migrations');
for (const dir of readdirSync(migDir)) {
  const p = join(migDir, dir, 'migration.sql');
  let sql;
  try { sql = readFileSync(p, 'utf8'); } catch { continue; }
  const created = sql.match(/CREATE TYPE "AuditAction" AS ENUM \(([^)]*)\)/);
  if (created) for (const v of created[1].matchAll(/'([A-Z0-9_]+)'/g)) migrated.add(v[1]);
  for (const v of sql.matchAll(/ALTER TYPE "AuditAction" ADD VALUE(?: IF NOT EXISTS)? '([A-Z0-9_]+)'/g)) migrated.add(v[1]);
}

ok('code uses at least the known audit actions', () => {
  assert.ok(used.size >= 20, `only found ${used.size} audit actions in src`);
  assert.ok(used.has('ACCOUNT_LINKED'));
});

ok('every audit action written by the code exists in the schema enum', () => {
  const missing = [...used].filter((a) => !enumValues.has(a));
  assert.deepEqual(missing, [], `add to enum AuditAction: ${missing.join(', ')}`);
});

ok('every schema enum value is created by a migration (so the database has it)', () => {
  const missing = [...enumValues].filter((a) => !migrated.has(a));
  assert.deepEqual(missing, [], `no migration adds: ${missing.join(', ')}`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ok  ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
