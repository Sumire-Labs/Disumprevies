/**
 * Channel-level detector overrides (Premium).
 *
 * Allows specific channels to enable or disable individual detection modules
 * independently of the guild-wide setting.
 *
 * Priority: channelOverrides[channelId][detector] > guildSettings[detector].enabled > default
 */

import type {
  GuildSettings,
  ChannelOverrideDetectorKey,
  ChannelOverridesMap,
} from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Valid detector keys
// ---------------------------------------------------------------------------

const VALID_DETECTOR_KEYS = new Set<ChannelOverrideDetectorKey>([
  'spam',
  'duplicate',
  'mention',
  'link',
  'invite',
  'wordFilter',
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidChannelId(channelId: string): boolean {
  // Discord snowflake IDs: 17–20 digits
  return /^\d{17,20}$/.test(channelId);
}

function isValidDetectorKey(key: string): key is ChannelOverrideDetectorKey {
  return VALID_DETECTOR_KEYS.has(key as ChannelOverrideDetectorKey);
}

/**
 * Parse and validate raw channelOverrides from Guild.settings JSON.
 * Invalid channelIds or detector names are silently ignored.
 */
export function parseChannelOverrides(raw: unknown): ChannelOverridesMap {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: ChannelOverridesMap = {};

  for (const [channelId, overrideRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidChannelId(channelId)) continue;
    if (overrideRaw === null || typeof overrideRaw !== 'object' || Array.isArray(overrideRaw)) {
      continue;
    }

    const channelOverride: Partial<Record<ChannelOverrideDetectorKey, boolean>> = {};
    let hasValidEntry = false;

    for (const [detectorKey, value] of Object.entries(overrideRaw as Record<string, unknown>)) {
      if (!isValidDetectorKey(detectorKey)) continue;
      if (typeof value !== 'boolean') continue;
      channelOverride[detectorKey] = value;
      hasValidEntry = true;
    }

    if (hasValidEntry) {
      result[channelId] = channelOverride;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core resolution logic
// ---------------------------------------------------------------------------

/**
 * Determine if a detector is enabled for a given channel, considering:
 * 1. channelOverrides[channelId][detectorName] — if explicitly set, use it
 * 2. guildSettings[detectorName].enabled — fallback to guild-wide setting
 *
 * If the guild setting is missing, defaults to true (the configured default).
 */
export function resolveDetectorEnabled(
  guildSettings: GuildSettings,
  channelId: string,
  detectorName: ChannelOverrideDetectorKey,
): boolean {
  const overrides = guildSettings.channelOverrides;

  if (overrides !== undefined) {
    const channelOverride = overrides[channelId];
    if (channelOverride !== undefined) {
      const override = channelOverride[detectorName];
      if (override !== undefined) {
        return override;
      }
    }
  }

  // Fallback to the guild-wide setting
  return getGuildDetectorEnabled(guildSettings, detectorName);
}

/**
 * Read the guild-level enabled flag for a detector.
 * Returns true as the safe default if the setting is missing.
 */
function getGuildDetectorEnabled(
  settings: GuildSettings,
  detectorName: ChannelOverrideDetectorKey,
): boolean {
  if (detectorName === 'wordFilter') {
    return settings.wordFilter.enabled;
  }
  return settings[detectorName].enabled;
}
