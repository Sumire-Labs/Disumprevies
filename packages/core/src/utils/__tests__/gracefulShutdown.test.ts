// ---------------------------------------------------------------------------
// Graceful shutdown tests
//
// These tests verify that the ActionQueue correctly supports the shutdown
// sequence: drain() waits for pending items, then stop() halts the timer.
// This mirrors what bot/index.ts does on SIGTERM/SIGINT.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ActionQueue } from '../ActionQueue.js';

vi.mock('../../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Graceful shutdown — ActionQueue drain + stop', () => {
  let queue: ActionQueue;

  afterEach(() => {
    queue.stop();
  });

  it('drain() processes all pending actions before resolving', async () => {
    queue = new ActionQueue();
    const completed: number[] = [];

    void queue.enqueue(async () => { completed.push(1); });
    void queue.enqueue(async () => { completed.push(2); });
    void queue.enqueue(async () => { completed.push(3); });

    await queue.drain(3_000);

    expect(completed).toEqual([1, 2, 3]);
  });

  it('stop() prevents further processing after being called', async () => {
    queue = new ActionQueue();
    const fn = vi.fn().mockResolvedValue(undefined);

    void queue.enqueue(fn);
    queue.stop();

    // Wait several tick intervals — action should NOT run because stop was called.
    await new Promise((r) => setTimeout(r, 400));
    expect(fn).not.toHaveBeenCalled();
  });

  it('drain() resolves quickly when queue is empty', async () => {
    queue = new ActionQueue();
    const start = Date.now();
    await queue.drain(5_000);
    const elapsed = Date.now() - start;
    // Should resolve in well under 1 second when nothing is queued.
    expect(elapsed).toBeLessThan(500);
  });

  it('drain() times out and resolves after maxWaitMs when queue is stalled', async () => {
    queue = new ActionQueue();

    // Enqueue a very slow action (simulated by stopping the timer).
    void queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 10_000)); // 10s — will not complete in time
    });

    // Stop the queue so the timer doesn't process this action.
    // We re-start by calling enqueue indirectly... Actually just don't stop.
    // Let drain timeout naturally with a small maxWaitMs.

    const start = Date.now();
    await queue.drain(200); // 200ms max wait
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(200);
    // Still a reasonable upper bound.
    expect(elapsed).toBeLessThan(1_000);
  });
});
