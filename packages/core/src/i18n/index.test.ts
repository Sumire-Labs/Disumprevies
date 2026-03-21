import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Prisma for async t() tests
// ---------------------------------------------------------------------------

vi.mock('../db.js', () => ({
  prisma: {
    guild: {
      findUnique: vi.fn(),
    },
  },
}));

import { tSync, t, invalidateGuildLocaleCache } from './index.js';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// tSync (synchronous, locale passed directly)
// ---------------------------------------------------------------------------

describe('tSync', () => {
  it('returns the translated string for a known English key', () => {
    const result = tSync('warn_dm', { guildName: 'TestServer', reason: 'spamming' });
    // Key exists in en/messages.json; result must differ from the key
    expect(result).not.toBe('warn_dm');
    expect(result).toContain('TestServer');
  });

  it('returns the key itself when the key does not exist', () => {
    const result = tSync('this.key.does.not.exist.anywhere');
    expect(result).toBe('this.key.does.not.exist.anywhere');
  });

  it('falls back to English for an unsupported locale', () => {
    const enResult = tSync('warn_dm', { guildName: 'G', reason: 'r' }, 'en');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unknownResult = tSync('warn_dm', { guildName: 'G', reason: 'r' }, 'zz' as any);
    expect(unknownResult).toBe(enResult);
  });

  it('replaces {param} placeholders with provided values', () => {
    const result = tSync('warn_dm', { guildName: 'MyGuild', reason: 'rule violation' });
    expect(result).toContain('MyGuild');
    expect(result).toContain('rule violation');
  });

  it('returns the template unchanged when no params given and key exists', () => {
    // A key with no placeholders should be returned as-is
    const result = tSync('invite_spam');
    expect(result).toBe('Discord invite link detected');
  });

  it('handles multiple different params being substituted', () => {
    const result = tSync('detector.spam.reason', { count: 7, window: 5 });
    expect(result).toContain('7');
    expect(result).toContain('5');
  });

  it('leaves unreferenced placeholders intact when param is missing', () => {
    // Passing only 'count', not 'window'
    const result = tSync('detector.spam.reason', { count: 3 });
    expect(result).toContain('3');
    expect(result).toContain('{window}'); // unreplaced
  });

  it('returns key when locale file is English and key is unknown', () => {
    const key = 'nonexistent.deep.key.xyz';
    expect(tSync(key, {}, 'en')).toBe(key);
  });

  it('uses English locale by default when locale arg is omitted', () => {
    const withExplicitEn = tSync('settings_enabled', {}, 'en');
    const withDefault = tSync('settings_enabled');
    expect(withDefault).toBe(withExplicitEn);
  });
});

// ---------------------------------------------------------------------------
// t (async, guild-locale resolved from DB)
// ---------------------------------------------------------------------------

describe('t', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Invalidate the locale cache so each test starts fresh
    invalidateGuildLocaleCache('guild-test');
    invalidateGuildLocaleCache('guild-ja');
    invalidateGuildLocaleCache('guild-unknown');
    invalidateGuildLocaleCache('guild-db-error');
  });

  it('resolves translation for a guild with English locale', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      locale: 'en',
    } as never);

    const result = await t('guild-test', 'warn_dm', { guildName: 'G', reason: 'r' });
    expect(typeof result).toBe('string');
    expect(result).not.toBe('warn_dm');
  });

  it('resolves translation for a guild with Japanese locale', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({
      locale: 'ja',
    } as never);

    const result = await t('guild-ja', 'settings_enabled');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns key itself for an unknown translation key', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({ locale: 'en' } as never);

    const key = 'absolutely.unknown.key.404';
    const result = await t('guild-test', key);
    expect(result).toBe(key);
  });

  it('falls back to English when guild has an unsupported locale', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({ locale: 'fr' } as never);

    const enResult = tSync('warn_dm', { guildName: 'G', reason: 'r' }, 'en');
    const result = await t('guild-unknown', 'warn_dm', { guildName: 'G', reason: 'r' });
    expect(result).toBe(enResult);
  });

  it('falls back to English when guild is not found in DB', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue(null);

    const result = await t('guild-test', 'warn_dm', { guildName: 'G', reason: 'r' });
    const enResult = tSync('warn_dm', { guildName: 'G', reason: 'r' });
    expect(result).toBe(enResult);
  });

  it('falls back to English when DB throws an error', async () => {
    vi.mocked(prisma.guild.findUnique).mockRejectedValue(new Error('DB connection lost'));

    // Should not throw
    const result = await t('guild-db-error', 'settings_enabled');
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
  });

  it('caches the resolved locale and avoids repeated DB calls', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({ locale: 'en' } as never);

    await t('guild-test', 'settings_enabled');
    await t('guild-test', 'settings_disabled');
    await t('guild-test', 'invite_spam');

    // findUnique should only have been called once (locale cached after first call)
    expect(vi.mocked(prisma.guild.findUnique)).toHaveBeenCalledTimes(1);
  });

  it('interpolates parameters in the async path', async () => {
    vi.mocked(prisma.guild.findUnique).mockResolvedValue({ locale: 'en' } as never);

    const result = await t('guild-test', 'warn_dm', {
      guildName: 'AsyncGuild',
      reason: 'async reason',
    });
    expect(result).toContain('AsyncGuild');
    expect(result).toContain('async reason');
  });
});
