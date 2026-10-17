import { flagField } from './field-rules';

let installed = false;

export function installFieldErrorFetch() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!res.ok && url.includes('/api/') && (res.headers.get('content-type') || '').includes('application/json')) {
        res.clone().json().then((data) => { if (data && data.field) setTimeout(() => flagField(data.field), 0); }).catch(() => {});
      }
    } catch { }
    return res;
  };
}
