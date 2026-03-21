// ---------------------------------------------------------------------------
// TimedMap — TTL-backed Map with optional LRU eviction
//
// Each entry stores:
//   - value:        the stored value
//   - ttlExpiresAt: absolute timestamp after which the entry is stale
//   - lastUsedAt:   timestamp of last read or write (used for LRU ordering)
//
// Cleanup removes all entries whose ttlExpiresAt has passed.
// When maxSize is set and the store is full, the least-recently-used entry
// is evicted before inserting a new key.
// ---------------------------------------------------------------------------

interface TimedEntry<V> {
  value: V;
  ttlExpiresAt: number;
  lastUsedAt: number;
}

export interface TimedMapOptions {
  /** Time-to-live in milliseconds for each entry. */
  ttlMs: number;
  /**
   * Maximum number of entries. When the store reaches this limit and a new
   * key is inserted, the least-recently-used entry is evicted first.
   * Defaults to Infinity (no limit).
   */
  maxSize?: number;
}

export class TimedMap<K, V> {
  private readonly store = new Map<K, TimedEntry<V>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: TimedMapOptions) {
    this.ttlMs = options.ttlMs;
    this.maxSize = options.maxSize ?? Infinity;
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /**
   * Store a value under key.
   * If the store is at maxSize and key is new, the LRU entry is evicted first.
   */
  set(key: K, value: V): void {
    const now = Date.now();
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      this.evictLRU();
    }
    this.store.set(key, { value, ttlExpiresAt: now + this.ttlMs, lastUsedAt: now });
  }

  /**
   * Retrieve a value. Returns undefined if the key is missing or TTL-expired.
   * Updates lastUsedAt on a hit (for LRU ordering).
   */
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() > entry.ttlExpiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.lastUsedAt = Date.now();
    return entry.value;
  }

  /** Delete a single entry. Returns true if the key existed. */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /** Remove all entries (including non-expired ones). */
  clear(): void {
    this.store.clear();
  }

  /**
   * Remove all entries whose key satisfies the predicate.
   * Useful for guild-scoped cleanup: `deleteWhere((k) => k.startsWith(guildId + ':'))`.
   */
  deleteWhere(predicate: (key: K) => boolean): void {
    for (const key of this.store.keys()) {
      if (predicate(key)) {
        this.store.delete(key);
      }
    }
  }

  /** Current number of entries (including potentially-expired ones not yet cleaned). */
  get size(): number {
    return this.store.size;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Remove all TTL-expired entries. Call periodically or via startAutoCleanup(). */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.ttlExpiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Start a periodic cleanup interval.
   * The timer is unreffed so it does not prevent the process from exiting.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  startAutoCleanup(intervalMs: number): void {
    if (this.cleanupTimer !== null) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
    this.cleanupTimer.unref();
  }

  /** Stop the periodic cleanup timer (e.g. during graceful shutdown). */
  stopAutoCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // LRU eviction
  // ---------------------------------------------------------------------------

  private evictLRU(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.lastUsedAt < oldestTime) {
        oldestTime = entry.lastUsedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
    }
  }
}
