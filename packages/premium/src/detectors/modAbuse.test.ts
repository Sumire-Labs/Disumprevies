import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';
import { ModAbuseDetector, clearModAbuseStateForGuild } from './modAbuse.js';
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

const GUILD_ID = 'guild-ma-test';
const BOT_ID   = 'bot-user-id';
const MOD_ID   = 'mod-user-1';

/** Return the mock findUnique function. */
const mockFindUnique = () => vi.mocked(prisma.guild.findUnique);

/** Configure findUnique to return specific modAbuse settings. */
function mockSettings(opts: { enabled?: boolean; threshold?: number; windowSeconds?: number } = {}) {
  mockFindUnique().mockResolvedValue({
    settings: {
      modAbuse: {
        enabled: opts.enabled ?? true,
        threshold: opts.threshold ?? 5,
        windowSeconds: opts.windowSeconds ?? 60,
      },
    },
    logChannel: null,
    modChannel: null,
  } as never);
}

/**
 * Build a mock guild object. `executorId` and `executorBot` control what the
 * audit log returns as the executor of the last action.
 */
function makeGuildObj(opts: {
  guildId?: string;
  executorId?: string | null;
  executorBot?: boolean;
} = {}) {
  const { guildId = GUILD_ID, executorId = MOD_ID, executorBot = false } = opts;
  const entry = executorId !== null
    ? { executor: { id: executorId, bot: executorBot } }
    : undefined;

  return {
    id: guildId,
    name: 'Test Guild',
    fetchAuditLogs: vi.fn().mockResolvedValue({ entries: { first: () => entry } }),
    members: { fetch: vi.fn().mockResolvedValue(null) },
    fetchOwner: vi.fn().mockResolvedValue({ user: { send: vi.fn().mockResolvedValue(undefined) } }),
  };
}

