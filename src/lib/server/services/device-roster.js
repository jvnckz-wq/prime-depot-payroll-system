import { prisma } from '../db/prisma';

const MAX_USERS = 3000;

export function cleanRoster(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const u of input.slice(0, MAX_USERS)) {
    const userId = String(u?.userId ?? '').trim().slice(0, 20);
    if (!/^\d+$/.test(userId) || seen.has(userId)) continue;
    seen.add(userId);
    const name = String(u?.name ?? '').replace(/[^\p{L}\p{N} .,'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || null;
    out.push({ userId, name });
  }
  return out.sort((a, b) => Number(a.userId) - Number(b.userId));
}

export async function enrolledNotRegistered() {
  const sync = await prisma.deviceSync.findUnique({ where: { id: 'primary' }, select: { roster: true, rosterAt: true, ignoredIds: true } });
  const roster = Array.isArray(sync?.roster) ? sync.roster : [];
  if (!roster.length) return { users: [], rosterAt: sync?.rosterAt || null };
  const ids = roster.map((u) => u.userId);
  const known = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const knownIds = new Set(known.map((e) => e.id));
  const ignored = new Set(sync.ignoredIds || []);
  const users = roster.filter((u) => !knownIds.has(u.userId) && !ignored.has(u.userId));
  return { users, rosterAt: sync.rosterAt };
}
