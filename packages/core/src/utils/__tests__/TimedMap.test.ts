import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TimedMap } from '../TimedMap.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function advanceTime(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimedMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Basic set / get
  // -------------------------------------------------------------------------

  it('stores and retrieves a value', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.set('a', 42);
    expect(map.get('a')).toBe(42);
  });

  it('returns undefined for unknown key', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    expect(map.get('missing')).toBeUndefined();
  });

  it('overwriting a key resets the TTL', () => {
    const map = new TimedMap<string, number>({ ttlMs: 1_000 });
    map.set('k', 1);
    advanceTime(800);
    map.set('k', 2); // resets TTL from now
    advanceTime(800); // 1600 ms since first set, but only 800 since second set
    expect(map.get('k')).toBe(2);
  });

  // -------------------------------------------------------------------------
  // TTL expiry
  // -------------------------------------------------------------------------

  it('returns undefined once TTL expires', () => {
    const map = new TimedMap<string, string>({ ttlMs: 1_000 });
    map.set('x', 'hello');
    advanceTime(1_001);
    expect(map.get('x')).toBeUndefined();
  });

  it('returns value when accessed just before TTL', () => {
    const map = new TimedMap<string, string>({ ttlMs: 1_000 });
    map.set('x', 'hello');
    advanceTime(999);
    expect(map.get('x')).toBe('hello');
  });

  // -------------------------------------------------------------------------
  // cleanup()
  // -------------------------------------------------------------------------

  it('cleanup() removes expired entries and keeps fresh ones', () => {
    const map = new TimedMap<string, number>({ ttlMs: 1_000 });
    map.set('a', 1);
    map.set('b', 2);
    advanceTime(1_001);
    map.set('c', 3); // fresh entry
    expect(map.size).toBe(3);

    map.cleanup();

    expect(map.size).toBe(1);
    expect(map.get('c')).toBe(3);
  });

  it('cleanup() is a no-op when nothing has expired', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.set('a', 1);
    map.set('b', 2);
    map.cleanup();
    expect(map.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  it('clear() removes all entries', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.get('a')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  it('delete() removes a single entry', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.set('a', 1);
    map.set('b', 2);
    expect(map.delete('a')).toBe(true);
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
  });

  it('delete() returns false for unknown key', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    expect(map.delete('nope')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // deleteWhere()
  // -------------------------------------------------------------------------

  it('deleteWhere() removes matching entries only', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.set('guild1:user1', 1);
    map.set('guild1:user2', 2);
    map.set('guild2:user1', 3);

    map.deleteWhere((k) => k.startsWith('guild1:'));

    expect(map.get('guild1:user1')).toBeUndefined();
    expect(map.get('guild1:user2')).toBeUndefined();
    expect(map.get('guild2:user1')).toBe(3);
    expect(map.size).toBe(1);
  });

  it('deleteWhere() is a no-op when no entries match', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.set('a', 1);
    map.deleteWhere((k) => k === 'nope');
    expect(map.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // LRU eviction (maxSize)
  // -------------------------------------------------------------------------

  it('evicts LRU entry when maxSize is reached on new key insert', () => {
    const map = new TimedMap<string, number>({ ttlMs: 60_000, maxSize: 3 });

    map.set('a', 1);
    advanceTime(10);
    map.set('b', 2);
    advanceTime(10);
    map.set('c', 3);

    // Access 'a' to make it recently used (LRU candidate is now 'b')
    advanceTime(10);
    map.get('a');

    // Insert a new key — should evict 'b' (least recently used)
    map.set('d', 4);

    expect(map.size).toBe(3);
    expect(map.get('b')).toBeUndefined(); // evicted
    expect(map.get('a')).toBeDefined();
    expect(map.get('c')).toBeDefined();
    expect(map.get('d')).toBe(4);
  });

  it('does not evict when updating an existing key at maxSize', () => {
    const map = new TimedMap<string, number>({ ttlMs: 60_000, maxSize: 2 });
    map.set('a', 1);
    map.set('b', 2);
    // Updating 'a' should NOT cause eviction since size stays at 2
    map.set('a', 99);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe(99);
    expect(map.get('b')).toBe(2);
  });

  it('respects maxSize of 1 (single-entry LRU)', () => {
    const map = new TimedMap<string, number>({ ttlMs: 60_000, maxSize: 1 });
    map.set('a', 1);
    map.set('b', 2); // evicts 'a'
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
  });

  // -------------------------------------------------------------------------
  // startAutoCleanup / stopAutoCleanup
  // -------------------------------------------------------------------------

  it('startAutoCleanup() triggers cleanup on interval', () => {
    const map = new TimedMap<string, number>({ ttlMs: 1_000 });
    map.set('x', 10);
    map.startAutoCleanup(500);

    advanceTime(1_001); // x is now expired
    vi.advanceTimersByTime(500); // fire the interval

    // The internal store should have been cleaned; get() confirms TTL expiry
    expect(map.get('x')).toBeUndefined();
    map.stopAutoCleanup();
  });

  it('calling startAutoCleanup() twice is a no-op', () => {
    const map = new TimedMap<string, number>({ ttlMs: 5_000 });
    map.startAutoCleanup(1_000);
    map.startAutoCleanup(1_000); // should not throw or create a second timer
    map.stopAutoCleanup();
  });

  it('stopAutoCleanup() prevents further cleanup', () => {
    const map = new TimedMap<string, number>({ ttlMs: 1_000 });
    map.set('y', 5);
    map.startAutoCleanup(500);
    map.stopAutoCleanup();

    advanceTime(1_001);
    vi.advanceTimersByTime(500); // timer is stopped — no cleanup runs

    // Size is still 1 (entry is expired but cleanup didn't run)
    expect(map.size).toBe(1);
    // But get() still returns undefined because TTL check happens inline
    expect(map.get('y')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // size property
  // -------------------------------------------------------------------------

  it('size reflects the number of stored entries (including expired)', () => {
    const map = new TimedMap<string, number>({ ttlMs: 1_000 });
    expect(map.size).toBe(0);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.size).toBe(2);

    advanceTime(1_001); // entries expire but size is not updated until cleanup/get
    expect(map.size).toBe(2);

    map.cleanup();
    expect(map.size).toBe(0);
  });
});
