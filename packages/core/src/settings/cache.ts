import { prisma } from '../db.js';
import type {
  GuildSettings,
  DetectorConfig,
  RaidConfig,
  RaidModeConfig,
  RaidSeverity,
  AccountAgeConfig,
  AccountAgeAction,
  ChannelProtectionConfig,
  ModAbuseConfig,
  ChannelOverridesMap,
  AppealConfig,
} from './types.js';
import { DEFAULT_SETTINGS } from './types.js';
import type { Prisma } from '@prisma/client';
import { guildConfigCache } from '../utils/GuildConfigCache.js';

// ---------------------------------------------------------------------------
// In-memory guild settings cache with 60-second TTL
// ---------------------------------------------------------------------------

interface CacheEntry {
  settings: GuildSettings;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const TTL_MS = 60_000; // 60 seconds

function isExpired(entry: CacheEntry): boolean {
  return Date.now() > entry.expiresAt;
}

/**
 * Parse the raw JSON from the DB into a validated GuildSettings object.
 * Unknown keys are ignored; missing keys fall back to defaults.
 */
function parseSettings(raw: unknown): GuildSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(DEFAULT_SETTINGS);
  }

  const obj = raw as Record<string, unknown>;

  // Deep-merge with defaults so we never miss a new key added later
  return {
    spam: mergeDetector(obj['spam'], DEFAULT_SETTINGS.spam),
    duplicate: mergeDetector(obj['duplicate'], DEFAULT_SETTINGS.duplicate),
    mention: mergeDetector(obj['mention'], DEFAULT_SETTINGS.mention),
    link: mergeDetector(obj['link'], DEFAULT_SETTINGS.link),
    invite: {
      ...mergeDetector(obj['invite'], DEFAULT_SETTINGS.invite),
      whitelist: parseStringArray(
        (obj['invite'] as Record<string, unknown> | undefined)?.['whitelist'],
      ),
    },
    wordFilter: {
      enabled: parseBool(
        (obj['wordFilter'] as Record<string, unknown> | undefined)?.['enabled'],
        DEFAULT_SETTINGS.wordFilter.enabled,
      ),
    },
    punishments: parsePunishments(obj['punishments']),
    raid: parseRaidConfig(obj['raid']),
    raidMode: parseRaidModeConfig(obj['raidMode']),
    accountAge: parseAccountAgeConfig(obj['accountAge']),
    channelProtection: parseChannelProtectionConfig(obj['channelProtection']),
    modAbuse: parseModAbuseConfig(obj['modAbuse']),
    channelOverrides: parseChannelOverrides(obj['channelOverrides']),
    appeals: parseAppealConfig(obj['appeals']),
  };
}

function mergeDetector(raw: unknown, defaults: DetectorConfig & { windowSeconds?: number }): DetectorConfig & { windowSeconds?: number } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  const result: DetectorConfig & { windowSeconds?: number } = {
    enabled: parseBool(obj['enabled'], defaults.enabled),
    threshold: parsePositiveInt(obj['threshold'], defaults.threshold),
  };
  if (defaults.windowSeconds !== undefined) {
    result.windowSeconds = parsePositiveInt(obj['windowSeconds'], defaults.windowSeconds);
  }
  return result;
}

function parsePunishments(raw: unknown): GuildSettings['punishments'] {
  const defaults = DEFAULT_SETTINGS.punishments;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  return {
    thresholds: parseThresholds(obj['thresholds']),
    decayPerHour: parsePositiveInt(obj['decayPerHour'], defaults.decayPerHour),
  };
}

function parseThresholds(raw: unknown): GuildSettings['punishments']['thresholds'] {
  if (!Array.isArray(raw)) return structuredClone(DEFAULT_SETTINGS.punishments.thresholds);
  const valid: GuildSettings['punishments']['thresholds'] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const minPoints = typeof obj['minPoints'] === 'number' ? obj['minPoints'] : undefined;
    const action = obj['action'];
    if (minPoints === undefined || typeof action !== 'string') continue;
    if (!['WARN', 'MUTE', 'KICK', 'BAN'].includes(action)) continue;
    const entry: GuildSettings['punishments']['thresholds'][number] = {
      minPoints,
      action: action as 'WARN' | 'MUTE' | 'KICK' | 'BAN',
      ...(typeof obj['muteDurationMinutes'] === 'number' && action === 'MUTE'
        ? { muteDurationMinutes: obj['muteDurationMinutes'] }
        : {}),
    };
    valid.push(entry);
  }
  return valid.length > 0 ? valid : structuredClone(DEFAULT_SETTINGS.punishments.thresholds);
}

function parseRaidConfig(raw: unknown): RaidConfig {
  const defaults = DEFAULT_SETTINGS.raid;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  return {
    enabled: parseBool(obj['enabled'], defaults.enabled),
    threshold: parsePositiveInt(obj['threshold'], defaults.threshold),
    windowSeconds: parsePositiveInt(obj['windowSeconds'], defaults.windowSeconds),
  };
}

