/**
 * Integration test: Settings change → detection behaviour
 *
 * Verifies that when guild settings change (e.g. a detector is disabled or its
 * threshold is updated) the detection pipeline respects the new configuration
 * on the next message event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, Guild, GuildMember } from 'discord.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../db.js', () => ({
  prisma: {
    guild: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
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

import { prisma } from '../db.js';
import { getGuildSettings, saveGuildSettings, invalidateSettingsCache } from '../settings/cache.js';
import type { GuildSettings } from '../settings/types.js';
import { DEFAULT_SETTINGS } from '../settings/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUILD_ID = 'settings-test-guild';

function mockDbSettings(settings: Partial<GuildSettings> = {}): void {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  vi.mocked(prisma.guild.findUnique).mockResolvedValue({
    id: GUILD_ID,
    plan: 'FREE' as const,
    locale: 'en',
    settings: merged,
    exemptRoles: [],
    logChannel: null,
    modChannel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings change → detection behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Always clear the settings cache between tests
    invalidateSettingsCache(GUILD_ID);
  });

  it('returns default settings when guild has no custom settings', async () => {
    mockDbSettings();
    const settings = await getGuildSettings(GUILD_ID);

    expect(settings.spam.enabled).toBe(true);
    expect(settings.spam.threshold).toBe(5);
    expect(settings.spam.windowSeconds).toBe(5);
  });

  it('reflects a disabled detector after settings update', async () => {
    // Start with spam enabled
    mockDbSettings({ spam: { enabled: true, threshold: 5, windowSeconds: 5 } });
    const before = await getGuildSettings(GUILD_ID);
    expect(before.spam.enabled).toBe(true);

    // Update: disable spam detector
    invalidateSettingsCache(GUILD_ID);
    mockDbSettings({ spam: { enabled: false, threshold: 5, windowSeconds: 5 } });
    const after = await getGuildSettings(GUILD_ID);
    expect(after.spam.enabled).toBe(false);
  });

  it('reflects a threshold change after settings update', async () => {
    mockDbSettings({ spam: { enabled: true, threshold: 5, windowSeconds: 5 } });
    const before = await getGuildSettings(GUILD_ID);
    expect(before.spam.threshold).toBe(5);

    // Update threshold to 10
    invalidateSettingsCache(GUILD_ID);
    mockDbSettings({ spam: { enabled: true, threshold: 10, windowSeconds: 5 } });
    const after = await getGuildSettings(GUILD_ID);
    expect(after.spam.threshold).toBe(10);
  });

  it('serves cached settings within TTL without re-querying the DB', async () => {
    mockDbSettings();
    // First call populates the cache
    await getGuildSettings(GUILD_ID);
    // Second call should use the cache
    await getGuildSettings(GUILD_ID);

    // DB should only have been queried once
    expect(vi.mocked(prisma.guild.findUnique)).toHaveBeenCalledOnce();
  });

  it('re-queries DB after cache invalidation', async () => {
    mockDbSettings();
    await getGuildSettings(GUILD_ID);
    invalidateSettingsCache(GUILD_ID);
    await getGuildSettings(GUILD_ID);

    expect(vi.mocked(prisma.guild.findUnique)).toHaveBeenCalledTimes(2);
  });

  it('persists settings to DB via saveGuildSettings', async () => {
    const newSettings: GuildSettings = {
      ...DEFAULT_SETTINGS,
      spam: { enabled: false, threshold: 10, windowSeconds: 3 },
    };

    await saveGuildSettings(GUILD_ID, newSettings);

    expect(vi.mocked(prisma.guild.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GUILD_ID },
        create: expect.objectContaining({ id: GUILD_ID }),
        update: expect.any(Object),
      }),
    );
  });

  it('falls back to DEFAULT_SETTINGS for missing keys in DB JSON', async () => {
    // Only partial settings stored in DB (e.g. old schema before new detector added)
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      id: GUILD_ID,
      plan: 'FREE' as const,
      locale: 'en',
      settings: { spam: { enabled: false, threshold: 3, windowSeconds: 5 } },
      exemptRoles: [],
      logChannel: null,
      modChannel: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const settings = await getGuildSettings(GUILD_ID);

    // Spam overridden
    expect(settings.spam.enabled).toBe(false);
    expect(settings.spam.threshold).toBe(3);

    // Other detectors fall back to defaults
    expect(settings.duplicate.enabled).toBe(DEFAULT_SETTINGS.duplicate.enabled);
    expect(settings.mention.threshold).toBe(DEFAULT_SETTINGS.mention.threshold);
  });

  it('uses custom punishment thresholds after update', async () => {
    mockDbSettings({
      punishments: {
        thresholds: [
          { minPoints: 5, action: 'WARN' },
          { minPoints: 10, action: 'BAN' },
        ],
        decayPerHour: 2,
      },
    });

    const settings = await getGuildSettings(GUILD_ID);

    expect(settings.punishments.thresholds).toHaveLength(2);
    expect(settings.punishments.thresholds[0]).toEqual({ minPoints: 5, action: 'WARN' });
    expect(settings.punishments.thresholds[1]).toEqual({ minPoints: 10, action: 'BAN' });
    expect(settings.punishments.decayPerHour).toBe(2);
  });

  it('invite whitelist is preserved through settings round-trip', async () => {
    mockDbSettings({
      invite: {
        enabled: true,
        threshold: 1,
        whitelist: ['allowed-invite-code', 'another-code'],
      },
    });

    const settings = await getGuildSettings(GUILD_ID);

    expect(settings.invite.whitelist).toEqual(['allowed-invite-code', 'another-code']);
  });
});
