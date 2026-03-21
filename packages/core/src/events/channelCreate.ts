import type { Client, NonThreadGuildBasedChannel } from 'discord.js';
import { logger } from '../logger/index.js';
import { runChannelProtectorHandler } from '../channel/channelProtectorRegistry.js';

export async function handleChannelCreate(
  channel: NonThreadGuildBasedChannel,
  client: Client,
): Promise<void> {
  if (!channel.guild) return;
  const guildId = channel.guild.id;

  await runChannelProtectorHandler(guildId, 'channelCreate', client).catch((err: unknown) => {
    logger.error('channelCreate: ChannelProtector error', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
