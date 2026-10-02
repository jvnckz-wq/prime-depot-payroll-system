const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.resolve(__dirname, '../src');
const WINDOW_MS = 15 * 60 * 1000;
const IP = '203.0.113.7';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeDb() {
  const attempts = new Map();
  const users = new Map();
  const audit = [];
  const sessions = [];
  const matches = (row, where = {}) =>
    (where.key === undefined || row.key === where.key) &&
    (where.firstAt?.lt === undefined || row.firstAt < where.firstAt.lt);
  const apply = (row, data) => {
    for (const [field, value] of Object.entries(data)) {
      row[field] = value && typeof value === 'object' && 'increment' in value ? row[field] + value.increment : value;
    }
  };
  return {
    attempts, users, audit, sessions,
    reset() { attempts.clear(); users.clear(); audit.length = 0; sessions.length = 0; },
    loginAttempt: {
      async upsert({ where, create, update }) {
        await tick();
        const row = attempts.get(where.key);
        if (row) apply(row, update);
        else attempts.set(where.key, { ...create });
        return { ...attempts.get(where.key) };
      },
      async deleteMany({ where } = {}) {
        await tick();
        let count = 0;
        for (const [key, row] of attempts) {
          if (matches(row, where)) { attempts.delete(key); count++; }
        }
        return { count };
      },
    },
    user: {
      async findUnique({ where }) { await tick(); return users.get(where.username) ?? null; },
      async update() { await tick(); return {}; },
    },
    session: {
      async create({ data }) { await tick(); sessions.push(data); return data; },
      async deleteMany() { await tick(); return { count: 0 }; },
    },
    auditLog: {
      async create({ data }) { await tick(); audit.push(data); return data; },
    },
  };
}

const db = fakeDb();

const cacheAs = (filename, exports) => {
  const m = new Module(filename);
  m.filename = filename;
  m.loaded = true;
  m.exports = exports;
  require.cache[filename] = m;
};

const SERVER_ONLY = path.join(__dirname, '__server-only__.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return SERVER_ONLY;
  if (request.startsWith('@/')) return resolve.call(this, path.join(SRC, request.slice(2)), ...rest);
  return resolve.call(this, request, ...rest);
};

cacheAs(SERVER_ONLY, {});
cacheAs(require.resolve('next/headers'), {
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => ({ get: () => null }),
});
cacheAs(path.join(SRC, 'lib/server/db/prisma.js'), { prisma: db, prismaBase: db });

const { POST } = require('../src/app/api/auth/login/route.js');

const RIGHT = 'Right#Pass1';
const addUser = (username, extra = {}) => db.users.set(username, {
  id: `id-${username}`, username, displayName: username, avatar: null, role: 'ADMIN', email: null,
  isActive: true, employeeId: null, employee: null, mustChangePassword: false, totpEnabled: false,
  passwordHash: bcrypt.hashSync(RIGHT, 4), ...extra,
});

async function login(username, password, ip = IP) {
  const res = await POST(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ username, password }),
  }));
  return { status: res.status, body: await res.json() };
}

const statuses = (results) => results.map((r) => r.status).sort();
const actions = (name) => db.audit.filter((a) => a.action === name).length;

const tests = [];
const ok = (name, fn) => tests.push([name, async () => { db.reset(); await fn(); }]);

ok('ten parallel wrong passwords: five reach the password check, five get 429', async () => {
  addUser('ops');
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => login('ops', `wrong-${i}`)));
  const allowed = results.filter((r) => r.status === 401).length;
  assert.ok(allowed <= 5, `${allowed} attempts got past the limit`);
  assert.deepEqual(statuses(results), [401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
  for (const r of results.filter((x) => x.status === 401)) assert.equal(r.body.error, 'Incorrect username or password.');
  for (const r of results.filter((x) => x.status === 429)) {
    assert.equal(r.body.error, 'Too many failed attempts. Please wait 15 minutes and try again.');
  }
  assert.equal(actions('LOGIN_FAILURE'), 5);
  assert.equal(actions('LOGIN_THROTTLED'), 5);
});

ok('a sixth attempt is refused even with the right password', async () => {
  addUser('ops');
  for (let i = 0; i < 5; i++) assert.equal((await login('ops', 'wrong')).status, 401);
  const sixth = await login('ops', RIGHT);
  assert.equal(sixth.status, 429);
  assert.equal(db.sessions.length, 0);
});

ok('unknown username: same message, same limit', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => login('nobody', 'guess')));
  assert.deepEqual(statuses(results), [401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
  for (const r of results.filter((x) => x.status === 401)) assert.equal(r.body.error, 'Incorrect username or password.');
});

ok('a disabled account gets the same 401 as a wrong password', async () => {
  addUser('gone', { isActive: false });
  const r = await login('gone', RIGHT);
  assert.equal(r.status, 401);
  assert.equal(r.body.error, 'Incorrect username or password.');
});

ok('the limit is per IP and username: another IP can still sign in', async () => {
  addUser('ops');
  db.attempts.set(`${IP}|ops`, { key: `${IP}|ops`, count: 9, firstAt: new Date(), lastAt: new Date() });
  assert.equal((await login('ops', RIGHT)).status, 429);
  const other = await login('ops', RIGHT, '198.51.100.20');
  assert.equal(other.status, 200);
  assert.equal(other.body.user.username, 'ops');
});

ok('success clears the key and sweeps expired windows only', async () => {
  addUser('ops');
  const now = Date.now();
  const row = (key, ageMs, count) => db.attempts.set(key, { key, count, firstAt: new Date(now - ageMs), lastAt: new Date(now - ageMs) });
  row(`${IP}|ops`, 60 * 1000, 3);
  row('198.51.100.1|old', WINDOW_MS + 60 * 1000, 2);
  row('198.51.100.2|recent', 60 * 1000, 2);
  const r = await login('ops', RIGHT);
  assert.equal(r.status, 200);
  assert.deepEqual([...db.attempts.keys()], ['198.51.100.2|recent']);
  assert.equal(actions('LOGIN_SUCCESS'), 1);
});

ok('an expired window starts over at one', async () => {
  addUser('ops');
  const old = new Date(Date.now() - WINDOW_MS - 60 * 1000);
  db.attempts.set(`${IP}|ops`, { key: `${IP}|ops`, count: 9, firstAt: old, lastAt: old });
  assert.equal((await login('ops', 'wrong')).status, 401);
  assert.equal(db.attempts.get(`${IP}|ops`).count, 1);
});

ok('two-factor accounts still get a pending session, not a full one', async () => {
  addUser('ops', { totpEnabled: true });
  const r = await login('ops', RIGHT);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { twoFactorRequired: true });
  assert.deepEqual(db.sessions.map((s) => s.pendingTwoFactor), [true]);
  assert.equal(db.attempts.size, 0);
});

ok('missing username or password is a 400 and uses no attempt', async () => {
  const r = await login('ops', '');
  assert.equal(r.status, 400);
  assert.equal(db.attempts.size, 0);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  }
  console.log(`\nALL ${passed} LOGIN LIMIT CHECKS PASSED`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
