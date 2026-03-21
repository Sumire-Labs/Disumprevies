import type { Client, GuildBan } from 'discord.js';
import { logger } from '../logger/index.js';
import { runModAbuseHandler } from '../modabuse/modAbuseRegistry.js';

export async function handleGuildBanAdd(ban: GuildBan, client: Client): Promise<void> {
  const guildId = ban.guild.id;

  await runModAbuseHandler(guildId, 'ban', client).catch((err: unknown) => {
    logger.error('guildBanAdd: ModAbuseDetector error', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
