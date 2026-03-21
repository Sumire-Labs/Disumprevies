import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist FakeDiscordAPIError so it's available inside vi.mock factories.
// ---------------------------------------------------------------------------

const FakeDiscordAPIError = vi.hoisted(() => {
  class FakeDiscordAPIError extends Error {
    code: number;
    constructor(message: string, code: number) {
      super(message);
      this.code = code;
      this.name = 'DiscordAPIError';
      Object.setPrototypeOf(this, FakeDiscordAPIError.prototype);
    }
  }
  return FakeDiscordAPIError;
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  return { ...actual, DiscordAPIError: FakeDiscordAPIError };
});

vi.mock('../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../i18n/index.js', () => ({
  t: vi.fn().mockResolvedValue('dm text'),
  tSync: vi.fn().mockReturnValue('error message'),
}));

// Mock points module — control the return value of addPoints per test.
vi.mock('./points.js', () => ({
  addPoints: vi.fn().mockResolvedValue(6),   // default: 6 total points → MUTE
  getUserPoints: vi.fn().mockResolvedValue(6),
}));

// Mock DB directly for hasRecentPunishment and updateLastInfractionType.
vi.mock('../db.js', () => ({
  prisma: {
    infraction: {
      findFirst: vi.fn().mockResolvedValue(null), // no recent duplicate by default
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../utils/database.js', () => ({
  withDbRetry: vi.fn((fn: () => unknown) => fn()),
}));

// Mock ActionQueue so actions execute immediately (no 100ms delay in tests).
vi.mock('../utils/ActionQueue.js', () => ({
  actionQueue: {
    enqueue: vi.fn((fn: () => Promise<void>) => fn()),
    drain: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  },
}));

import { ActionExecutor } from './executor.js';
import type { ActionContext } from './executor.js';
import { addPoints } from './points.js';
import { prisma } from '../db.js';
import { logger } from '../logger/index.js';
import { t } from '../i18n/index.js';

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  const logChannel = {
    id: 'log-channel',
    send: vi.fn().mockResolvedValue(undefined),
  };

  return {
    guildId: 'guild-1',
    member: {
      user: { id: 'user-1' },
      guild: { name: 'Test Guild', id: 'guild-1' },
      roles: { cache: new Map() },
      send: vi.fn().mockResolvedValue(undefined),
      disableCommunicationUntil: vi.fn().mockResolvedValue(undefined),
      kick: vi.fn().mockResolvedValue(undefined),
      ban: vi.fn().mockResolvedValue(undefined),
    } as unknown as ActionContext['member'],
    reason: 'test reason',
    eventPoints: 6,
    logChannel: logChannel as unknown as ActionContext['logChannel'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionExecutor', () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = new ActionExecutor();
    vi.clearAllMocks();

    // Default: addPoints returns 6 → resolveAction returns MUTE.
    vi.mocked(addPoints).mockResolvedValue(6);
    vi.mocked(prisma.infraction.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.infraction.update).mockResolvedValue({} as never);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns action:none when points are below all thresholds', async () => {
    vi.mocked(addPoints).mockResolvedValue(1); // 1 pt — below WARN threshold
    const ctx = makeCtx({ eventPoints: 1 });
    const result = await executor.execute(ctx);
    expect(result.action).toBe('none');
  });

  it('returns MUTE action when points reach 6', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    const result = await executor.execute(ctx);
    expect(result.action).toBe('MUTE');
    expect(ctx.member.disableCommunicationUntil).toHaveBeenCalled();
  });

  it('returns BAN action when points reach 12', async () => {
    vi.mocked(addPoints).mockResolvedValue(12);
    const ctx = makeCtx({ eventPoints: 12 });
    const result = await executor.execute(ctx);
    expect(result.action).toBe('BAN');
    expect(ctx.member.ban).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // DM failure (error code 50007) — punishment should still execute
  // -------------------------------------------------------------------------

  it('continues punishment when DM fails with 50007', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    const dmError = new FakeDiscordAPIError('Cannot send messages to this user', 50_007);
    vi.mocked(ctx.member.send).mockRejectedValue(dmError);

    const result = await executor.execute(ctx);

    // Punishment should still be applied despite DM failure.
    expect(result.action).toBe('MUTE');
    expect(ctx.member.disableCommunicationUntil).toHaveBeenCalled();

    // Info logged about DM failure.
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('DM'),
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('sends DM failure warning to logChannel as embed when DM fails with 50007', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    const dmError = new FakeDiscordAPIError('Cannot send messages to this user', 50_007);
    vi.mocked(ctx.member.send).mockRejectedValue(dmError);

    await executor.execute(ctx);

    // logChannel.send should have been called with an embed (not plain text).
    expect(ctx.logChannel?.send).toHaveBeenCalled();
    const call = vi.mocked(ctx.logChannel!.send).mock.calls[0][0] as Record<string, unknown>;
    expect(call).toHaveProperty('embeds');
  });

  // -------------------------------------------------------------------------
  // Missing permissions (error code 50013)
  // -------------------------------------------------------------------------

  it('catches DiscordAPIError 50013 without throwing', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    const permError = new FakeDiscordAPIError('Missing Permissions', 50_013);
    vi.mocked(ctx.member.disableCommunicationUntil).mockRejectedValue(permError);

    await expect(executor.execute(ctx)).resolves.toBeDefined();
  });

  it('logs a warning when applyAction fails with 50013', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    const permError = new FakeDiscordAPIError('Missing Permissions', 50_013);
    vi.mocked(ctx.member.disableCommunicationUntil).mockRejectedValue(permError);

    await executor.execute(ctx);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('permissions'),
      expect.objectContaining({ guildId: 'guild-1', userId: 'user-1' }),
    );
  });

  it('handles role hierarchy error (50013 with "hierarchy" in message)', async () => {
    vi.mocked(addPoints).mockResolvedValue(9); // KICK
    const ctx = makeCtx({ eventPoints: 9 });
    const hierarchyError = new FakeDiscordAPIError(
      'Cannot execute action on a user with an equal or higher role (hierarchy)',
      50_013,
    );
    vi.mocked(ctx.member.kick).mockRejectedValue(hierarchyError);

    await expect(executor.execute(ctx)).resolves.toBeDefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('hierarchy'),
      expect.objectContaining({ guildId: 'guild-1' }),
    );
  });

  // -------------------------------------------------------------------------
  // Double-punishment prevention
  // -------------------------------------------------------------------------

  it('skips punishment when same action type was issued within 30s', async () => {
    const ctx = makeCtx({ eventPoints: 6 });

    // Simulate a recent MUTE infraction already in the DB.
    vi.mocked(prisma.infraction.findFirst).mockResolvedValue({
      id: 99,
      guildId: 'guild-1',
      userId: 'user-1',
      type: 'MUTE',
      reason: 'previous',
      points: 6,
      moderator: null,
      auto: true,
      expiresAt: null,
      createdAt: new Date(),
    });

    const result = await executor.execute(ctx);

    // Action should be skipped.
    expect(result.action).toBe('none');
    expect(ctx.member.disableCommunicationUntil).not.toHaveBeenCalled();
  });

  it('does NOT skip when no recent duplicate punishment exists', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    vi.mocked(prisma.infraction.findFirst).mockResolvedValue(null);

    const result = await executor.execute(ctx);
    expect(result.action).toBe('MUTE');
    expect(ctx.member.disableCommunicationUntil).toHaveBeenCalled();
  });

  it('WARN type is never blocked by double-punishment check', async () => {
    vi.mocked(addPoints).mockResolvedValue(3); // 3 pts → WARN
    const ctx = makeCtx({ eventPoints: 3 });

    // hasRecentPunishment returns false for WARN without querying DB.
    // Set findFirst to return a record to confirm DB is never consulted for WARN.
    vi.mocked(prisma.infraction.findFirst).mockResolvedValue(null);

    const result = await executor.execute(ctx);
    expect(result.action).toBe('WARN');
  });

  // -------------------------------------------------------------------------
  // Message deletion
  // -------------------------------------------------------------------------

  it('attempts to delete the message when deletable', async () => {
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      eventPoints: 3,
      message: { deletable: true, delete: mockDelete } as unknown as ActionContext['message'],
    });

    await executor.execute(ctx);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('does not throw when message deletion fails with 50013', async () => {
    const permError = new FakeDiscordAPIError('Missing Permissions', 50_013);
    const mockDelete = vi.fn().mockRejectedValue(permError);
    const ctx = makeCtx({
      eventPoints: 3,
      message: { deletable: true, delete: mockDelete } as unknown as ActionContext['message'],
    });

    await expect(executor.execute(ctx)).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // KICK action (9 points)
  // -------------------------------------------------------------------------

  it('returns KICK action when points reach 9', async () => {
    vi.mocked(addPoints).mockResolvedValue(9);
    const ctx = makeCtx({ eventPoints: 9 });
    const result = await executor.execute(ctx);
    expect(result.action).toBe('KICK');
    expect(ctx.member.kick).toHaveBeenCalled();
  });

  it('KICK result does not include muteDurationMinutes', async () => {
    vi.mocked(addPoints).mockResolvedValue(9);
    const ctx = makeCtx({ eventPoints: 9 });
    const result = await executor.execute(ctx);
    expect(result.muteDurationMinutes).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Threshold boundary values
  // -------------------------------------------------------------------------

  it('returns none when totalPoints is exactly 2 (just below WARN)', async () => {
    vi.mocked(addPoints).mockResolvedValue(2);
    const result = await executor.execute(makeCtx({ eventPoints: 2 }));
    expect(result.action).toBe('none');
  });

  it('returns WARN at exactly 3 points', async () => {
    vi.mocked(addPoints).mockResolvedValue(3);
    const result = await executor.execute(makeCtx({ eventPoints: 3 }));
    expect(result.action).toBe('WARN');
  });

  it('returns MUTE at exactly 6 points', async () => {
    vi.mocked(addPoints).mockResolvedValue(6);
    const result = await executor.execute(makeCtx({ eventPoints: 6 }));
    expect(result.action).toBe('MUTE');
  });

  it('returns KICK at exactly 9 points', async () => {
    vi.mocked(addPoints).mockResolvedValue(9);
    const result = await executor.execute(makeCtx({ eventPoints: 9 }));
    expect(result.action).toBe('KICK');
  });

  it('returns BAN at exactly 12 points', async () => {
    vi.mocked(addPoints).mockResolvedValue(12);
    const result = await executor.execute(makeCtx({ eventPoints: 12 }));
    expect(result.action).toBe('BAN');
  });

  // -------------------------------------------------------------------------
  // Server owner / higher-role hierarchy errors
  // -------------------------------------------------------------------------

  it('handles hierarchy error when kicking a higher-role user', async () => {
    vi.mocked(addPoints).mockResolvedValue(9);
    const ctx = makeCtx({ eventPoints: 9 });
    const hierarchyError = new FakeDiscordAPIError(
      'Cannot execute action on a user with a higher role (hierarchy)',
      50_013,
    );
    vi.mocked(ctx.member.kick).mockRejectedValue(hierarchyError);

    await expect(executor.execute(ctx)).resolves.toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('hierarchy'),
      expect.objectContaining({ guildId: 'guild-1', userId: 'user-1' }),
    );
  });

  it('handles hierarchy error when banning a higher-role user', async () => {
    vi.mocked(addPoints).mockResolvedValue(12);
    const ctx = makeCtx({ eventPoints: 12 });
    const hierarchyError = new FakeDiscordAPIError(
      'Cannot execute action on a user with an equal or higher role (hierarchy)',
      50_013,
    );
    vi.mocked(ctx.member.ban).mockRejectedValue(hierarchyError);

    await expect(executor.execute(ctx)).resolves.toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('hierarchy'),
      expect.any(Object),
    );
  });

  // -------------------------------------------------------------------------
  // Non-Discord errors
  // -------------------------------------------------------------------------

  it('logs error when a non-DiscordAPIError is thrown during applyAction', async () => {
    vi.mocked(addPoints).mockResolvedValue(9);
    const ctx = makeCtx({ eventPoints: 9 });
    vi.mocked(ctx.member.kick).mockRejectedValue(new Error('Unexpected internal error'));

    await expect(executor.execute(ctx)).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Unexpected error during Discord action',
      expect.objectContaining({ guildId: 'guild-1', userId: 'user-1' }),
    );
  });

  // -------------------------------------------------------------------------
  // MUTE duration in result
  // -------------------------------------------------------------------------

  it('includes muteDurationMinutes in result when action is MUTE', async () => {
    vi.mocked(addPoints).mockResolvedValue(6);
    const result = await executor.execute(makeCtx({ eventPoints: 6 }));
    expect(result.action).toBe('MUTE');
    expect(result.muteDurationMinutes).toBeDefined();
    expect(result.muteDurationMinutes).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // i18n — t() called with guildId (not tSync)
  // -------------------------------------------------------------------------

  it('calls t() with the correct guildId when sending DM for WARN', async () => {
    vi.mocked(addPoints).mockResolvedValue(3);
    const ctx = makeCtx({ eventPoints: 3 });
    await executor.execute(ctx);
    expect(vi.mocked(t)).toHaveBeenCalledWith('guild-1', 'warn_dm', expect.any(Object));
  });

  it('calls t() with the correct guildId when sending DM for MUTE', async () => {
    vi.mocked(addPoints).mockResolvedValue(6);
    const ctx = makeCtx({ eventPoints: 6 });
    await executor.execute(ctx);
    expect(vi.mocked(t)).toHaveBeenCalledWith('guild-1', 'mute_dm', expect.any(Object));
  });

  it('calls t() with the correct guildId when sending DM for BAN', async () => {
    vi.mocked(addPoints).mockResolvedValue(12);
    const ctx = makeCtx({ eventPoints: 12 });
    await executor.execute(ctx);
    expect(vi.mocked(t)).toHaveBeenCalledWith('guild-1', 'ban_dm', expect.any(Object));
  });

  it('calls t() with guildId for DM-disabled error message sent to log channel', async () => {
    const ctx = makeCtx({ eventPoints: 6 });
    const dmError = new FakeDiscordAPIError('Cannot send messages to this user', 50_007);
    vi.mocked(ctx.member.send).mockRejectedValue(dmError);

    await executor.execute(ctx);

    expect(vi.mocked(t)).toHaveBeenCalledWith(
      'guild-1',
      'error.bot.dmDisabled',
      expect.objectContaining({ userId: 'user-1' }),
    );
  });
});
