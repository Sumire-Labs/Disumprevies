import type { Client, Role } from 'discord.js';
import { logger } from '../logger/index.js';
import { runChannelProtectorHandler } from '../channel/channelProtectorRegistry.js';

export async function handleRoleCreate(role: Role, client: Client): Promise<void> {
  const guildId = role.guild.id;

  await runChannelProtectorHandler(guildId, 'roleCreate', client).catch((err: unknown) => {
    logger.error('roleCreate: ChannelProtector error', {
      guildId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
