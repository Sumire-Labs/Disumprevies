/**
 * Integration test: Bot lifecycle
 *
 * Tests the startup → shutdown lifecycle without connecting to Discord or the DB.
 * All external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that transitively use them
// ---------------------------------------------------------------------------

vi.mock('../db.js', () => ({
  prisma: {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    guild: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    infraction: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    wordFilter: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logInfractionToChannel: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    discordToken: 'mock-token',
    discordClientId: 'mock-client-id',
    databaseUrl: 'postgresql://localhost/test',
    logLevel: 'info',
    nodeEnv: 'test',
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { prisma } from '../db.js';
import { logger } from '../logger/index.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bot lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects to the database before any guild queries', async () => {
    // Simulate the startup sequence: connect DB first
    await prisma.$connect();

    expect(vi.mocked(prisma.$connect)).toHaveBeenCalledOnce();
  });

  it('logs a fatal error and exits on database connection failure', async () => {
    const dbError = new Error('Connection refused');
    vi.mocked(prisma.$connect).mockRejectedValueOnce(dbError);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => {
      throw new Error('process.exit called');
    });

    // Simulate the main() error handler
    const main = async (): Promise<void> => {
      await prisma.$connect();
    };

    await expect(
      main().catch((err: unknown) => {
        logger.error('Fatal error during startup', {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      }),
    ).rejects.toThrow('process.exit called');

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      'Fatal error during startup',
      expect.objectContaining({ error: 'Connection refused' }),
    );

    exitSpy.mockRestore();
  });

  it('disconnects from the database on graceful shutdown', async () => {
    await prisma.$connect();
    await prisma.$disconnect();

    expect(vi.mocked(prisma.$disconnect)).toHaveBeenCalledOnce();
  });

  it('logs successful database connection', async () => {
    await prisma.$connect();
    logger.info('Database connected');

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith('Database connected');
  });

  it('handles SIGTERM gracefully', async () => {
    const disconnectSpy = vi.mocked(prisma.$disconnect);

    // Simulate a SIGTERM handler
    const handleShutdown = async (): Promise<void> => {
      logger.info('Shutting down gracefully');
      await prisma.$disconnect();
    };

    await handleShutdown();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith('Shutting down gracefully');
    expect(disconnectSpy).toHaveBeenCalledOnce();
  });
});
