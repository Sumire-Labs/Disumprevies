import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActionQueue } from '../ActionQueue.js';

// Suppress logger output in tests.
vi.mock('../../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ActionQueue', () => {
  let queue: ActionQueue;

  beforeEach(() => {
    queue = new ActionQueue();
  });

  afterEach(() => {
    queue.stop();
  });

  it('executes a single enqueued action', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await queue.enqueue(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('executes multiple actions sequentially', async () => {
    const order: number[] = [];
    const actions = [1, 2, 3].map((n) =>
      vi.fn(async () => {
        order.push(n);
      }),
    );

    const p1 = queue.enqueue(actions[0]!);
    const p2 = queue.enqueue(actions[1]!);
    const p3 = queue.enqueue(actions[2]!);

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('resolves the promise when the action completes', async () => {
    let resolved = false;
    await queue.enqueue(async () => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });

  it('rejects the promise when the action throws', async () => {
    const err = new Error('boom');
    // Await the rejection directly — attach handler immediately to avoid unhandled rejection.
    await expect(
      queue.enqueue(async () => {
        throw err;
      }),
    ).rejects.toThrow('boom');
  });

  it('onOverflow callback is called when queue overflows (101st item)', async () => {
    const overflowCount = { value: 0 };
    const overflowQueue = new ActionQueue({
      onOverflow: (n) => {
        overflowCount.value += n;
      },
    });
    // Freeze processing so items accumulate.
    overflowQueue.stop();

    // Enqueue 100 items (fill to capacity) without awaiting (queue is stopped).
    for (let i = 0; i < 100; i++) {
      void overflowQueue.enqueue(vi.fn().mockResolvedValue(undefined));
    }

    expect(overflowCount.value).toBe(0);
    expect(overflowQueue.size).toBe(100);

    // 101st item — triggers overflow, oldest item's promise resolves silently.
    void overflowQueue.enqueue(vi.fn().mockResolvedValue(undefined));

    expect(overflowCount.value).toBe(1);
    // Size stays at 100 (oldest dropped, new one added).
    expect(overflowQueue.size).toBe(100);

    overflowQueue.stop();
  });

  it('discards oldest item (its promise resolves without running) on overflow', async () => {
    const firstActionRan = { value: false };
    const overflowQueue = new ActionQueue();
    overflowQueue.stop(); // freeze processing

    // Fill to capacity — first item is the one we track.
    const firstP = overflowQueue.enqueue(async () => {
      firstActionRan.value = true;
    });
    for (let i = 1; i < 100; i++) {
      void overflowQueue.enqueue(vi.fn().mockResolvedValue(undefined));
    }

    // 101st triggers overflow — first item is discarded (promise resolves silently).
    void overflowQueue.enqueue(vi.fn().mockResolvedValue(undefined));

    // The first promise should have resolved (skipped, not run).
    await firstP;
    expect(firstActionRan.value).toBe(false);

    overflowQueue.stop();
  });

  it('drain resolves after all actions complete', async () => {
    const completed: number[] = [];

    for (let i = 0; i < 3; i++) {
      const n = i;
      void queue.enqueue(async () => {
        completed.push(n);
      });
    }

    await queue.drain(2_000);
    expect(completed).toHaveLength(3);
  });

  it('stop() halts the processing timer', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    void queue.enqueue(fn);
    queue.stop();

    // After stop, wait for several tick intervals — action should NOT run.
    await new Promise((r) => setTimeout(r, 400));
    expect(fn).not.toHaveBeenCalled();
  });
});
