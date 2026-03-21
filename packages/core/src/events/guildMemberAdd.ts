import type { GuildMember, Client } from 'discord.js';
import { logger } from '../logger/index.js';
import { guildConfigCache } from '../utils/GuildConfigCache.js';
import { BasicRaidDetector } from '../detectors/raidBasic.js';
import type { RaidContext } from '../detectors/raidBasic.js';
import {
  notifyRaidDetected,
  activateRaidMode,
  isRaidModeActive,
  kickRaidJoiner,
} from '../raid/raidMode.js';
import { checkFeatureAccess, Feature } from '../gates/index.js';
import { runAdditionalRaidAnalyzers } from '../raid/raidAnalyzerRegistry.js';
import type { RaidSeverity } from '../settings/types.js';
import { AccountAgeFilter } from '../detectors/accountAge.js';

// ---------------------------------------------------------------------------
// Module-level detector instances (shared across all events)
// ---------------------------------------------------------------------------

const basicRaidDetector = new BasicRaidDetector();
const accountAgeFilter = new AccountAgeFilter();

// ---------------------------------------------------------------------------
// Severity order for comparison
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<RaidSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function severityAtLeast(actual: RaidSeverity, minimum: RaidSeverity): boolean {
  return SEVERITY_ORDER[actual] >= SEVERITY_ORDER[minimum];
}

// ---------------------------------------------------------------------------
// guildMemberAdd pipeline
//
// Flow:
//   1. Fetch guild config (cache → DB on miss)
//   2. Exempt check (skip if member has an exempt role)
//   3. If raid mode is active → kick the new joiner
//   4. Run BasicRaidDetector
//   5. If raid detected:
//      a. Run registered additional analyzers (e.g. AdvancedRaidDetector from premium)
//      b. Notify log/mod channels
//      c. If Premium + autoActivate + severity meets threshold → activate raid mode
// ---------------------------------------------------------------------------

export async function handleGuildMemberAdd(
  member: GuildMember,
  client: Client,
): Promise<void> {
  if (member.user.bot) return; // ignore bot joins

  const guildId = member.guild.id;

  let config: Awaited<ReturnType<typeof guildConfigCache.get>>;
  try {
    config = await guildConfigCache.get(guildId);
  } catch (err) {
    logger.error('GuildMemberAdd: failed to fetch guild config', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Exempt check — skip moderation for exempt roles
  const memberRoleIds = [...member.roles.cache.keys()];
  if (memberRoleIds.some((id) => config.exemptRoles.includes(id))) {
    return;
  }

  // Step 3 — If raid mode active, kick the new joiner
  const raidActive = await isRaidModeActive(guildId);
  if (raidActive) {
    const { t } = await import('../i18n/index.js');
    const kickReason = await t(guildId, 'raid.mode.kickReason');
    await kickRaidJoiner(member, kickReason);
    return;
  }

  // Step 4 — Run BasicRaidDetector
  const ctx: RaidContext = {
    guildId,
    member,
    guildSettings: config.settings,
    exemptRoles: config.exemptRoles,
  };

  const basicResult = await basicRaidDetector.detectRaid(ctx);

  if (basicResult === null) {
    logger.debug('GuildMemberAdd: no raid detected', { guildId });
    // Step 5 — Run AccountAgeFilter (only when no raid is in progress)
    await accountAgeFilter.check(member, client).catch((err: unknown) => {
      logger.error('GuildMemberAdd: AccountAgeFilter error', {
        guildId,
        userId: member.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return;
  }

  // Step 5a — Run any registered additional analyzers (premium: AdvancedRaidDetector)
  const hasAdvanced = await checkFeatureAccess(guildId, Feature.AdvancedRaidDetection);
  let result = hasAdvanced
    ? await runAdditionalRaidAnalyzers(basicResult, guildId)
    : basicResult;

  // Step 5b — Notify channels about the detected raid
  await notifyRaidDetected(guildId, result, client);

  // Step 5c — Auto-activate raid mode based on severity (Premium)
  if (hasAdvanced) {
    const raidSettings = config.settings['raidMode'] as Record<string, unknown> | undefined;
    const autoActivate =
      typeof raidSettings?.['autoActivate'] === 'boolean' ? raidSettings['autoActivate'] : false;
    const autoActivateSeverityRaw = raidSettings?.['autoActivateSeverity'];
    const autoActivateSeverity: RaidSeverity =
      autoActivateSeverityRaw === 'low' ||
      autoActivateSeverityRaw === 'medium' ||
      autoActivateSeverityRaw === 'high'
        ? autoActivateSeverityRaw
        : 'high';

    if (autoActivate && severityAtLeast(result.severity, autoActivateSeverity)) {
      await activateRaidMode(guildId, 'auto', client);
    }
  }

  logger.info('GuildMemberAdd: raid event processed', {
    guildId,
    severity: result.severity,
    joinCount: result.joinCount,
  });
}
