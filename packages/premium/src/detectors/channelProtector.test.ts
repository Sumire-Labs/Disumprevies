import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import { ChannelProtector, clearChannelProtectorStateForGuild } from './channelProtector.js';
import { checkFeatureAccess, prisma } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@disumprevies/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@disumprevies/core')>();
  return {
    ...actual,
    checkFeatureAccess: vi.fn().mockResolvedValue(true),
    prisma: {
      guild: { findUnique: vi.fn().mockResolvedValue(null) },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUILD_ID = 'guild-cp-test';

function makeGuildObj(guildId = GUILD_ID) {
  return {
    id: guildId,
    fetchAuditLogs: vi.fn().mockResolvedValue({ entries: { first: () => undefined } }),
    members: { fetch: vi.fn().mockResolvedValue(null) },
  };
}

function makeClient(guildId = GUILD_ID): { client: Client; guild: ReturnType<typeof makeGuildObj> } {
  const guild = makeGuildObj(guildId);
  const client = {
    user: { id: 'bot-user-id' },
    guilds: { cache: new Map([[guildId, guild]]) },
    channels: { cache: new Map() },
  } as unknown as Client;
  return { client, guild };
}

/** Return the mock findUnique function. */
const mockFindUnique = () => vi.mocked(prisma.guild.findUnique);

/** Configure findUnique to return specific channelProtection settings. */
function mockSettings(opts: { enabled?: boolean; threshold?: number; windowSeconds?: number } = {}) {
  mockFindUnique().mockResolvedValue({
    settings: {
      channelProtection: {
        enabled: opts.enabled ?? true,
        threshold: opts.threshold ?? 5,
        windowSeconds: opts.windowSeconds ?? 10,
      },
    },
    logChannel: null,
    modChannel: null,
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChannelProtector', () => {
  let detector: ChannelProtector;

  beforeEach(() => {
    detector = new ChannelProtector();
    clearChannelProtectorStateForGuild(GUILD_ID);
    vi.clearAllMocks();
    vi.mocked(checkFeatureAccess).mockResolvedValue(true);
    mockFindUnique().mockResolvedValue(null);
  });

  // ── Feature gate ──────────────────────────────────────────────────────────

  it('returns early when feature access is denied', async () => {
    vi.mocked(checkFeatureAccess).mockResolvedValueOnce(false);
    const { client, guild } = makeClient();
    await detector.handle(GUILD_ID, 'channelCreate', client);
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
    expect(mockFindUnique()).not.toHaveBeenCalled();
  });

  it('returns early when guild is not in client cache', async () => {
    const emptyClient = {
      user: { id: 'bot-user-id' },
      guilds: { cache: new Map() },
      channels: { cache: new Map() },
    } as unknown as Client;
    await detector.handle(GUILD_ID, 'channelCreate', emptyClient);
    expect(mockFindUnique()).not.toHaveBeenCalled();
  });

  // ── enabled flag ──────────────────────────────────────────────────────────

  it('returns early when channelProtection is disabled in settings', async () => {
    mockSettings({ enabled: false });
    const { client, guild } = makeClient();
    for (let i = 0; i < 10; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });

  // ── Threshold logic ───────────────────────────────────────────────────────

  it('does not trigger below default threshold (4 out of 5 events)', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });

  it('triggers on reaching the default threshold (5 events)', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledOnce();
  });

  it('triggers with custom threshold=3', async () => {
    mockSettings({ threshold: 3 });
    const { client, guild } = makeClient();
    for (let i = 0; i < 3; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledOnce();
  });

  it('does not trigger below custom threshold', async () => {
    mockSettings({ threshold: 3 });
    const { client, guild } = makeClient();
    for (let i = 0; i < 2; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });

  it('resets state after triggering so it does not fire again immediately', async () => {
    const { client, guild } = makeClient();
    // Trigger once
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledTimes(1);

    // 4 more events — should not trigger again (state was cleared)
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledTimes(1);
  });

  // ── Event types ───────────────────────────────────────────────────────────

  it('tracks channelDelete events independently', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'channelDelete', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledOnce();
  });

  it('tracks roleCreate events independently', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'roleCreate', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledOnce();
  });

  it('tracks roleDelete events independently', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'roleDelete', client);
    }
    expect(guild.fetchAuditLogs).toHaveBeenCalledOnce();
  });

  it('different event types do not cross-contaminate counts', async () => {
    const { client, guild } = makeClient();
    // 4 channelCreate + 4 channelDelete — neither should trigger individually
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
      await detector.handle(GUILD_ID, 'channelDelete', client);
    }
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });

  // ── State isolation ───────────────────────────────────────────────────────

  it('does not cross-contaminate between guilds', async () => {
    const { client: client1, guild: guild1 } = makeClient('guild-a');
    const { client: client2, guild: guild2 } = makeClient('guild-b');

    clearChannelProtectorStateForGuild('guild-a');
    clearChannelProtectorStateForGuild('guild-b');

    for (let i = 0; i < 4; i++) {
      await detector.handle('guild-a', 'channelCreate', client1);
    }
    // guild-b starts at 0 — one event should not trigger
    await detector.handle('guild-b', 'channelCreate', client2);

    expect(guild1.fetchAuditLogs).not.toHaveBeenCalled();
    expect(guild2.fetchAuditLogs).not.toHaveBeenCalled();

    clearChannelProtectorStateForGuild('guild-a');
    clearChannelProtectorStateForGuild('guild-b');
  });

  it('clearChannelProtectorStateForGuild resets count', async () => {
    const { client, guild } = makeClient();
    // Accumulate 4 events
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    // Clear state
    clearChannelProtectorStateForGuild(GUILD_ID);
    vi.clearAllMocks();

    // Next 4 events should still not trigger (count restarted from 0)
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });

  // ── Executor handling ─────────────────────────────────────────────────────

  it('handles null executor from audit log (no crash)', async () => {
    const { client } = makeClient();
    // fetchAuditLogs returns no entries → executor = null
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'channelCreate', client);
    }
    // Should complete without throwing
  });
});
