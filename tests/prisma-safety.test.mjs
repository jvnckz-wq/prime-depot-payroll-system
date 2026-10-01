import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapWithRetry } from '../src/lib/server/db/db-retry.js';

const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'generated' ? [] : walk(p);
  return /\.(js|jsx|mjs)$/.test(d.name) ? [p] : [];
});

const FILES = walk(SRC).map((file) => ({ file: path.relative(SRC, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') }));

function argumentAt(text, openParen) {
  let depth = 0;
  let quote = null;
  for (let i = openParen; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) return text.slice(openParen + 1, i);
  }
  throw new Error('unbalanced parentheses');
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function transactionCalls() {
  const calls = [];
  for (const { file, text } of FILES) {
    for (const m of text.matchAll(/(\w+)\.\$transaction\(/g)) {
      const open = m.index + m[0].length - 1;
      calls.push({ where: `${file}:${lineOf(text, m.index)}`, receiver: m[1], arg: argumentAt(text, open), before: text.slice(Math.max(0, m.index - 40), m.index) });
    }
  }
  return calls;
}

const lazyPrismaPromise = (log) => ({
  [Symbol.toStringTag]: 'PrismaPromise',
  then(resolve, reject) { log.push('ran'); return Promise.resolve('row').then(resolve, reject); },
});

ok('the retry wrapper turns a PrismaPromise into a plain Promise that runs at once (the reason for these rules)', async () => {
  const log = [];
  const base = { employee: { update: () => lazyPrismaPromise(log) } };
  assert.equal(base.employee.update()[Symbol.toStringTag], 'PrismaPromise');
  assert.equal(log.length, 0);
  const wrapped = wrapWithRetry(base).employee.update();
  assert.equal(wrapped[Symbol.toStringTag], 'Promise');
  await wrapped;
  assert.equal(log.length, 1);
});

ok('the scanner finds the batch transactions in src', () => {
  assert.ok(transactionCalls().length >= 10, `found only ${transactionCalls().length}`);
});

ok('no batch transaction is called on the wrapped client', () => {
  const bad = transactionCalls().filter((c) => c.receiver === 'prisma').map((c) => c.where);
  assert.deepEqual(bad, []);
});

ok('no batch transaction contains a query from the wrapped client', () => {
  const bad = transactionCalls().filter((c) => /\bprisma\.\w+\.\w+\(|deductionOps\(\s*prisma\b/.test(c.arg)).map((c) => c.where);
  assert.deepEqual(bad, []);
});

ok('every batch transaction is wrapped in withRetry', () => {
  const bad = transactionCalls().filter((c) => !/withRetry\(\(\)\s*=>\s*$/.test(c.before)).map((c) => c.where);
  assert.deepEqual(bad, []);
});

ok('no interactive transactions (the Neon pooler drops them)', () => {
  const bad = transactionCalls().filter((c) => /^\s*(async\b|\(?\s*\w*\s*\)?\s*=>)/.test(c.arg)).map((c) => c.where);
  assert.deepEqual(bad, []);
});

ok('no wrapped-client query is stored in an array (it would run immediately, outside any transaction)', () => {
  const bad = [];
  for (const { file, text } of FILES) {
    for (const m of text.matchAll(/(\.push\(\s*|\[\s*|\.\.\.)prisma\.\w+\.\w+\(/g)) {
      if (m[1].startsWith('[') && /Promise\.all\(\s*$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
      bad.push(`${file}:${lineOf(text, m.index)}`);
    }
    for (const m of text.matchAll(/deductionOps\(\s*prisma\b/g)) bad.push(`${file}:${lineOf(text, m.index)}`);
  }
  assert.deepEqual(bad, []);
});

ok('every Prisma model used in src exists in schema.prisma', () => {
  const schema = fs.readFileSync(path.resolve(SRC, '../prisma/schema.prisma'), 'utf8');
  const models = new Set([...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1][0].toLowerCase() + m[1].slice(1)));
  assert.ok(models.has('deliveryItem') && models.has('user'), 'schema models not found');
  const bad = [];
  for (const { file, text } of FILES) {
    for (const m of text.matchAll(/\b(?:prisma|prismaBase|db)\.([a-z]\w*)\./g)) {
      if (!models.has(m[1])) bad.push(`${file}:${lineOf(text, m.index)} ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

let passed = 0;
for (const [name, fn] of tests) { await fn(); passed++; console.log('  ok - ' + name); }
console.log(`\nALL ${passed} PRISMA SAFETY CHECKS PASSED`);
