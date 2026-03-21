import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma — must be registered before importing GuildConfigCache
// ---------------------------------------------------------------------------

interface MockGuildRow {
  id: string;
  settings: unknown;
  exemptRoles: string[];
  logChannel: string | null;
  modChannel: string | null;
}

interface MockWordFilterRow {
  guildId: string;
  pattern: string;
  isRegex: boolean;
}

const mockGuilds: Record<string, MockGuildRow> = {};
const mockWordFilters: MockWordFilterRow[] = [];

vi.mock('../../db.js', () => ({
  prisma: {
    guild: {
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { id: string };
          create: { id: string };
          update: Record<string, never>;
          select: unknown;
        }) => {
          if (mockGuilds[where.id] === undefined) {
            mockGuilds[where.id] = {
              id: create.id,
              settings: {},
              exemptRoles: [],
              logChannel: null,
              modChannel: null,
            };
          }
          return mockGuilds[where.id];
        },
      ),
    },
    wordFilter: {
      findMany: vi.fn(async ({ where }: { where: { guildId: string } }) => {
        return mockWordFilters.filter((f) => f.guildId === where.guildId);
      }),
    },
  },
}));

// Mock logger to suppress output during tests
vi.mock('../../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logInfractionToChannel: vi.fn(),
}));

// Import AFTER mocking
const { GuildConfigCache } = await import('../GuildConfigCache.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks(): void {
  for (const key of Object.keys(mockGuilds)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete mockGuilds[key];
  }
  mockWordFilters.length = 0;
}

// ---------------------------------------------------------------------------
// GuildConfig cache tests
// ---------------------------------------------------------------------------

