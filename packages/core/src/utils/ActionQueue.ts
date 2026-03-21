// ---------------------------------------------------------------------------
// ActionQueue — serialises Discord API moderation calls with rate-limit
// protection.
//
// During a raid, many pipeline runs fire simultaneously and each could trigger
// a ban/kick/mute/delete call.  Processing them all at once increases the risk
// of hitting Discord's rate limits.  ActionQueue serialises these calls,
// executing one every QUEUE_INTERVAL_MS milliseconds.
//
// Overflow behaviour:
//   If more than MAX_QUEUE_SIZE items are waiting, the oldest item is silently
//   resolved (skipped) and a warning is logged.  The caller (ActionExecutor)
//   sees a resolved promise so it doesn't treat the skip as an error.
//
// Lifecycle:
//   - The queue starts its processing timer lazily on the first enqueue.
//   - Call stop() to halt the timer (e.g. during graceful shutdown).
//   - Call drain(maxWaitMs) to wait for remaining items before shutdown.
// ---------------------------------------------------------------------------

import { logger } from '../logger/index.js';

const QUEUE_INTERVAL_MS = 100;
const MAX_QUEUE_SIZE = 100;

interface QueueEntry {
  action: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export class ActionQueue {
  private readonly queue: QueueEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private readonly onOverflow: ((skippedCount: number) => void) | undefined;

  constructor(options?: { onOverflow?: (skippedCount: number) => void }) {
    this.onOverflow = options?.onOverflow;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Enqueue a Discord API action.
   *
   * Returns a Promise that resolves when the action executes (or when it is
   * discarded due to overflow).  Rejects only if the action itself throws.
   */
  enqueue(action: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        // Discard the oldest entry to make room — resolve it silently so the
        // caller continues without error.
        const oldest = this.queue.shift();
        if (oldest !== undefined) {
          oldest.resolve();
        }

        logger.warn('Action queue overflow: oldest action discarded', {
          queueSize: MAX_QUEUE_SIZE,
        });
        this.onOverflow?.(1);
      }

      this.queue.push({ action, resolve, reject });
      this.startTimer();
    });
  }

  /**
   * Wait for all currently queued actions to finish (or timeout).
   * Use during graceful shutdown before destroying the client.
   */
  async drain(maxWaitMs = 5_000): Promise<void> {
    const deadline = Date.now() + maxWaitMs;

    while (this.queue.length > 0 || this.processing) {
      if (Date.now() >= deadline) {
        logger.warn('Action queue drain timed out', {
          remaining: this.queue.length,
        });
        break;
      }
      await sleep(QUEUE_INTERVAL_MS);
    }
  }

  /** Stop the processing timer (does not clear pending items). */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get size(): number {
    return this.queue.length;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, QUEUE_INTERVAL_MS);
    // Unref so the timer does not prevent the process from exiting naturally.
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const entry = this.queue.shift();

    if (entry !== undefined) {
      try {
        await entry.action();
        entry.resolve();
      } catch (err) {
        entry.reject(err);
      }
    }

    this.processing = false;
  }
}

// Module-level singleton shared by all ActionExecutor instances.
export const actionQueue = new ActionQueue();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
