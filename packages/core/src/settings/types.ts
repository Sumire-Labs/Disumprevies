import type { InfractionType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Per-detector configuration (shared shape for all detection modules)
// ---------------------------------------------------------------------------

export interface DetectorConfig {
  enabled: boolean;
  /** Primary count threshold (messages / mentions / links) */
  threshold: number;
  /** Time window in seconds (where applicable) */
  windowSeconds?: number;
}

// ---------------------------------------------------------------------------
// Per-threshold action entry (mirrors ThresholdEntry but serialisable)
// ---------------------------------------------------------------------------

export interface ActionThreshold {
  minPoints: number;
  action: InfractionType;
  /** Minutes for MUTE; undefined for other actions */
  muteDurationMinutes?: number;
}

// ---------------------------------------------------------------------------
// Raid detection configuration
// ---------------------------------------------------------------------------

export type RaidSeverity = 'low' | 'medium' | 'high';

export interface RaidConfig {
  enabled: boolean;
  /** Number of members joining within windowSeconds to trigger detection */
  threshold: number;
  windowSeconds: number;
}

export interface RaidModeConfig {
  /** Whether raid mode is currently active */
  active: boolean;
  /** ISO timestamp of when raid mode was activated (null if inactive) */
  activatedAt: string | null;
  /** How raid mode was activated */
  activatedBy: 'auto' | 'manual' | null;
  /** Minutes until raid mode auto-disables (0 = never) */
  autoDisableMinutes: number;
  /** Premium: automatically activate raid mode when a raid is detected */
  autoActivate: boolean;
  /** Premium: minimum severity that triggers auto-activation */
  autoActivateSeverity: RaidSeverity;
}

// ---------------------------------------------------------------------------
// Top-level GuildSettings shape stored in Guild.settings (JSON column)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Account age filter configuration
// ---------------------------------------------------------------------------

export type AccountAgeAction = 'notify' | 'kick' | 'ban' | 'mute';

export interface AccountAgeConfig {
  enabled: boolean;
  /** Minimum account age in days. Accounts newer than this are flagged. */
  minDays: number;
  /** Action to take when a new account is detected. */
  action: AccountAgeAction;
}

// ---------------------------------------------------------------------------
// Channel protection configuration (Premium)
// ---------------------------------------------------------------------------

export interface ChannelProtectionConfig {
  enabled: boolean;
  /** Number of channel/role create/delete events within windowSeconds to trigger. */
  threshold: number;
  windowSeconds: number;
}

// ---------------------------------------------------------------------------
// Mod abuse detection configuration (Premium)
// ---------------------------------------------------------------------------

export interface ModAbuseConfig {
  enabled: boolean;
  /** Number of bans or kicks by the same moderator within windowSeconds to trigger. */
  threshold: number;
  windowSeconds: number;
}

// ---------------------------------------------------------------------------
// Channel overrides configuration (Premium)
// ---------------------------------------------------------------------------

/** The detector keys that can be toggled per-channel. */
export type ChannelOverrideDetectorKey =
  | 'spam'
  | 'duplicate'
  | 'mention'
  | 'link'
  | 'invite'
  | 'wordFilter';

/**
 * Per-channel detector overrides.
 * true = force-enable, false = force-disable, undefined = follow guild setting.
 */
export type ChannelOverride = Partial<Record<ChannelOverrideDetectorKey, boolean>>;

/**
 * Map of channelId → per-detector override flags.
 * Stored in Guild.settings.channelOverrides.
 */
export type ChannelOverridesMap = Record<string, ChannelOverride>;

// ---------------------------------------------------------------------------
// Appeal system configuration (Premium)
// ---------------------------------------------------------------------------

export interface AppealConfig {
  enabled: boolean;
  /** Hours a user must wait before re-submitting an appeal after rejection. */
  cooldownHours: number;
  /** Optional separate Discord channel ID for appeal notifications. */
  appealChannel: string | null;
}

export interface GuildSettings {
  spam: DetectorConfig;
  duplicate: DetectorConfig;
  mention: DetectorConfig;
  link: DetectorConfig;
  invite: DetectorConfig & {
    /** Allowed invite codes that bypass detection */
    whitelist: string[];
  };
  wordFilter: {
    enabled: boolean;
  };
  punishments: {
    thresholds: ActionThreshold[];
    /** Points decay per hour */
    decayPerHour: number;
  };
  raid: RaidConfig;
  raidMode: RaidModeConfig;
  accountAge: AccountAgeConfig;
  channelProtection: ChannelProtectionConfig;
  modAbuse: ModAbuseConfig;
  channelOverrides: ChannelOverridesMap;
  appeals: AppealConfig;
}

// ---------------------------------------------------------------------------
// Default settings (all detectors ON, original hardcoded values)
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: GuildSettings = {
  spam: { enabled: true, threshold: 5, windowSeconds: 5 },
  duplicate: { enabled: true, threshold: 3 },
  mention: { enabled: true, threshold: 5 },
  link: { enabled: true, threshold: 3, windowSeconds: 10 },
  invite: { enabled: true, threshold: 1, whitelist: [] },
  wordFilter: { enabled: true },
  punishments: {
    thresholds: [
      { minPoints: 3, action: 'WARN' },
      { minPoints: 6, action: 'MUTE', muteDurationMinutes: 10 },
      { minPoints: 9, action: 'KICK' },
      { minPoints: 12, action: 'BAN' },
    ],
    decayPerHour: 1,
  },
  raid: { enabled: true, threshold: 5, windowSeconds: 10 },
  raidMode: {
    active: false,
    activatedAt: null,
    activatedBy: null,
    autoDisableMinutes: 10,
    autoActivate: false,
    autoActivateSeverity: 'high',
  },
  accountAge: { enabled: true, minDays: 7, action: 'notify' },
  channelProtection: { enabled: true, threshold: 5, windowSeconds: 10 },
  modAbuse: { enabled: true, threshold: 5, windowSeconds: 60 },
  channelOverrides: {},
  appeals: { enabled: false, cooldownHours: 72, appealChannel: null },
};

// ---------------------------------------------------------------------------
// Free-plan limits
// ---------------------------------------------------------------------------

export const FREE_LIMITS = {
  wordFilterPatterns: 50,
  punishmentThresholds: 3,
  exemptRoles: 3,
} as const;
