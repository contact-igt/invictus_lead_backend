/**
 * Tiny in-process TTL cache.
 *
 * Good enough for low-cardinality, read-heavy data (filter option lists)
 * on a single Node instance. If the API is ever horizontally scaled this
 * should move to Redis, but the interface can stay the same.
 */
export class TtlCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  /** Drop every entry — call after a write that changes the cached data. */
  clear() {
    this.store.clear();
  }
}
