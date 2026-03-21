import { Plan } from '@prisma/client';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Feature enum
// ---------------------------------------------------------------------------

/** All feature flags managed by the gate system. */
export enum Feature {
  // Core features (FREE + PREMIUM)
  WordFilter = 'word-filter',
  SpamDetection = 'spam-detection',
  InfractionTracking = 'infraction-tracking',

  // Premium-only features
  AdvancedRaidDetection = 'advanced-raid-detection',
  AppealSystem = 'appeal-system',
  Analytics = 'analytics',
  MultiServerSync = 'multi-server-sync',
  ChannelProtection = 'channel-protection',
  ModAbuseDetection = 'mod-abuse-detection',
  ChannelOverrides = 'channel-overrides',
}

// ---------------------------------------------------------------------------
// Feature plan mapping (single source of truth)
// ---------------------------------------------------------------------------

const PREMIUM_ONLY_FEATURES: ReadonlySet<Feature> = new Set([
  Feature.AdvancedRaidDetection,
  Feature.AppealSystem,
  Feature.Analytics,
  Feature.MultiServerSync,
  Feature.ChannelProtection,
  Feature.ModAbuseDetection,
  Feature.ChannelOverrides,
]);

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

/**
 * Returns true if the guild has access to the given feature.
 * Free features always return true; premium features require PREMIUM plan.
 *
 * NEVER bypass this check for premium features.
 */
export async function checkFeatureAccess(guildId: string, feature: Feature): Promise<boolean> {
  if (!PREMIUM_ONLY_FEATURES.has(feature)) {
    return true;
  }
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { plan: true },
  });
  return guild?.plan === Plan.PREMIUM;
}