function makeClient(opts: {
  guildId?: string;
  executorId?: string | null;
  executorBot?: boolean;
} = {}): { client: Client; guild: ReturnType<typeof makeGuildObj> } {
  const guildId = opts.guildId ?? GUILD_ID;
  const guild = makeGuildObj({ guildId, executorId: opts.executorId, executorBot: opts.executorBot });
  const client = {
    user: { id: BOT_ID },
    guilds: { cache: new Map([[guildId, guild]]) },
    channels: { cache: new Map() },
  } as unknown as Client;
  return { client, guild };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModAbuseDetector', () => {
  let detector: ModAbuseDetector;

  beforeEach(() => {
    detector = new ModAbuseDetector();
    clearModAbuseStateForGuild(GUILD_ID);
    vi.clearAllMocks();
    vi.mocked(checkFeatureAccess).mockResolvedValue(true);
    mockFindUnique().mockResolvedValue(null);
  });

  // ── Feature gate ──────────────────────────────────────────────────────────

  it('returns early when feature access is denied', async () => {
    vi.mocked(checkFeatureAccess).mockResolvedValueOnce(false);
    const { client, guild } = makeClient();
    await detector.handle(GUILD_ID, 'ban', client);
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
    expect(mockFindUnique()).not.toHaveBeenCalled();
  });

  it('returns early when guild is not in client cache', async () => {
    const emptyClient = {
      user: { id: BOT_ID },
      guilds: { cache: new Map() },
      channels: { cache: new Map() },
    } as unknown as Client;
    await detector.handle(GUILD_ID, 'ban', emptyClient);
    expect(mockFindUnique()).not.toHaveBeenCalled();
  });

  // ── enabled flag ──────────────────────────────────────────────────────────

  it('returns early when modAbuse is disabled in settings', async () => {
    mockSettings({ enabled: false });
    const { client, guild } = makeClient();
    for (let i = 0; i < 10; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    // fetchAuditLogs is called after settings check — but since modAbuse
    // is disabled we return before fetching the executor
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  // ── Executor handling ─────────────────────────────────────────────────────

  it('returns early when audit log returns no executor', async () => {
    const { client, guild } = makeClient({ executorId: null });
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  it('skips bans performed by the bot itself', async () => {
    const { client, guild } = makeClient({ executorId: BOT_ID });
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  it('skips bans performed by any bot account', async () => {
    const { client, guild } = makeClient({ executorId: 'other-bot-id', executorBot: true });
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  // ── Threshold logic — ban ─────────────────────────────────────────────────

  it('does not trigger below default ban threshold (4 out of 5)', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  it('triggers on reaching the default ban threshold (5 bans by same mod)', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).toHaveBeenCalledOnce();
  });

  it('triggers with custom threshold=3 for bans', async () => {
    mockSettings({ threshold: 3 });
    const { client, guild } = makeClient();
    for (let i = 0; i < 3; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).toHaveBeenCalledOnce();
  });

  // ── Threshold logic — kick ────────────────────────────────────────────────

  it('does not trigger below default kick threshold (4 out of 5)', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'kick', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  it('triggers on reaching the default kick threshold (5 kicks by same mod)', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'kick', client);
    }
    expect(guild.fetchOwner).toHaveBeenCalledOnce();
  });

  // ── Event type isolation ──────────────────────────────────────────────────

  it('ban and kick counts are tracked independently per moderator', async () => {
    const { client, guild } = makeClient();
    // 4 bans + 4 kicks — neither should cross the 5-event threshold
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
      await detector.handle(GUILD_ID, 'kick', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  // ── Per-moderator isolation ───────────────────────────────────────────────

  it('does not trigger when actions are split across two different moderators', async () => {
    // mod-1 performs 3 bans, mod-2 performs 3 bans — each below threshold
    const { client: client1, guild: guild1 } = makeClient({ executorId: 'mod-1' });
    const { client: client2, guild: guild2 } = makeClient({ executorId: 'mod-2' });

    for (let i = 0; i < 3; i++) {
      await detector.handle(GUILD_ID, 'ban', client1);
      await detector.handle(GUILD_ID, 'ban', client2);
    }
    expect(guild1.fetchOwner).not.toHaveBeenCalled();
    expect(guild2.fetchOwner).not.toHaveBeenCalled();
  });

  // ── State reset ───────────────────────────────────────────────────────────

  it('resets mod state after triggering so it does not fire again immediately', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).toHaveBeenCalledTimes(1);

    // 4 more events — should not trigger again (state was cleared)
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).toHaveBeenCalledTimes(1);
  });

  it('clearModAbuseStateForGuild resets count for that guild', async () => {
    const { client, guild } = makeClient();
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    clearModAbuseStateForGuild(GUILD_ID);
    vi.clearAllMocks();

    // After clearing, next 4 events should not trigger
    for (let i = 0; i < 4; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    expect(guild.fetchOwner).not.toHaveBeenCalled();
  });

  // ── Guild isolation ───────────────────────────────────────────────────────

  it('does not cross-contaminate between guilds', async () => {
    const { client: clientA, guild: guildA } = makeClient({ guildId: 'guild-alpha' });
    const { client: clientB, guild: guildB } = makeClient({ guildId: 'guild-beta' });

    clearModAbuseStateForGuild('guild-alpha');
    clearModAbuseStateForGuild('guild-beta');

    for (let i = 0; i < 4; i++) {
      await detector.handle('guild-alpha', 'ban', clientA);
    }
    await detector.handle('guild-beta', 'ban', clientB);

    expect(guildA.fetchOwner).not.toHaveBeenCalled();
    expect(guildB.fetchOwner).not.toHaveBeenCalled();

    clearModAbuseStateForGuild('guild-alpha');
    clearModAbuseStateForGuild('guild-beta');
  });

  // ── Owner DM failure tolerance ────────────────────────────────────────────

  it('does not throw when fetchOwner fails', async () => {
    const { client, guild } = makeClient();
    guild.fetchOwner.mockRejectedValue(new Error('Cannot fetch owner'));
    for (let i = 0; i < 5; i++) {
      await detector.handle(GUILD_ID, 'ban', client);
    }
    // Should complete without throwing despite owner DM failure
  });
});
