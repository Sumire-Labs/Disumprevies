// ---------------------------------------------------------------------------
// Database retry wrapper
//
// Wraps Prisma operations with automatic retry logic for transient errors:
//   P1001 — Can't reach database server   → 3 retries (1s, 3s, 10s)
//   P1008 — Operations timed out          → 2 retries (1s, 3s)
//   P1017 — Server closed the connection  → reconnect + 1 retry (1s)
//
// If all retries fail, the error is logged and re-thrown.
// Callers (pipeline, settings) should catch and skip detection rather than
// crashing the bot.
// ---------------------------------------------------------------------------

import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger/index.js';

// Retry delay sequences per error code (milliseconds).
const RETRY_DELAYS: Record<string, readonly number[]> = {
  P1001: [1_000, 3_000, 10_000],
  P1008: [1_000, 3_000],
  P1017: [1_000],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrismaKnownError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

function isPrismaInitError(
  err: unknown,
): err is Prisma.PrismaClientInitializationError {
  return err instanceof Prisma.PrismaClientInitializationError;
}

function getRetryDelays(err: unknown): readonly number[] | null {
  if (isPrismaKnownError(err)) {
    return RETRY_DELAYS[err.code] ?? null;
  }
  if (isPrismaInitError(err)) {
    // Treat init errors (e.g. can't connect at startup) like P1001.
    return RETRY_DELAYS['P1001'] ?? null;
  }
  return null;
}

/**
 * Execute a Prisma operation with automatic retry for transient DB errors.
 *
 * @param operation  A zero-arg async function that runs the Prisma query.
 * @param context    Optional structured context logged on retry/failure.
 * @returns          The result of `operation`.
 * @throws           Re-throws on non-retriable errors or after all retries
 *                   are exhausted (after logging the failure).
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  // First attempt — fast path, no overhead for healthy DB.
  try {
    return await operation();
  } catch (firstErr) {
    const delays = getRetryDelays(firstErr);
    if (delays === null) {
      // Non-retriable error — propagate immediately.
      throw firstErr;
    }

    let lastErr: unknown = firstErr;

    for (let i = 0; i < delays.length; i++) {
      const delay = delays[i] as number;
      logger.warn('DB operation failed, retrying', {
        attempt: i + 1,
        maxAttempts: delays.length,
        delayMs: delay,
        error: lastErr instanceof Error ? lastErr.message : String(lastErr),
        ...context,
      });

      await sleep(delay);

      // P1017: server closed connection — reconnect before retrying.
      if (isPrismaKnownError(lastErr) && lastErr.code === 'P1017') {
        try {
          await prisma.$disconnect();
          await prisma.$connect();
        } catch (reconnectErr) {
          logger.warn('DB reconnect failed', {
            error:
              reconnectErr instanceof Error
                ? reconnectErr.message
                : String(reconnectErr),
            ...context,
          });
        }
      }

      try {
        return await operation();
      } catch (retryErr) {
        lastErr = retryErr;
        // If subsequent error is also retriable, continue. Otherwise break.
        if (getRetryDelays(retryErr) === null) {
          break;
        }
      }
    }

    logger.error('DB operation failed after all retries', {
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
      ...context,
    });

    throw lastErr;
  }
}
