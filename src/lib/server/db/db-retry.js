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
