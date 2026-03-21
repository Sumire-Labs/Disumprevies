import { Client, Events } from 'discord.js';
import { GatewayIntentBits } from 'discord.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger/index.js';
import { handleMessageCreate } from '../events/messageCreate.js';
import { registerCommandHandler } from '../commands/index.js';
import { guildConfigCache } from '../utils/GuildConfigCache.js';
import { actionQueue } from '../utils/ActionQueue.js';
import { clearSpamStateForGuild } from '../detectors/spam.js';
import { clearDuplicateStateForGuild } from '../detectors/duplicate.js';
import { clearLinkStateForGuild } from '../detectors/link.js';
import { clearRaidStateForGuild } from '../detectors/raidBasic.js';
import { clearRaidModeStateForGuild } from '../raid/raidMode.js';
import { handleGuildMemberAdd } from '../events/guildMemberAdd.js';
import { handleChannelCreate } from '../events/channelCreate.js';
import { handleChannelDelete } from '../events/channelDelete.js';
import { handleRoleCreate } from '../events/roleCreate.js';
import { handleRoleDelete } from '../events/roleDelete.js';
import { handleGuildBanAdd } from '../events/guildBanAdd.js';
import { handleGuildMemberRemove } from '../events/guildMemberRemove.js';
import {
  startHealthServer,
  stopHealthServer,
  setHealthReady,
  setHealthGuildCount,
} from '../health.js';
import { registerRaidAnalyzer } from '../raid/raidAnalyzerRegistry.js';
import { registerChannelProtectorHandler } from '../channel/channelProtectorRegistry.js';
import { registerModAbuseHandler } from '../modabuse/modAbuseRegistry.js';
import { registerChannelOverrideResolver } from '../channel/channelOverrideRegistry.js';
import { registerAppealDmRowProvider } from '../actions/appealDmRegistry.js';
import { registerAppealInteractionHandlers } from '../actions/appealInteractionRegistry.js';

// ---------------------------------------------------------------------------
// Bot client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

client.once(Events.ClientReady, async (readyClient) => {
  const startTime = Date.now();
  logger.info('Bot is ready', { tag: readyClient.user.tag });

  // Warm the GuildConfigCache for all currently-joined guilds so the first
  // message in each guild is served from cache rather than triggering a DB hit.
  const guildIds = [...readyClient.guilds.cache.keys()];
  const BATCH_SIZE = 50;

  if (guildIds.length > 100) {
    // Large bot: load in batches to avoid flooding the DB connection pool.
    logger.info('Preloading guild configs in batches', {
      guilds: guildIds.length,
      batchSize: BATCH_SIZE,
    });
    for (let i = 0; i < guildIds.length; i += BATCH_SIZE) {
      await guildConfigCache.preload(guildIds.slice(i, i + BATCH_SIZE));
    }
  } else {
    await guildConfigCache.preload(guildIds);
  }

  setHealthReady(true);
  setHealthGuildCount(guildIds.length);

  logger.info('Startup complete', {
    guilds: guildIds.length,
    startupMs: Date.now() - startTime,
  });
});

client.on(Events.MessageCreate, handleMessageCreate);

