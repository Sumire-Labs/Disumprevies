import type { Client, GuildMember, PartialGuildMember } from 'discord.js';
import { logger } from '../logger/index.js';
import { runModAbuseHandler } from '../modabuse/modAbuseRegistry.js';

/**
 * Handles guildMemberRemove events.
 * Delegates to ModAbuseDetector to check if the removal was a kick
 * (via audit log) and whether the kicker is exceeding kick thresholds.
 */
export async function handleGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
  client: Client,
): Promise<void> {
  if (member.user?.bot === true) return;

  const guildId = member.guild.id;

  await runModAbuseHandler(guildId, 'kick', client).catch((err: unknown) => {
    logger.error('guildMemberRemove: ModAbuseDetector error', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
