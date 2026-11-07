// One rule for "is the scanner online", used by every screen and by the checker rule, so they
// never disagree. The sync agent reports every 15 seconds.
export const SYNC_LIVE_MS = 30 * 1000;
export const SYNC_OFFLINE_MS = 60 * 1000;

// 'live' (reported in the last 30 seconds), 'stale' (30 to 60 seconds), or 'offline'.
export function syncStatusOf(lastSyncAt, now = Date.now()) {
  if (!lastSyncAt) return 'offline';
  const age = now - new Date(lastSyncAt).getTime();
  return age < SYNC_LIVE_MS ? 'live' : age < SYNC_OFFLINE_MS ? 'stale' : 'offline';
}
