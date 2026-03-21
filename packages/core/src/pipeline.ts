import type { Message, TextChannel } from 'discord.js';
import { logger } from './logger/index.js';
import { logInfractionToChannel } from './logger/index.js';
import { ActionExecutor } from './actions/index.js';
import type { Detector, MessageDetectionContext } from './detectors/base.js';
import { guildConfigCache } from './utils/GuildConfigCache.js';
import { withDbRetry } from './utils/database.js';
import type { ThresholdEntry } from './actions/thresholds.js';
import { Feature, checkFeatureAccess } from './gates/index.js';
import type { GuildSettings, ChannelOverrideDetectorKey } from './settings/types.js';
import { getChannelOverrideResolver } from './channel/channelOverrideRegistry.js';

// Re-export GuildConfig so callers that already import it from here continue
// to work without change.
export type { GuildConfig } from './utils/GuildConfigCache.js';

// ---------------------------------------------------------------------------
// Exempt check
// ---------------------------------------------------------------------------

function isMemberExempt(memberRoleIds: string[], exemptRoles: string[]): boolean {
  if (exemptRoles.length === 0) return false;
  return memberRoleIds.some((id) => exemptRoles.includes(id));
}

// ---------------------------------------------------------------------------
// Channel override check
// ---------------------------------------------------------------------------

/**
 * The mapping from detector.name → ChannelOverrideDetectorKey.
 * Only detectors that appear in this map can be disabled per-channel.
 *
 * Exported for testing: verifies that detector names match the keys stored
 * in Guild.settings.channelOverrides.
 */
export const DETECTOR_NAME_TO_OVERRIDE_KEY: Readonly<Record<string, ChannelOverrideDetectorKey>> = {
  spam: 'spam',
  duplicate: 'duplicate',
  mention: 'mention',
  link: 'link',
  invite: 'invite',
  'word-filter': 'wordFilter',
};

/**
 * Returns false if this detector is disabled for the given channel via
 * Premium channel overrides.  Returns true in all other cases (no access,
 * no override registered, detector not in override map).
 */
async function isDetectorEnabledForChannel(
  guildId: string,
  channelId: string,
  detectorName: string,
  guildSettings: GuildSettings,
  hasChannelOverrideAccess: boolean,
): Promise<boolean> {
  if (!hasChannelOverrideAccess) return true;

  const overrideKey = DETECTOR_NAME_TO_OVERRIDE_KEY[detectorName];
  if (overrideKey === undefined) return true;

  const resolver = getChannelOverrideResolver();
  if (resolver === null) return true;

  return resolver(guildSettings, channelId, overrideKey);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  /** Ordered list of detectors to run. */
  detectors: readonly Detector[];
  executor?: ActionExecutor;
}

export class DetectionPipeline {
  private readonly detectors: readonly Detector[];
  private readonly executor: ActionExecutor;

  constructor(options: PipelineOptions) {
    this.detectors = options.detectors;
    this.executor = options.executor ?? new ActionExecutor();
  }

