import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Mock logger to suppress output.
vi.mock('../../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock db to avoid real Prisma connections.
vi.mock('../../db.js', () => ({
  prisma: {
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $connect: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import AFTER mocks are set up.
const { withDbRetry } = await import('../database.js');

function makePrismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('DB error', {
    code,
    clientVersion: '5.0.0',
  });
}

describe('withDbRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the result of a successful operation immediately', async () => {
    const result = await withDbRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('propagates non-retriable Prisma errors immediately', async () => {
    // P2025 = Record not found — not retriable.
    const err = makePrismaKnownError('P2025');
    await expect(withDbRetry(() => Promise.reject(err))).rejects.toThrow();
  });

  it('propagates non-Prisma errors immediately', async () => {
    const err = new Error('unexpected');
    await expect(withDbRetry(() => Promise.reject(err))).rejects.toThrow('unexpected');
  });

  it('retries P1001 up to 3 times and succeeds on the 2nd attempt', async () => {
    const err = makePrismaKnownError('P1001');
    let calls = 0;
    const operation = vi.fn(async () => {
      calls++;
      if (calls < 2) throw err;
      return 'ok';
    });

    const result = await withDbRetry(operation, { timeout: 1 });
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retries P1001 and throws after all 3 retry attempts fail', async () => {
    const err = makePrismaKnownError('P1001');
    const operation = vi.fn().mockRejectedValue(err);

    await expect(withDbRetry(operation)).rejects.toThrow();
    // 1 initial + 3 retries = 4 total calls.
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('retries P1008 up to 2 times and throws when all fail', async () => {
    const err = makePrismaKnownError('P1008');
    const operation = vi.fn().mockRejectedValue(err);

    await expect(withDbRetry(operation)).rejects.toThrow();
    // 1 initial + 2 retries = 3 total calls.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('retries P1017 once after reconnect and succeeds', async () => {
    const { prisma } = await import('../../db.js');
    const err = makePrismaKnownError('P1017');
    let calls = 0;
    const operation = vi.fn(async () => {
      calls++;
      if (calls < 2) throw err;
      return 'reconnected';
    });

    const result = await withDbRetry(operation);
    expect(result).toBe('reconnected');
    expect(prisma.$disconnect).toHaveBeenCalled();
    expect(prisma.$connect).toHaveBeenCalled();
  });

  it('retries P1017 and throws after 1 retry fails', async () => {
    const err = makePrismaKnownError('P1017');
    const operation = vi.fn().mockRejectedValue(err);

    await expect(withDbRetry(operation)).rejects.toThrow();
    // 1 initial + 1 retry = 2 total calls.
    expect(operation).toHaveBeenCalledTimes(2);
  });
}, 30_000 /* allow time for retry delays in CI */);
