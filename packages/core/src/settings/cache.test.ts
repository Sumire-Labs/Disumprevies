import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETTINGS } from './types.js';
import type { GuildSettings } from './types.js';

// ---------------------------------------------------------------------------
// Mock Prisma so tests don't need a real database
// ---------------------------------------------------------------------------

const mockGuild: Record<string, { settings: unknown }> = {};

vi.mock('../db.js', () => ({
  prisma: {
    guild: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const g = mockGuild[where.id];
        return g ?? null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: { id: string; settings?: unknown };
          update: { settings?: unknown };
        }) => {
          const existing = mockGuild[where.id];
          if (existing !== undefined) {
            mockGuild[where.id] = { ...existing, ...update };
          } else {
            mockGuild[where.id] = { settings: {}, ...create };
          }
          return mockGuild[where.id];
        },
      ),
    },
  },
}));

// Import AFTER mocking
const { getGuildSettings, saveGuildSettings, updateGuildSettings, invalidateSettingsCache } =
  await import('./cache.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMock(): void {
  for (const key of Object.keys(mockGuild)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete mockGuild[key];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getGuildSettings', () => {
  beforeEach(() => {
    resetMock();
    invalidateSettingsCache('guild1');
  });

  it('returns defaults when guild has no settings', async () => {
    const settings = await getGuildSettings('guild1');
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges partial settings with defaults', async () => {
    mockGuild['guild1'] = { settings: { spam: { enabled: false } } };
    invalidateSettingsCache('guild1');

    const settings = await getGuildSettings('guild1');
    expect(settings.spam.enabled).toBe(false);
    // Threshold should fall back to default
    expect(settings.spam.threshold).toBe(DEFAULT_SETTINGS.spam.threshold);
    // Other detectors unaffected
    expect(settings.duplicate).toEqual(DEFAULT_SETTINGS.duplicate);
  });

  it('parses full settings correctly', async () => {
    const full: GuildSettings = {
      ...DEFAULT_SETTINGS,
      spam: { enabled: false, threshold: 10, windowSeconds: 3 },
      punishments: {
        thresholds: [{ minPoints: 5, action: 'KICK' }],
        decayPerHour: 2,
      },
    };
    mockGuild['guild1'] = { settings: full };
    invalidateSettingsCache('guild1');

    const settings = await getGuildSettings('guild1');
    expect(settings.spam.threshold).toBe(10);
    expect(settings.spam.windowSeconds).toBe(3);
    expect(settings.punishments.decayPerHour).toBe(2);
    expect(settings.punishments.thresholds).toHaveLength(1);
    expect(settings.punishments.thresholds[0]?.action).toBe('KICK');
  });

  it('ignores invalid action type in thresholds and falls back to defaults', async () => {
    mockGuild['guild1'] = {
      settings: {
        punishments: {
          thresholds: [{ minPoints: 3, action: 'INVALID' }],
          decayPerHour: 1,
        },
      },
    };
    invalidateSettingsCache('guild1');

    const settings = await getGuildSettings('guild1');
    // Invalid threshold entry filtered out, falls back to defaults
    expect(settings.punishments.thresholds).toEqual(DEFAULT_SETTINGS.punishments.thresholds);
  });

  it('caches results and avoids repeated DB calls', async () => {
    const { prisma } = await import('../db.js');
    const spy = vi.spyOn(prisma.guild, 'findUnique');

    invalidateSettingsCache('guild2');
    await getGuildSettings('guild2');
    await getGuildSettings('guild2'); // second call should hit cache

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('saveGuildSettings', () => {
  beforeEach(() => {
    resetMock();
    invalidateSettingsCache('guild3');
  });

  it('persists settings to the database', async () => {
    const { prisma } = await import('../db.js');
    const spy = vi.spyOn(prisma.guild, 'upsert');

    const custom: GuildSettings = {
      ...DEFAULT_SETTINGS,
      duplicate: { enabled: false, threshold: 5 },
    };

    await saveGuildSettings('guild3', custom);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('updates the in-memory cache after saving', async () => {
    const { prisma } = await import('../db.js');
    const findSpy = vi.spyOn(prisma.guild, 'findUnique');

    const custom: GuildSettings = {
      ...DEFAULT_SETTINGS,
      mention: { enabled: false, threshold: 3 },
    };

    await saveGuildSettings('guild3', custom);
    // Should read from cache, not DB
    const fetched = await getGuildSettings('guild3');
    expect(fetched.mention.enabled).toBe(false);
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });
});

describe('updateGuildSettings', () => {
  beforeEach(() => {
    resetMock();
    invalidateSettingsCache('guild4');
  });

  it('applies the updater function and persists', async () => {
    // Seed initial state
    await saveGuildSettings('guild4', DEFAULT_SETTINGS);

    const updated = await updateGuildSettings('guild4', (s) => ({
      ...s,
      link: { ...s.link, enabled: false, threshold: 7 },
    }));

    expect(updated.link.enabled).toBe(false);
    expect(updated.link.threshold).toBe(7);

    // Verify cache reflects change
    const fetched = await getGuildSettings('guild4');
    expect(fetched.link.threshold).toBe(7);
  });

  it('returns the updated settings object', async () => {
    await saveGuildSettings('guild4', DEFAULT_SETTINGS);

    const result = await updateGuildSettings('guild4', (s) => ({
      ...s,
      invite: { ...s.invite, enabled: false, threshold: 1, whitelist: ['abc123'] },
    }));

    expect(result.invite.whitelist).toEqual(['abc123']);
  });
});

describe('DEFAULT_SETTINGS integrity', () => {
  it('has all required detector keys', () => {
    expect(DEFAULT_SETTINGS.spam).toBeDefined();
    expect(DEFAULT_SETTINGS.duplicate).toBeDefined();
    expect(DEFAULT_SETTINGS.mention).toBeDefined();
    expect(DEFAULT_SETTINGS.link).toBeDefined();
    expect(DEFAULT_SETTINGS.invite).toBeDefined();
    expect(DEFAULT_SETTINGS.wordFilter).toBeDefined();
    expect(DEFAULT_SETTINGS.punishments).toBeDefined();
  });

  it('has at least one punishment threshold', () => {
    expect(DEFAULT_SETTINGS.punishments.thresholds.length).toBeGreaterThan(0);
  });

  it('thresholds are sorted by minPoints ascending', () => {
    const pts = DEFAULT_SETTINGS.punishments.thresholds.map((t) => t.minPoints);
    expect(pts).toEqual([...pts].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// Settings validation edge cases (invalid / corrupt input via parseSettings)
// ---------------------------------------------------------------------------

describe('parseSettings edge cases', () => {
  beforeEach(() => {
    resetMock();
    invalidateSettingsCache('guild-edge');
  });

  it('returns defaults when settings is null', async () => {
    mockGuild['guild-edge'] = { settings: null };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when settings is an array (corrupt type)', async () => {
    mockGuild['guild-edge'] = { settings: [1, 2, 3] };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when settings is a plain string', async () => {
    mockGuild['guild-edge'] = { settings: 'not-an-object' };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to default threshold when a negative number is provided', async () => {
    mockGuild['guild-edge'] = {
      settings: { spam: { enabled: true, threshold: -5, windowSeconds: 5 } },
    };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.spam.threshold).toBe(DEFAULT_SETTINGS.spam.threshold);
  });

  it('falls back to default threshold when zero is provided', async () => {
    mockGuild['guild-edge'] = { settings: { duplicate: { enabled: true, threshold: 0 } } };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.duplicate.threshold).toBe(DEFAULT_SETTINGS.duplicate.threshold);
  });

  it('falls back to default threshold when a float is provided', async () => {
    mockGuild['guild-edge'] = { settings: { mention: { enabled: true, threshold: 2.5 } } };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.mention.threshold).toBe(DEFAULT_SETTINGS.mention.threshold);
  });

  it('falls back to default when a string is in a numeric field', async () => {
    mockGuild['guild-edge'] = {
      settings: { link: { enabled: true, threshold: 'many', windowSeconds: 10 } },
    };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.link.threshold).toBe(DEFAULT_SETTINGS.link.threshold);
  });

  it('falls back to default enabled value when a non-boolean is provided', async () => {
    mockGuild['guild-edge'] = {
      settings: { spam: { enabled: 'yes', threshold: 5, windowSeconds: 5 } },
    };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.spam.enabled).toBe(DEFAULT_SETTINGS.spam.enabled);
  });

  it('accepts an extremely large positive integer for threshold', async () => {
    const huge = 999_999;
    mockGuild['guild-edge'] = {
      settings: { spam: { enabled: true, threshold: huge, windowSeconds: 5 } },
    };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.spam.threshold).toBe(huge);
  });

  it('falls back to default punishments when thresholds array is empty', async () => {
    mockGuild['guild-edge'] = {
      settings: { punishments: { thresholds: [], decayPerHour: 1 } },
    };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.punishments.thresholds).toEqual(DEFAULT_SETTINGS.punishments.thresholds);
  });

  it('filters out threshold entries with invalid action strings', async () => {
    mockGuild['guild-edge'] = {
      settings: {
        punishments: {
          thresholds: [
            { minPoints: 3, action: 'WARN' },
            { minPoints: 5, action: 'DELETE' }, // invalid
            { minPoints: 9, action: 'KICK' },
          ],
          decayPerHour: 1,
        },
      },
    };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings.punishments.thresholds.map((t) => t.action)).not.toContain('DELETE');
    expect(settings.punishments.thresholds.some((t) => t.action === 'WARN')).toBe(true);
  });

  it('handles completely empty settings object — all defaults', async () => {
    mockGuild['guild-edge'] = { settings: {} };
    invalidateSettingsCache('guild-edge');
    const settings = await getGuildSettings('guild-edge');
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});