  /**
   * Run the full pipeline for a Discord message event.
   *
   * Flow:
   *   1. Fetch guild config via GuildConfigCache (DB only on cache miss/expiry)
   *   2. Exempt check
   *   3. Check channel overrides (Premium) — skip disabled detectors per channel
   *   4. Run each detector in order; stop at first triggered result
   *   5. Execute action (point accumulation → moderation)
   *   6. Log to Discord channel
   */
  async run(message: Message<true>): Promise<void> {
    const { guild, member } = message;
    if (member === null) return; // DM or webhook — skip

    // Step 1 – config fetch (served from cache; DB only on miss/expiry)
    let config: Awaited<ReturnType<typeof guildConfigCache.get>>;
    try {
      config = await withDbRetry(() => guildConfigCache.get(guild.id), {
        guildId: guild.id,
        operation: 'guildConfigCache.get',
      });
    } catch (err) {
      logger.error('Failed to fetch guild config after retries — skipping detection', {
        guildId: guild.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Step 2 – exempt check
    const memberRoleIds = [...member.roles.cache.keys()];
    if (isMemberExempt(memberRoleIds, config.exemptRoles)) {
      return;
    }

    // Merge guild settings with defaults so detectors always receive a full object
    const guildSettings = config.settings as unknown as GuildSettings;

    // Step 3 – check channel override access once (single DB lookup cached by plan)
    const hasChannelOverrideAccess = await checkFeatureAccess(guild.id, Feature.ChannelOverrides);
    const channelId = message.channelId;

    logger.debug('Guild settings channelOverrides', {
      guildId: guild.id,
      channelOverrides: guildSettings.channelOverrides,
      hasChannelOverrideAccess,
      resolverRegistered: getChannelOverrideResolver() !== null,
    });

    // Step 4 – detectors
    const ctx: MessageDetectionContext = {
      guild,
      guildId: guild.id,
      guildSettings: config.settings,
      exemptRoles: config.exemptRoles,
      message,
      member,
    };

    let detected = false;
    for (const detector of this.detectors) {
      try {
        // Channel override check: skip this detector if disabled for this channel
        const enabled = await isDetectorEnabledForChannel(
          guild.id,
          channelId,
          detector.name,
          guildSettings,
          hasChannelOverrideAccess,
        );
        logger.debug('Channel override check', {
          channelId,
          detector: detector.name,
          resolved: enabled,
          guildPlan: hasChannelOverrideAccess ? 'PREMIUM' : 'FREE',
        });
        if (!enabled) {
          logger.debug('Detector skipped by channel override', {
            guildId: guild.id,
            channelId,
            detector: detector.name,
          });
          continue;
        }

        const result = await detector.detect(ctx);
        if (result === null) continue;

        detected = true;

        // Resolve log / mod channels lazily
        const logChannel = this.resolveTextChannel(message, config.logChannelId);
        const modChannel = this.resolveTextChannel(message, config.modChannelId);

        // Extract guild-configured punishment thresholds if present
        const punishmentsRaw = config.settings['punishments'] as
          | Record<string, unknown>
          | undefined;
        const thresholdsRaw = punishmentsRaw?.['thresholds'];
        const guildThresholds: ThresholdEntry[] | undefined = Array.isArray(thresholdsRaw)
          ? (thresholdsRaw as ThresholdEntry[])
          : undefined;

        // Step 5 – action
        const actionResult = await this.executor.execute({
          guildId: guild.id,
          member,
          reason: result.reason,
          eventPoints: result.points,
          message,
          ...(logChannel !== null ? { logChannel } : {}),
          ...(guildThresholds !== undefined ? { thresholds: guildThresholds } : {}),
        });

        // Step 6 – log to Discord
        if (logChannel !== null && actionResult.action !== 'none') {
          await logInfractionToChannel({
            guildId: guild.id,
            channel: logChannel,
            type: actionResult.action,
            userId: member.user.id,
            reason: result.reason,
            points: result.points,
            totalPoints: actionResult.totalPoints,
            ...(actionResult.muteDurationMinutes !== undefined
              ? { muteDurationMinutes: actionResult.muteDurationMinutes }
              : {}),
            ...(modChannel !== null ? { modChannel } : {}),
          });
        }

        logger.info('Detection triggered', {
          guildId: guild.id,
          detector: result.detectorName,
          userId: member.user.id,
          action: actionResult.action,
        });

        break; // first triggered detector wins
      } catch (err) {
        logger.error('Detector threw an error', {
          guildId: guild.id,
          detector: detector.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!detected) {
      logger.debug('No detectors triggered', { guildId: guild.id, messageId: message.id });
    }
  }

  private resolveTextChannel(
    message: Message<true>,
    channelId: string | null,
  ): TextChannel | null {
    if (channelId === null) return null;
    const ch = message.guild.channels.cache.get(channelId);
    if (ch?.isTextBased() && !ch.isDMBased()) {
      return ch as TextChannel;
    }
    return null;
  }
}
