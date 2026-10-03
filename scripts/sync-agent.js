const fs = require('fs');
const path = require('path');
const ZKLib = require('node-zklib');

const env = readEnv(path.join(process.cwd(), '.env'));
const LIVE = process.argv.includes('--live');
const DEVICE_IP = env.DEVICE_IP || '192.168.1.201';
const DEVICE_PORT = Number(env.DEVICE_PORT || 4370);
const PUSH_URL = env.PUSH_URL || 'http://localhost:3000/api/attendance/push';
const PULL_URL = env.PULL_URL || PUSH_URL.replace(/\/push\/?$/, '/pull');
const TOKEN = env.DEVICE_SYNC_TOKEN || '';
const POLL_MS = Number(env.SYNC_POLL_MS || 15000);

const hhmmFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});
const manilaHHMM = (d) => hhmmFmt.format(d);
const manilaDate = (d) => dateFmt.format(d);

function readEnv(file) {
  const out = {};
  try {
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
  }
  return out;
}

async function readToday() {
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);
  await zk.createSocket();
  let logs;
  try {
    logs = await zk.getAttendances();
  } finally {
    await zk.disconnect().catch(() => {});
  }

  const today = manilaDate(new Date());
  const byUser = new Map(); 

  for (const rec of (logs && logs.data) || []) {
    const bid = String(rec.deviceUserId ?? rec.uid ?? rec.id ?? '').trim();
    if (!bid) continue;
    const when = new Date(rec.recordTime);
    if (isNaN(when.getTime())) continue;
    if (manilaDate(when) !== today) continue; 
    if (!byUser.has(bid)) byUser.set(bid, new Set());
    byUser.get(bid).add(manilaHHMM(when));
  }

  const scans = [...byUser.entries()].map(([biometricId, set]) => ({
    biometricId,
    times: [...set].sort(),
  }));
  return { date: today, scans };
}

async function push(payload) {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function readPeriod(from, to) {
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);
  await zk.createSocket();
  let users, logs;
  try {
    users = await zk.getUsers();
    logs = await zk.getAttendances();
  } finally {
    await zk.disconnect().catch(() => {});
  }
  const roster = ((users && users.data) || [])
    .map((u) => ({ userId: String(u.userId ?? u.uid ?? '').trim(), name: u.name || null }))
    .filter((u) => u.userId);

  const sets = {}; 
  for (const rec of (logs && logs.data) || []) {
    const bid = String(rec.deviceUserId ?? rec.uid ?? rec.id ?? '').trim();
    if (!bid) continue;
    const when = new Date(rec.recordTime);
    if (isNaN(when.getTime())) continue;
    const ds = manilaDate(when);
    if (ds < from || ds > to) continue; 
    (sets[bid] ||= {});
    (sets[bid][ds] ||= new Set()).add(manilaHHMM(when));
  }
  const punches = {};
  for (const [bid, byDay] of Object.entries(sets)) {
    punches[bid] = {};
    for (const [ds, set] of Object.entries(byDay)) punches[bid][ds] = [...set].sort();
  }
  return { roster, punches };
}

let handledPull = null; 
async function handlePull(req, stamp) {
  if (!req || !req.id || req.id === handledPull) return;
  handledPull = req.id;
  console.log(`[${stamp}] Pull requested for ${req.from} to ${req.to} — reading device...`);
  try {
    const { roster, punches } = await readPeriod(req.from, req.to);
    const res = await fetch(PULL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ requestId: req.id, from: req.from, to: req.to, roster, punches }),
      signal: AbortSignal.timeout(90000),
    });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    if (res.status === 200 && body && body.ok) {
      console.log(`[${stamp}] Pull finalized: ${body.mappedRows} rows, ${body.matchedEmployees} employees, ${body.unmappedUsers} unmapped.`);
    } else {
      console.log(`[${stamp}] Pull failed (${res.status}):`, body);
    }
  } catch (e) {
    console.log(`[${stamp}] Pull could not complete: ${e.message}`);
    try {
      await fetch(PULL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ requestId: req.id, failed: true, error: `Could not read the device: ${e.message}` }),
        signal: AbortSignal.timeout(15000),
      });
    } catch { }
  }
}

let busy = false;
async function cycle() {
  if (busy) return; 
  busy = true;
  const stamp = new Date().toLocaleTimeString();
  try {
    let payload;
    try {
      payload = await readToday();
    } catch (e) {
      console.log(`[${stamp}] Hindi nabasa ang device (${DEVICE_IP}:${DEVICE_PORT}): ${e.message}`);
      return;
    }

    if (!LIVE) {
      if (!payload.scans.length) {
        console.log(`[${stamp}] [DRY RUN] Walang tapik ngayong araw (${payload.date}).`);
      } else {
        console.log(`[${stamp}] [DRY RUN] Ipapadala para sa ${payload.date}:`);
        for (const s of payload.scans) {
          console.log(`           user ${s.biometricId}: [${s.times.join(', ')}]`);
        }
        console.log('           (walang isinulat -- magdagdag ng --live para tunay na magpadala)');
      }
      return;
    }

    let status, body;
    try {
      ({ status, body } = await push(payload));
    } catch (e) {
      console.log(`[${stamp}] Nabasa ang device pero hindi maabot ang server (${PUSH_URL}): ${e.message}`);
      return;
    }
    if (status === 200 && body && body.ok) {
      if (payload.scans.length) {
        const unmapped = (body.unmapped || []).join(', ');
        console.log(`[${stamp}] Naipadala: matched ${body.matched}, unmapped [${unmapped}]`);
      } else {
        console.log(`[${stamp}] Heartbeat (walang bagong tapik).`);
      }
      if (body.pull) await handlePull(body.pull, stamp);
    } else {
      console.log(`[${stamp}] Push tumanggi (${status}):`, body);
    }
  } catch (e) {
    console.log(`[${stamp}] Error: ${e.message}`);
  } finally {
    busy = false;
  }
}

console.log('Prime Depot sync agent');
console.log(`  device : ${DEVICE_IP}:${DEVICE_PORT}`);
console.log(`  target : ${PUSH_URL}`);
console.log(`  mode   : ${LIVE ? 'LIVE (magsusulat sa database)' : 'DRY RUN (walang isusulat)'}`);
console.log(`  poll   : bawat ${POLL_MS / 1000}s`);

if (LIVE && !TOKEN) {
  console.error('\nHUMINTO: --live pero walang DEVICE_SYNC_TOKEN sa .env. Idagdag muna ito.');
  process.exit(1);
}
if (LIVE && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(PUSH_URL)) {
  console.warn('\nBABALA: localhost ang target. Kung sa live site dapat magpadala, ilagay sa .env ang');
  console.warn('  PUSH_URL=https://prime-depot-payroll-system.vercel.app/api/attendance/push');
}

console.log('\nCtrl+C para itigil.\n');

cycle();
const timer = setInterval(cycle, POLL_MS);
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nItinigil ang agent.');
  process.exit(0);
});
