import { describe, it, expect } from 'vitest';
import { resolveDetectorEnabled, parseChannelOverrides } from './channelOverrides.js';
import type { GuildSettings } from '@disumprevies/core';
import { DEFAULT_SETTINGS } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

// ---------------------------------------------------------------------------
// parseChannelOverrides
// ---------------------------------------------------------------------------

describe('parseChannelOverrides', () => {
  it('returns empty object for null/undefined/non-object input', () => {
    expect(parseChannelOverrides(null)).toEqual({});
    expect(parseChannelOverrides(undefined)).toEqual({});
    expect(parseChannelOverrides('string')).toEqual({});
    expect(parseChannelOverrides([])).toEqual({});
  });

  it('ignores channels with invalid snowflake IDs', () => {
    const result = parseChannelOverrides({ 'not-a-snowflake': { spam: false } });
    expect(result).toEqual({});
  });

  it('ignores invalid detector keys', () => {
    const result = parseChannelOverrides({ '123456789012345678': { invalidKey: false } });
    expect(result).toEqual({});
  });

  it('ignores non-boolean values for valid keys', () => {
    const result = parseChannelOverrides({ '123456789012345678': { spam: 'yes' } });
    expect(result).toEqual({});
  });

  it('parses valid overrides correctly', () => {
    const raw = {
      '123456789012345678': { spam: false, duplicate: true },
      '987654321098765432': { wordFilter: false },
    };
    const result = parseChannelOverrides(raw);
    expect(result['123456789012345678']).toEqual({ spam: false, duplicate: true });
    expect(result['987654321098765432']).toEqual({ wordFilter: false });
  });

  it('skips channels where all keys are invalid', () => {
    const result = parseChannelOverrides({ '123456789012345678': { badKey: true } });
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// resolveDetectorEnabled
// ---------------------------------------------------------------------------

describe('resolveDetectorEnabled', () => {
  const CHANNEL_ID = '123456789012345678';

  it('returns channel override true when set to true', () => {
    const settings = makeSettings({
      channelOverrides: { [CHANNEL_ID]: { spam: true } },
    });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'spam')).toBe(true);
  });

  it('returns channel override false when set to false', () => {
    const settings = makeSettings({
      channelOverrides: { [CHANNEL_ID]: { spam: false } },
    });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'spam')).toBe(false);
  });

  it('falls back to guild setting when channel override is undefined for that key', () => {
    const settings = makeSettings({
      spam: { enabled: false, threshold: 5, windowSeconds: 5 },
      channelOverrides: { [CHANNEL_ID]: { duplicate: false } }, // spam not overridden
    });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'spam')).toBe(false);
  });

  it('falls back to guild setting when channel has no overrides', () => {
    const settings = makeSettings({
      spam: { enabled: true, threshold: 5, windowSeconds: 5 },
      channelOverrides: {},
    });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'spam')).toBe(true);
  });

  it('falls back to guild setting when channelOverrides is empty map', () => {
    const settings = makeSettings({ channelOverrides: {} });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'wordFilter')).toBe(
      DEFAULT_SETTINGS.wordFilter.enabled,
    );
  });

  it('resolves wordFilter using wordFilter.enabled', () => {
    const settings = makeSettings({
      wordFilter: { enabled: false },
      channelOverrides: {},
    });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'wordFilter')).toBe(false);
  });

  it('channel override takes priority over disabled guild setting', () => {
    const settings = makeSettings({
      spam: { enabled: false, threshold: 5, windowSeconds: 5 },
      channelOverrides: { [CHANNEL_ID]: { spam: true } },
    });
    expect(resolveDetectorEnabled(settings, CHANNEL_ID, 'spam')).toBe(true);
  });

  it('works for all valid detector keys', () => {
    const keys = ['spam', 'duplicate', 'mention', 'link', 'invite', 'wordFilter'] as const;
    for (const key of keys) {
      const settings = makeSettings({
        channelOverrides: { [CHANNEL_ID]: { [key]: false } },
      });
      expect(resolveDetectorEnabled(settings, CHANNEL_ID, key)).toBe(false);
    }
  });
});
