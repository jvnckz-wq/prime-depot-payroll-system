// Transient-connection retry for the database client.
//
// Neon's free tier scales to zero. The first query after an idle period can land
// on a connection Neon terminates mid-flight while it cold-starts ("Connection
// terminated unexpectedly"). These are transient — the next attempt lands on a
// warm connection — so we retry a few times on connection-level errors only.
// Real errors (validation, unique-constraint, not-found, etc.) are re-thrown
// immediately, never retried.
//
// Kept in its own file, free of any Prisma import, so the logic can be unit
// tested against a mock client without a live database.

const CONNECTION_HINTS = [
  'connection terminated',
  'terminated unexpectedly',
  'econnreset',
  'connection reset',
  'connection closed',
  'connection refused',
  'econnrefused',
  "can't reach database server",
  'server has gone away',
  'timed out',
  'etimedout',
  'socket hang up',
];

export function isConnectionError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return CONNECTION_HINTS.some((hint) => msg.includes(hint));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Run fn(); on a transient connection error, wait briefly and try again. Backoff
// is short (300ms, then 600ms) — just enough to let Neon finish waking up.
export async function withRetry(fn, { tries = 3, baseDelay = 300 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === tries || !isConnectionError(err)) throw err;
      await sleep(baseDelay * attempt);
    }
  }
  throw lastErr;
}

// Wrap a Prisma client so every model query — prisma.employee.findMany(),
// prisma.delivery.count(), etc. — retries transient connection errors. Only
// model accessors (plain, non-"$", non-"_" object properties) are wrapped;
// Prisma's own control methods ($transaction, $queryRaw, $on, internals) pass
// through untouched so their behaviour never changes.
//
// IMPORTANT: a wrapped model method returns a plain Promise (withRetry is
// async), NOT a genuine PrismaPromise. That is fine for a normal `await`, but
// the array form prisma.$transaction([...]) rejects plain Promises with
// "All elements of the array need to be Prisma Client promises". For array
// batches, build the ops from the raw `prismaBase` client (see lib/prisma.js)
// and wrap the whole $transaction() call in withRetry() instead.
export function wrapWithRetry(client) {
  return new Proxy(client, {
    get(target, prop) {
      const value = target[prop];
      if (
        typeof prop === 'string' &&
        !prop.startsWith('$') &&
        !prop.startsWith('_') &&
        value && typeof value === 'object' && !Array.isArray(value)
      ) {
        return new Proxy(value, {
          get(model, method) {
            const fn = model[method];
            if (typeof fn === 'function') {
              return (...args) => withRetry(() => fn.apply(model, args));
            }
            return fn;
          },
        });
      }
      return value;
    },
  });
}
