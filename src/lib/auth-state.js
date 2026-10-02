export function authStateFrom(status, body) {
  const ok = status >= 200 && status < 300;
  if (ok && body?.user) return 'signed-in';
  if ((ok && body?.user === null) || status === 401) return 'signed-out';
  return 'unreachable';
}
