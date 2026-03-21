import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppealStatus, AppealType } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@disumprevies/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@disumprevies/core')>();
  return {
    ...actual,
    checkFeatureAccess: vi.fn().mockResolvedValue(true),
    prisma: {
      guild: {
        findUnique: vi.fn(),
      },
      appeal: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    tSync: vi.fn((key: string) => key),
    t: vi.fn((guildId: string, key: string) => Promise.resolve(key)),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

import { createAppeal, approveAppeal, rejectAppeal } from './appealManager.js';
import { checkFeatureAccess, prisma } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUILD_ID = '111111111111111111';
const USER_ID = '222222222222222222';
const REVIEWER_ID = '333333333333333333';

function makeGuild(settings: object = {}) {
  return { settings };
}

// ---------------------------------------------------------------------------
// createAppeal
// ---------------------------------------------------------------------------

describe('createAppeal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkFeatureAccess).mockResolvedValue(true);
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(makeGuild() as unknown as never);
    vi.mocked(prisma.appeal.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appeal.create).mockResolvedValue({ id: 1 } as unknown as never);
  });

  it('returns ok with appealId on success', async () => {
    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'I was wrongly banned',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.appealId).toBe(1);
  });

  it('returns no_access when feature gate fails', async () => {
    vi.mocked(checkFeatureAccess).mockResolvedValue(false);
    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('no_access');
  });

  it('returns guild_not_found when guild does not exist', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(null);
    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('guild_not_found');
  });

  it('returns reason_too_long when reason exceeds 1000 characters', async () => {
    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'a'.repeat(1001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('reason_too_long');
  });

  it('returns already_pending when a PENDING appeal exists', async () => {
    vi.mocked(prisma.appeal.findFirst)
      .mockResolvedValueOnce({ id: 99 } as unknown as never) // PENDING check hits first
      .mockResolvedValue(null);
    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('already_pending');
  });

  it('returns cooldown when a recent REJECTED appeal exists', async () => {
    // First findFirst (PENDING check) returns null
    // Second findFirst (cooldown check) returns a rejected appeal
    vi.mocked(prisma.appeal.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 50 } as unknown as never);

    vi.mocked(prisma.guild.findUnique).mockResolvedValue(
      makeGuild({ appeals: { cooldownHours: 72 } }) as unknown as never,
    );

    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('cooldown');
  });

  it('skips cooldown check when cooldownHours is 0', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(
      makeGuild({ appeals: { cooldownHours: 0 } }) as unknown as never,
    );
    vi.mocked(prisma.appeal.findFirst).mockResolvedValue(null); // No pending

    const result = await createAppeal({
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
      reason: 'valid reason',
    });
    // findFirst should only be called once (PENDING check only)
    expect(vi.mocked(prisma.appeal.findFirst)).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// approveAppeal
// ---------------------------------------------------------------------------

describe('approveAppeal', () => {
  const mockClient = {
    guilds: { fetch: vi.fn() },
    users: { fetch: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_found when appeal does not exist', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue(null);
    const result = await approveAppeal(1, REVIEWER_ID, mockClient as unknown as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('returns not_pending when appeal is already resolved', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 1,
      status: AppealStatus.APPROVED,
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
    } as unknown as never);
    const result = await approveAppeal(1, REVIEWER_ID, mockClient as unknown as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_pending');
  });

  it('approves a pending BAN appeal', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 1,
      status: AppealStatus.PENDING,
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
    } as unknown as never);
    vi.mocked(prisma.appeal.update).mockResolvedValue({} as unknown as never);

    const mockGuild = {
      bans: { remove: vi.fn().mockResolvedValue(undefined) },
      name: 'Test Guild',
      members: { fetch: vi.fn() },
    };
    mockClient.guilds.fetch.mockResolvedValue(mockGuild);
    mockClient.users.fetch.mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) });

    const result = await approveAppeal(1, REVIEWER_ID, mockClient as unknown as never);
    expect(result.ok).toBe(true);
    expect(vi.mocked(prisma.appeal.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AppealStatus.APPROVED }) }),
    );
    expect(mockGuild.bans.remove).toHaveBeenCalledWith(USER_ID, 'Appeal approved');
  });

  it('approves a pending MUTE appeal', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 2,
      status: AppealStatus.PENDING,
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.MUTE,
    } as unknown as never);
    vi.mocked(prisma.appeal.update).mockResolvedValue({} as unknown as never);

    const mockMember = { disableCommunicationUntil: vi.fn().mockResolvedValue(undefined) };
    const mockGuild = {
      name: 'Test Guild',
      members: { fetch: vi.fn().mockResolvedValue(mockMember) },
      bans: { remove: vi.fn() },
    };
    mockClient.guilds.fetch.mockResolvedValue(mockGuild);
    mockClient.users.fetch.mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) });

    const result = await approveAppeal(2, REVIEWER_ID, mockClient as unknown as never);
    expect(result.ok).toBe(true);
    expect(mockMember.disableCommunicationUntil).toHaveBeenCalledWith(null, 'Appeal approved');
  });
});

// ---------------------------------------------------------------------------
// rejectAppeal
// ---------------------------------------------------------------------------

describe('rejectAppeal', () => {
  const mockClient = {
    guilds: { fetch: vi.fn() },
    users: { fetch: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_found when appeal does not exist', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue(null);
    const result = await rejectAppeal(1, REVIEWER_ID, 'Not valid', mockClient as unknown as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
  });

  it('returns not_pending when appeal is already resolved', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 1,
      status: AppealStatus.REJECTED,
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
    } as unknown as never);
    const result = await rejectAppeal(1, REVIEWER_ID, 'Reason', mockClient as unknown as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_pending');
  });

  it('rejects a pending appeal and saves review note', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 1,
      status: AppealStatus.PENDING,
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
    } as unknown as never);
    vi.mocked(prisma.appeal.update).mockResolvedValue({} as unknown as never);
    mockClient.guilds.fetch.mockResolvedValue({ name: 'Test Guild' });
    mockClient.users.fetch.mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) });

    const result = await rejectAppeal(1, REVIEWER_ID, 'No valid reason', mockClient as unknown as never);
    expect(result.ok).toBe(true);
    expect(vi.mocked(prisma.appeal.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AppealStatus.REJECTED,
          reviewNote: 'No valid reason',
        }),
      }),
    );
  });

  it('handles DM failure gracefully', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 1,
      status: AppealStatus.PENDING,
      guildId: GUILD_ID,
      userId: USER_ID,
      type: AppealType.BAN,
    } as unknown as never);
    vi.mocked(prisma.appeal.update).mockResolvedValue({} as unknown as never);
    mockClient.guilds.fetch.mockResolvedValue({ name: 'Test Guild' });
    mockClient.users.fetch.mockResolvedValue({
      send: vi.fn().mockRejectedValue(new Error('DM disabled')),
    });

    // Should not throw
    const result = await rejectAppeal(1, REVIEWER_ID, 'reason', mockClient as unknown as never);
    expect(result.ok).toBe(true);
  });
});
