import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config.js';
import { logger } from './logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info('Bot is ready', { tag: readyClient.user.tag });
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error', { error: error.message });
});

async function main(): Promise<void> {
  await client.login(config.discordToken);
}

main().catch((err: unknown) => {
  logger.error('Fatal error during startup', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