client.on(Events.GuildMemberAdd, (member) => {
  handleGuildMemberAdd(member, client).catch((err: unknown) => {
    logger.error('Unhandled error in guildMemberAdd handler', {
      guildId: member.guild.id,
      userId: member.user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.GuildMemberRemove, (member) => {
  handleGuildMemberRemove(member, client).catch((err: unknown) => {
    logger.error('Unhandled error in guildMemberRemove handler', {
      guildId: member.guild.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.GuildBanAdd, (ban) => {
  handleGuildBanAdd(ban, client).catch((err: unknown) => {
    logger.error('Unhandled error in guildBanAdd handler', {
      guildId: ban.guild.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.ChannelCreate, (channel) => {
  if (!channel.guild) return;
  handleChannelCreate(channel, client).catch((err: unknown) => {
    logger.error('Unhandled error in channelCreate handler', {
      guildId: channel.guild.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.ChannelDelete, (channel) => {
  if (!('guild' in channel) || channel.guild === null) return;
  handleChannelDelete(channel, client).catch((err: unknown) => {
    logger.error('Unhandled error in channelDelete handler', {
      guildId: (channel as { guild: { id: string } }).guild.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.GuildRoleCreate, (role) => {
  handleRoleCreate(role, client).catch((err: unknown) => {
    logger.error('Unhandled error in roleCreate handler', {
      guildId: role.guild.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.GuildRoleDelete, (role) => {
  handleRoleDelete(role, client).catch((err: unknown) => {
    logger.error('Unhandled error in roleDelete handler', {
      guildId: role.guild.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

client.on(Events.Error, (error) => {
  logger.error('Discord client error', { error: error.message });
});

// ---------------------------------------------------------------------------
// Guild removal — clear all in-memory data for the departed guild
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Guild join — log and update health guild count
// ---------------------------------------------------------------------------

client.on(Events.GuildCreate, (guild) => {
  setHealthGuildCount(client.guilds.cache.size);
  logger.info('Guild joined', {
    module: 'bot',
    guildId: guild.id,
    guildName: guild.name,
    memberCount: guild.memberCount,
  });
});

client.on(Events.GuildDelete, (guild) => {
  const guildId = guild.id;

  // Evict config and word-filter caches.
  guildConfigCache.invalidate(guildId);

  // Evict per-user detector state so we don't accumulate stale entries.
  clearSpamStateForGuild(guildId);
  clearDuplicateStateForGuild(guildId);
  clearLinkStateForGuild(guildId);
  clearRaidStateForGuild(guildId);
  clearRaidModeStateForGuild(guildId);

  setHealthGuildCount(client.guilds.cache.size);

  logger.info('Guild removed — cleared in-memory state', { guildId });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutdown initiated', { signal });

  // Mark bot as not ready so health checks start returning 503.
  setHealthReady(false);

  // Drain the ActionQueue (wait up to 5s for pending moderation actions).
  logger.info('Draining action queue...');
  await actionQueue.drain(5_000);
  actionQueue.stop();

  // Destroy the Discord client (closes the WebSocket connection).
  logger.info('Destroying Discord client...');
  client.destroy();

  // Stop the health check server.
  await stopHealthServer();

  // Disconnect Prisma.
  logger.info('Disconnecting from database...');
  await prisma.$disconnect();

  logger.info('Shutdown complete');
  process.exit(0);
}

function handleSignal(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  // Hard timeout: force-exit after 30 seconds if graceful shutdown stalls.
  const forceExitTimer = setTimeout(() => {
    logger.error('Shutdown timed out after 30s — forcing exit');
    process.exit(1);
  }, 30_000);
  // Unref so the timer doesn't prevent normal exit if shutdown completes first.
  forceExitTimer.unref();

  shutdown(signal).catch((err: unknown) => {
    logger.error('Error during shutdown', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}

process.on('SIGTERM', () => { handleSignal('SIGTERM'); });
process.on('SIGINT',  () => { handleSignal('SIGINT'); });

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Start health server early so orchestrators can distinguish "starting" from
  // "crashed" (the bot is not ready yet, so /health returns 503 until login).
  startHealthServer();

  // Ensure Prisma connection is healthy before connecting to Discord
  await prisma.$connect();
  logger.info('Database connected');

  // Load the premium package if available.
  // We pass the registry functions imported from *local* relative paths so that
  // premium writes to the exact same module instances the pipeline reads from.
  // This prevents the pnpm virtual-store dual-module problem in Docker: if premium
  // resolved @disumprevies/core through .pnpm/ symlinks it would get a separate
  // module instance with its own (empty) resolver variable.
  try {
    // @ts-ignore — premium package is optional; dist may not exist when core is compiled
    const premium = await import('@disumprevies/premium') as {
      registerPremiumFeatures: (r: {
        registerRaidAnalyzer: typeof registerRaidAnalyzer;
        registerChannelProtectorHandler: typeof registerChannelProtectorHandler;
        registerModAbuseHandler: typeof registerModAbuseHandler;
        registerChannelOverrideResolver: typeof registerChannelOverrideResolver;
        registerAppealDmRowProvider: typeof registerAppealDmRowProvider;
        registerAppealInteractionHandlers: typeof registerAppealInteractionHandlers;
      }) => void;
    };
    premium.registerPremiumFeatures({
      registerRaidAnalyzer,
      registerChannelProtectorHandler,
      registerModAbuseHandler,
      registerChannelOverrideResolver,
      registerAppealDmRowProvider,
      registerAppealInteractionHandlers,
    });
    logger.info('Premium features loaded');
  } catch (err) {
    // Only treat ERR_MODULE_NOT_FOUND as expected (open-source deployments without premium).
    // Any other error means the package IS installed but failed to initialise — log as error
    // so operators can diagnose the problem (e.g. a missing build, a stale dist, etc.).
    const code =
      err instanceof Error && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    const isNotFound =
      code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
    if (isNotFound) {
      logger.info('Premium package not available — running without premium features');
    } else {
      logger.error('Premium package failed to initialise — channel overrides and other premium features are disabled', {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof Error && err.stack !== undefined ? { stack: err.stack } : {}),
      });
    }
  }

  // Register slash command handler (loads all command modules)
  await registerCommandHandler(client);

  await client.login(config.discordToken);
}

main().catch((err: unknown) => {
  logger.error('Fatal error during startup', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
