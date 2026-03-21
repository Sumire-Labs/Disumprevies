/**
 * Guild command registration script.
 *
 * Usage:
 *   # Dry run (prints commands but does not call Discord API)
 *   node --import tsx/esm src/commands/deploy.ts --dry-run [GUILD_ID]
 *
 *   # Live registration to a specific guild (fast — instant update)
 *   node --import tsx/esm src/commands/deploy.ts GUILD_ID
 *
 *   # Live registration as global commands (takes up to 1 hour to propagate)
 *   node --import tsx/esm src/commands/deploy.ts --global
 *
 * Environment variables required: DISCORD_TOKEN, DISCORD_CLIENT_ID
 */

import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadCommands, getAllCommands } from './index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isGlobal = args.includes('--global');
  const guildId = args.find((a) => !a.startsWith('--'));

  await loadCommands();
  const commands = getAllCommands().map((c) => c.data);

  console.log(`\n📋 Commands to register (${commands.length}):`);
  for (const cmd of commands) {
    console.log(`  /${cmd.name} — ${cmd.description}`);
  }

  if (isDryRun) {
    console.log('\n✅ Dry run complete — no API calls made.');
    return;
  }

  // Only require env vars when actually calling the API
  const token = process.env['DISCORD_TOKEN'];
  const clientId = process.env['DISCORD_CLIENT_ID'];
  if (!token || !clientId) {
    console.error('\n❌ DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in .env');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  if (isGlobal) {
    console.log('\n🌐 Registering as global commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Global commands registered (may take up to 1 hour to propagate).');
    return;
  }

  if (!guildId) {
    console.error('\n❌ Usage: deploy.ts [--dry-run] <GUILD_ID> | --global');
    process.exit(1);
  }

  console.log(`\n🏠 Registering guild commands for guild: ${guildId}...`);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });
  console.log(`✅ Guild commands registered for ${guildId}.`);
}

main().catch((err: unknown) => {
  console.error('❌ Deploy failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
