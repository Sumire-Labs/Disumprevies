import type { Client, DMChannel, NonThreadGuildBasedChannel } from 'discord.js';
import { logger } from '../logger/index.js';
import { runChannelProtectorHandler } from '../channel/channelProtectorRegistry.js';

export async function handleChannelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel,
  client: Client,
): Promise<void> {
  // DM channels don't have a guild
  if (!('guild' in channel) || channel.guild === null) return;
  const guildId = channel.guild.id;

  await runChannelProtectorHandler(guildId, 'channelDelete', client).catch((err: unknown) => {
    logger.error('channelDelete: ChannelProtector error', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