function parseRaidModeConfig(raw: unknown): RaidModeConfig {
  const defaults = DEFAULT_SETTINGS.raidMode;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;

  const activatedByRaw = obj['activatedBy'];
  const activatedBy: RaidModeConfig['activatedBy'] =
    activatedByRaw === 'auto' || activatedByRaw === 'manual' ? activatedByRaw : null;

  const severityRaw = obj['autoActivateSeverity'];
  const autoActivateSeverity: RaidSeverity =
    severityRaw === 'low' || severityRaw === 'medium' || severityRaw === 'high'
      ? severityRaw
      : defaults.autoActivateSeverity;

  return {
    active: parseBool(obj['active'], defaults.active),
    activatedAt:
      typeof obj['activatedAt'] === 'string' ? obj['activatedAt'] : null,
    activatedBy,
    autoDisableMinutes: parseNonNegativeInt(obj['autoDisableMinutes'], defaults.autoDisableMinutes),
    autoActivate: parseBool(obj['autoActivate'], defaults.autoActivate),
    autoActivateSeverity,
  };
}

function parseAccountAgeConfig(raw: unknown): AccountAgeConfig {
  const defaults = DEFAULT_SETTINGS.accountAge;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  const rawAction = obj['action'];
  const action: AccountAgeAction =
    rawAction === 'notify' || rawAction === 'kick' || rawAction === 'ban' || rawAction === 'mute'
      ? rawAction
      : defaults.action;
  return {
    enabled: parseBool(obj['enabled'], defaults.enabled),
    minDays: parsePositiveInt(obj['minDays'], defaults.minDays),
    action,
  };
}

function parseChannelProtectionConfig(raw: unknown): ChannelProtectionConfig {
  const defaults = DEFAULT_SETTINGS.channelProtection;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  return {
    enabled: parseBool(obj['enabled'], defaults.enabled),
    threshold: parsePositiveInt(obj['threshold'], defaults.threshold),
    windowSeconds: parsePositiveInt(obj['windowSeconds'], defaults.windowSeconds),
  };
}

function parseModAbuseConfig(raw: unknown): ModAbuseConfig {
  const defaults = DEFAULT_SETTINGS.modAbuse;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  return {
    enabled: parseBool(obj['enabled'], defaults.enabled),
    threshold: parsePositiveInt(obj['threshold'], defaults.threshold),
    windowSeconds: parsePositiveInt(obj['windowSeconds'], defaults.windowSeconds),
  };
}

const VALID_OVERRIDE_KEYS = new Set(['spam', 'duplicate', 'mention', 'link', 'invite', 'wordFilter']);
const VALID_CHANNEL_ID_PATTERN = /^\d{17,20}$/;

function parseChannelOverrides(raw: unknown): ChannelOverridesMap {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const result: ChannelOverridesMap = {};
  for (const [channelId, overrideRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_CHANNEL_ID_PATTERN.test(channelId)) continue;
    if (overrideRaw === null || typeof overrideRaw !== 'object' || Array.isArray(overrideRaw)) {
      continue;
    }
    const channelOverride: Record<string, boolean> = {};
    let hasEntry = false;
    for (const [key, val] of Object.entries(overrideRaw as Record<string, unknown>)) {
      if (!VALID_OVERRIDE_KEYS.has(key) || typeof val !== 'boolean') continue;
      channelOverride[key] = val;
      hasEntry = true;
    }
    if (hasEntry) {
      result[channelId] = channelOverride as ChannelOverridesMap[string];
    }
  }
  return result;
}

function parseAppealConfig(raw: unknown): AppealConfig {
  const defaults = DEFAULT_SETTINGS.appeals;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return structuredClone(defaults);
  }
  const obj = raw as Record<string, unknown>;
  const appealChannel = typeof obj['appealChannel'] === 'string' ? obj['appealChannel'] : null;
  return {
    enabled: parseBool(obj['enabled'], defaults.enabled),
    cooldownHours: parseNonNegativeInt(obj['cooldownHours'], defaults.cooldownHours),
    ...(appealChannel !== null ? { appealChannel } : { appealChannel: null }),
  };
}

function parseBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  return fallback;
}

function parsePositiveInt(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return val;
  return fallback;
}

function parseNonNegativeInt(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isInteger(val) && val >= 0) return val;
  return fallback;
}

function parseStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get settings for a guild, using the in-memory cache.
 * Creates a default Guild record if one doesn't exist yet.
 */
export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached !== undefined && !isExpired(cached)) {
    return cached.settings;
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { settings: true },
  });

  const raw = guild?.settings ?? {};
  const settings = parseSettings(raw);

  cache.set(guildId, { settings, expiresAt: Date.now() + TTL_MS });
  return settings;
}

/**
 * Persist updated settings to the DB and refresh the cache immediately.
 */
export async function saveGuildSettings(
  guildId: string,
  settings: GuildSettings,
): Promise<void> {
  // Prisma's Json field accepts InputJsonValue; cast via JSON round-trip to satisfy the type
  const jsonValue = JSON.parse(JSON.stringify(settings)) as Prisma.InputJsonValue;

  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, settings: jsonValue },
    update: { settings: jsonValue },
  });

  cache.set(guildId, { settings, expiresAt: Date.now() + TTL_MS });
  // Invalidate the pipeline-level GuildConfigCache so the next message fetch
  // reflects the updated settings without waiting for its own TTL to expire.
  guildConfigCache.invalidate(guildId);
}

/**
 * Merge a partial update into the current settings and save.
 */
export async function updateGuildSettings(
  guildId: string,
  updater: (current: GuildSettings) => GuildSettings,
): Promise<GuildSettings> {
  const current = await getGuildSettings(guildId);
  const updated = updater(current);
  await saveGuildSettings(guildId, updated);
  return updated;
}

/**
 * Invalidate the cache entry for a guild.
 * Call this after external mutations (e.g. from premium package).
 */
export function invalidateSettingsCache(guildId: string): void {
  cache.delete(guildId);
}
