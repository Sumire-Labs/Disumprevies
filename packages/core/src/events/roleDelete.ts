import type { Client, Role } from 'discord.js';
import { logger } from '../logger/index.js';
import { runChannelProtectorHandler } from '../channel/channelProtectorRegistry.js';

export async function handleRoleDelete(role: Role, client: Client): Promise<void> {
  const guildId = role.guild.id;

  await runChannelProtectorHandler(guildId, 'roleDelete', client).catch((err: unknown) => {
    logger.error('roleDelete: ChannelProtector error', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
