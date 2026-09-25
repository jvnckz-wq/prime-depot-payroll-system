// Live attendance sync agent for the ZKTeco ZK3969.
//
// Runs on the laptop beside the device. Every poll it connects to the device,
// reads the day's punches, converts each to Manila wall-clock HH:MM, groups
// them per biometric User ID, and hands the full day to
// POST /api/attendance/push. The server is the single source of pairing truth
// (stateless re-pair: it pairs and rewrites that day's rows); this agent only
// reads, converts, and forwards.
//
// SAFE BY DEFAULT: dry run. It prints what it WOULD send and writes nothing.
// Add --live to actually post. Live mode needs DEVICE_SYNC_TOKEN in .env.
//
//   node scripts/sync-agent.js            # dry run (no writes)
//   node scripts/sync-agent.js --live     # real sync
//
// Run it from the repo root so it can read .env. CommonJS on purpose: it
// matches node-zklib (a CommonJS package) and needs no build step.

const fs = require('fs');
const path = require('path');
const ZKLib = require('node-zklib');

// ---- config -------------------------------------------------------------
const env = readEnv(path.join(process.cwd(), '.env'));
const LIVE = process.argv.includes('--live');
const DEVICE_IP = env.DEVICE_IP || '192.168.1.201';
const DEVICE_PORT = Number(env.DEVICE_PORT || 4370);
const PUSH_URL = env.PUSH_URL || 'http://localhost:3000/api/attendance/push';
const PULL_URL = env.PULL_URL || PUSH_URL.replace(/\/push\/?$/, '/pull');
const TOKEN = env.DEVICE_SYNC_TOKEN || '';
const POLL_MS = Number(env.SYNC_POLL_MS || 15000);

// ---- Manila time helpers ------------------------------------------------
// The device stores local time; node-zklib returns it as a UTC instant
// (verified against a real scan: 02:30Z == 10:30 AM Manila). Formatting with
// an explicit Asia/Manila zone gives the correct wall clock regardless of the
// laptop's own timezone setting.
const hhmmFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});
const manilaHHMM = (d) => hhmmFmt.format(d);
const manilaDate = (d) => dateFmt.format(d); // YYYY-MM-DD

// ---- tiny .env reader (no dependency) -----------------------------------
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
    // No .env is fine for a dry run; live mode checks for the token below.
  }
  return out;
}

// ---- read + group one day's punches from the device ---------------------
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
  const byUser = new Map(); // biometricId -> Set of 'HH:MM'

  for (const rec of (logs && logs.data) || []) {
    const bid = String(rec.deviceUserId ?? rec.uid ?? rec.id ?? '').trim();
    if (!bid) continue;
    const when = new Date(rec.recordTime);
    if (isNaN(when.getTime())) continue;
    if (manilaDate(when) !== today) continue; // only today's punches
    if (!byUser.has(bid)) byUser.set(bid, new Set());
    byUser.get(bid).add(manilaHHMM(when));
  }

  const scans = [...byUser.entries()].map(([biometricId, set]) => ({
    biometricId,
    times: [...set].sort(),
  }));
  return { date: today, scans };
}

// ---- push (live only) ---------------------------------------------------
async function push(payload) {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

// ---- read a whole cutoff from the device (for a queued web pull) ---------
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

  const sets = {}; // userId -> date -> Set of HH:MM
  for (const rec of (logs && logs.data) || []) {
    const bid = String(rec.deviceUserId ?? rec.uid ?? rec.id ?? '').trim();
    if (!bid) continue;
    const when = new Date(rec.recordTime);
    if (isNaN(when.getTime())) continue;
    const ds = manilaDate(when);
    if (ds < from || ds > to) continue; // YYYY-MM-DD string compare
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

// ---- handle a queued "Pull from device" from the web button -------------
let handledPull = null; // last request id handled, to avoid re-running within a cycle
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
    // Tell the app so the request shows "Failed" instead of hanging on "Pulling".
    try {
      await fetch(PULL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ requestId: req.id, failed: true, error: `Could not read the device: ${e.message}` }),
      });
    } catch { /* ignore */ }
  }
}

// ---- one cycle ----------------------------------------------------------
let busy = false;
async function cycle() {
  if (busy) return; // skip if the previous read is still running
  busy = true;
  const stamp = new Date().toLocaleTimeString();
  try {
    const payload = await readToday();

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

    // LIVE: post every cycle, even with no scans, so the server gets a heartbeat
    // and the Live tab can tell "connected" from "the agent is dead."
    const { status, body } = await push(payload);
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
    console.log(`[${stamp}] Hindi nabasa ang device: ${e.message}`);
  } finally {
    busy = false;
  }
}

// ---- startup ------------------------------------------------------------
console.log('Prime Depot sync agent');
console.log(`  device : ${DEVICE_IP}:${DEVICE_PORT}`);
console.log(`  target : ${PUSH_URL}`);
console.log(`  mode   : ${LIVE ? 'LIVE (magsusulat sa database)' : 'DRY RUN (walang isusulat)'}`);
console.log(`  poll   : bawat ${POLL_MS / 1000}s`);

if (LIVE && !TOKEN) {
  console.error('\nHUMINTO: --live pero walang DEVICE_SYNC_TOKEN sa .env. Idagdag muna ito.');
  process.exit(1);
}

console.log('\nCtrl+C para itigil.\n');

cycle();
const timer = setInterval(cycle, POLL_MS);
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nItinigil ang agent.');
  process.exit(0);
});
