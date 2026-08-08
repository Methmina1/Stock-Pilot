const cache = new Map();

export function getCached(key, maxAgeMs = 30000) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

export function clearCache(keyPrefix) {
  if (!keyPrefix) { cache.clear(); return; }
  for (const k of cache.keys()) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
}
