// Pull a whole cutoff from the ZKTeco device and finalize it for payroll.
//
// Run this on the warehouse laptop at cutoff, instead of exporting and importing
// a .xls. It reads the FULL period from the device (including scans made while
// the laptop was off, since the device stores them), then posts them to
// /api/attendance/pull, which writes present + absences using the exact same
// logic as the .xls import. The result shows up in Employee DTR and Import
// History like any import, and stays fully editable.
//
//   node scripts/pull-cutoff.js                 # pick the cutoff from a menu
//   node scripts/pull-cutoff.js 2026-09-16 2026-09-30   # or pass dates
//
// Nothing is written until you confirm. CommonJS on purpose (matches node-zklib).

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const ZKLib = require('node-zklib');

// ---- config -------------------------------------------------------------
const env = readEnv(path.join(process.cwd(), '.env'));
const DEVICE_IP = env.DEVICE_IP || '192.168.1.201';
const DEVICE_PORT = Number(env.DEVICE_PORT || 4370);
const PUSH_URL = env.PUSH_URL || 'http://localhost:3000/api/attendance/push';
const PULL_URL = env.PULL_URL || PUSH_URL.replace(/\/push\/?$/, '/pull');
const TOKEN = env.DEVICE_SYNC_TOKEN || '';

// ---- Manila time helpers (device time is stored local; format explicitly) ---
const hhmmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      out[key] = val;
    }
  } catch { /* no .env */ }
  return out;
}

// ---- cutoff maths (1-15 and 16-end each month) --------------------------
function cutoffOf(y, mi0, half) {
  const mm = String(mi0 + 1).padStart(2, '0');
  if (half === 'A') return { from: `${y}-${mm}-01`, to: `${y}-${mm}-15` };
  const end = new Date(Date.UTC(y, mi0 + 1, 0)).getUTCDate();
  return { from: `${y}-${mm}-16`, to: `${y}-${mm}-${String(end).padStart(2, '0')}` };
}
function recentCutoffs(todayStr, n = 3) {
  const [y, m, d] = todayStr.split('-').map(Number);
  let yy = y, mi = m - 1, half = d <= 15 ? 'A' : 'B';
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push(cutoffOf(yy, mi, half));
    if (half === 'B') half = 'A';
    else { half = 'B'; mi -= 1; if (mi < 0) { mi = 11; yy -= 1; } }
  }
  return list;
}
const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const label = (c) => {
  const f = new Date(`${c.from}T00:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const t = new Date(`${c.to}T00:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${f} - ${t}`;
};

// ---- read the whole period from the device ------------------------------
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
    if (ds < from || ds > to) continue; // string compare works for YYYY-MM-DD
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

// ---- main ---------------------------------------------------------------
async function main() {
  console.log('Prime Depot cutoff pull');
  console.log(`  device : ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log(`  target : ${PULL_URL}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  try {
    // Period: from args, or a menu.
    let from = process.argv[2];
    let to = process.argv[3];
    if (!(validYmd(from) && validYmd(to))) {
      const today = manilaDate(new Date());
      const list = recentCutoffs(today, 3);
      console.log('Which cutoff to pull and finalize?');
      console.log(`  1) ${label(list[0])}   (current cutoff, may still be in progress)`);
      console.log(`  2) ${label(list[1])}`);
      console.log(`  3) ${label(list[2])}`);
      console.log('  4) Enter custom dates');
      const choice = (await ask('Choice [2]: ')).trim() || '2';
      if (choice === '1' || choice === '2' || choice === '3') {
        ({ from, to } = list[Number(choice) - 1]);
      } else if (choice === '4') {
        from = (await ask('  From (YYYY-MM-DD): ')).trim();
        to = (await ask('  To   (YYYY-MM-DD): ')).trim();
      } else {
        console.log('Cancelled.'); rl.close(); return;
      }
    }
    if (!(validYmd(from) && validYmd(to)) || to < from) {
      console.error('Invalid dates. Expected YYYY-MM-DD with "to" on or after "from".');
      rl.close(); return;
    }
    if (!TOKEN) {
      console.error('\nHUMINTO: walang DEVICE_SYNC_TOKEN sa .env. Idagdag muna ito.');
      rl.close(); return;
    }

    const ok = (await ask(`\nPull ${from} to ${to} from the device and finalize (present + absences)? (y/N): `)).trim().toLowerCase();
    if (ok !== 'y' && ok !== 'yes') { console.log('Cancelled.'); rl.close(); return; }

    console.log('\nReading the device...');
    const { roster, punches } = await readPeriod(from, to);
    const scanCount = Object.values(punches).reduce((a, d) => a + Object.values(d).reduce((b, arr) => b + arr.length, 0), 0);
    console.log(`  ${roster.length} enrolled users, ${scanCount} scans in the period.`);

    console.log('Finalizing on the server...');
    const res = await fetch(PULL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ from, to, roster, punches }),
    });
    const text = await res.text();
    let bodyOut; try { bodyOut = JSON.parse(text); } catch { bodyOut = text; }

    if (res.status === 200 && bodyOut && bodyOut.ok) {
      console.log('\nDone. Finalized from the device:');
      console.log(`  matched employees : ${bodyOut.matchedEmployees}`);
      console.log(`  rows written      : ${bodyOut.mappedRows} (present + absent)`);
      console.log(`  unmapped users    : ${bodyOut.unmappedUsers} (see Unmapped IDs tab)`);
      console.log('\nOpen Attendance -> Employee DTR to review. Everything is editable.');
    } else {
      console.error(`\nFailed (${res.status}):`, bodyOut);
    }
  } catch (e) {
    console.error('\nCould not complete the pull:', e.message);
  } finally {
    rl.close();
  }
}

main();