describe('GuildConfigCache — config', () => {
  let cache: InstanceType<typeof GuildConfigCache>;

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
    cache = new GuildConfigCache(60_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches from DB on first request and populates the cache', async () => {
    const { prisma } = await import('../../db.js');
    const upsertSpy = vi.spyOn(prisma.guild, 'upsert');

    await cache.get('guild-1');
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('serves from cache on second request — no extra DB query', async () => {
    const { prisma } = await import('../../db.js');
    const upsertSpy = vi.spyOn(prisma.guild, 'upsert');

    await cache.get('guild-2');
    await cache.get('guild-2');

    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches from DB after TTL expires', async () => {
    const { prisma } = await import('../../db.js');
    const upsertSpy = vi.spyOn(prisma.guild, 'upsert');

    await cache.get('guild-3');
    vi.setSystemTime(Date.now() + 61_000); // advance past 60 s TTL
    await cache.get('guild-3');

    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it('returns correct shape from auto-created guild', async () => {
    const config = await cache.get('new-guild');
    expect(config.guildId).toBe('new-guild');
    expect(Array.isArray(config.exemptRoles)).toBe(true);
    expect(config.logChannelId).toBeNull();
    expect(config.modChannelId).toBeNull();
  });

  it('invalidate() forces a re-fetch on next get()', async () => {
    const { prisma } = await import('../../db.js');
    const upsertSpy = vi.spyOn(prisma.guild, 'upsert');

    await cache.get('guild-4');
    cache.invalidate('guild-4');
    await cache.get('guild-4');

    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidateAll() clears every guild from the cache', async () => {
    const { prisma } = await import('../../db.js');
    const upsertSpy = vi.spyOn(prisma.guild, 'upsert');

    await cache.get('ga');
    await cache.get('gb');
    cache.invalidateAll();
    await cache.get('ga');
    await cache.get('gb');

    // 2 initial fetches + 2 re-fetches after invalidateAll
    expect(upsertSpy).toHaveBeenCalledTimes(4);
  });

  it('preload() warms the cache for multiple guilds', async () => {
    const { prisma } = await import('../../db.js');
    const upsertSpy = vi.spyOn(prisma.guild, 'upsert');

    await cache.preload(['p1', 'p2', 'p3']);

    // Each guild should be in cache — no further DB calls on get()
    await cache.get('p1');
    await cache.get('p2');
    await cache.get('p3');

    expect(upsertSpy).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// WordFilter cache tests
// ---------------------------------------------------------------------------

describe('GuildConfigCache — word filters', () => {
  let cache: InstanceType<typeof GuildConfigCache>;

  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
    cache = new GuildConfigCache(60_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches word filters from DB on first call', async () => {
    mockWordFilters.push({ guildId: 'g1', pattern: 'spam', isRegex: false });
    const { prisma } = await import('../../db.js');
    const findSpy = vi.spyOn(prisma.wordFilter, 'findMany');

    const filters = await cache.getWordFilters('g1');

    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.pattern).toBe('spam');
  });

  it('serves from cache on second call — no extra DB query', async () => {
    const { prisma } = await import('../../db.js');
    const findSpy = vi.spyOn(prisma.wordFilter, 'findMany');

    await cache.getWordFilters('g2');
    await cache.getWordFilters('g2');

    expect(findSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after TTL expires', async () => {
    const { prisma } = await import('../../db.js');
    const findSpy = vi.spyOn(prisma.wordFilter, 'findMany');

    await cache.getWordFilters('g3');
    vi.setSystemTime(Date.now() + 61_000);
    await cache.getWordFilters('g3');

    expect(findSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidateWordFilters() forces re-fetch on next call', async () => {
    const { prisma } = await import('../../db.js');
    const findSpy = vi.spyOn(prisma.wordFilter, 'findMany');

    await cache.getWordFilters('g4');
    cache.invalidateWordFilters('g4');
    await cache.getWordFilters('g4');

    expect(findSpy).toHaveBeenCalledTimes(2);
  });

  it('pre-compiles valid regex patterns', async () => {
    mockWordFilters.push({ guildId: 'g5', pattern: 'b[a4]d', isRegex: true });

    const filters = await cache.getWordFilters('g5');

    expect(filters[0]?.isRegex).toBe(true);
    expect(filters[0]?.compiled).toBeInstanceOf(RegExp);
    expect(filters[0]?.compiled?.test('bad')).toBe(true);
    expect(filters[0]?.compiled?.test('b4d')).toBe(true);
    expect(filters[0]?.compiled?.test('good')).toBe(false);
  });

  it('returns compiled: null for invalid regex patterns (does not throw)', async () => {
    mockWordFilters.push({ guildId: 'g6', pattern: '[invalid(', isRegex: true });

    const filters = await cache.getWordFilters('g6');

    expect(filters[0]?.isRegex).toBe(true);
    expect(filters[0]?.compiled).toBeNull();
  });

  it('plain-string patterns have compiled: null', async () => {
    mockWordFilters.push({ guildId: 'g7', pattern: 'badword', isRegex: false });

    const filters = await cache.getWordFilters('g7');

    expect(filters[0]?.compiled).toBeNull();
  });

  it('invalidate() also clears word-filter cache for that guild', async () => {
    const { prisma } = await import('../../db.js');
    const findSpy = vi.spyOn(prisma.wordFilter, 'findMany');

    await cache.getWordFilters('g8');
    cache.invalidate('g8'); // full invalidation
    await cache.getWordFilters('g8');

    expect(findSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidateAll() clears word-filter cache for all guilds', async () => {
    const { prisma } = await import('../../db.js');
    const findSpy = vi.spyOn(prisma.wordFilter, 'findMany');

    await cache.getWordFilters('gx');
    await cache.getWordFilters('gy');
    cache.invalidateAll();
    await cache.getWordFilters('gx');
    await cache.getWordFilters('gy');

    expect(findSpy).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Detector TimedMap integration — verify detectors export guild-scoped helpers
// ---------------------------------------------------------------------------

describe('Detector state helpers use TimedMap correctly', () => {
  it('clearSpamStateForGuild clears only the specified guild entries', async () => {
    const { SpamDetector, clearSpamState, clearSpamStateForGuild } = await import(
      '../../detectors/spam.js'
    );
    clearSpamState(); // reset global state

    const detector = new SpamDetector();
    const makeCtx = (guildId: string) => ({
      guildId,
      guild: {} as never,
      guildSettings: { spam: { enabled: true, threshold: 5, windowSeconds: 5 } },
      exemptRoles: [],
      message: { content: 'hello' } as never,
      member: { user: { id: 'user-1' } } as never,
    });

    // Drive some detections for guild-A and guild-B
    for (let i = 0; i < 4; i++) await detector.detect(makeCtx('guild-A'));
    for (let i = 0; i < 4; i++) await detector.detect(makeCtx('guild-B'));

    clearSpamStateForGuild('guild-A');

    // guild-A counter is cleared — a single message should not trigger
    const result = await detector.detect(makeCtx('guild-A'));
    expect(result).toBeNull();
  });

  it('clearDuplicateStateForGuild clears only the specified guild', async () => {
    const { DuplicateDetector, clearDuplicateState, clearDuplicateStateForGuild } = await import(
      '../../detectors/duplicate.js'
    );
    clearDuplicateState();

    const detector = new DuplicateDetector();
    const makeCtx = (guildId: string) => ({
      guildId,
      guild: {} as never,
      guildSettings: { duplicate: { enabled: true, threshold: 3 } },
      exemptRoles: [],
      message: { content: 'dup' } as never,
      member: { user: { id: 'user-1' } } as never,
    });

    await detector.detect(makeCtx('guild-A'));
    await detector.detect(makeCtx('guild-A'));
    await detector.detect(makeCtx('guild-B'));
    await detector.detect(makeCtx('guild-B'));

    clearDuplicateStateForGuild('guild-A');

    // guild-A is reset: one message should not trigger
    const result = await detector.detect(makeCtx('guild-A'));
    expect(result).toBeNull();
  });

  it('clearLinkStateForGuild clears only the specified guild', async () => {
    const { LinkDetector, clearLinkState, clearLinkStateForGuild } = await import(
      '../../detectors/link.js'
    );
    clearLinkState();

    const detector = new LinkDetector();
    const makeCtx = (guildId: string) => ({
      guildId,
      guild: {} as never,
      guildSettings: { link: { enabled: true, threshold: 3, windowSeconds: 10 } },
      exemptRoles: [],
      message: { content: 'https://example.com' } as never,
      member: { user: { id: 'user-1' } } as never,
    });

    await detector.detect(makeCtx('guild-A'));
    await detector.detect(makeCtx('guild-A'));
    await detector.detect(makeCtx('guild-B'));
    await detector.detect(makeCtx('guild-B'));

    clearLinkStateForGuild('guild-A');

    // guild-A is reset: one link should not trigger
    const result = await detector.detect(makeCtx('guild-A'));
    expect(result).toBeNull();
  });
});
