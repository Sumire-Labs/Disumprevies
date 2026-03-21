import {
  AuditLogEvent,
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import {
  checkFeatureAccess,
  Feature,
  logger,
  prisma,
  TimedMap,
} from '@disumprevies/core';
import type { ChannelEventType } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelProtectionConfig {
  enabled: boolean;
  threshold: number;
  windowSeconds: number;
}

// ---------------------------------------------------------------------------
// State — per-guild timestamp arrays for each event type
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 300_000; // 5 minutes
const MAX_GUILDS = 5_000;

const channelCreateMap = new TimedMap<string, number[]>({ ttlMs: ENTRY_TTL_MS, maxSize: MAX_GUILDS });
const channelDeleteMap = new TimedMap<string, number[]>({ ttlMs: ENTRY_TTL_MS, maxSize: MAX_GUILDS });
const roleCreateMap    = new TimedMap<string, number[]>({ ttlMs: ENTRY_TTL_MS, maxSize: MAX_GUILDS });
const roleDeleteMap    = new TimedMap<string, number[]>({ ttlMs: ENTRY_TTL_MS, maxSize: MAX_GUILDS });

channelCreateMap.startAutoCleanup(CLEANUP_INTERVAL_MS);
channelDeleteMap.startAutoCleanup(CLEANUP_INTERVAL_MS);
roleCreateMap.startAutoCleanup(CLEANUP_INTERVAL_MS);
roleDeleteMap.startAutoCleanup(CLEANUP_INTERVAL_MS);

function getMapForEvent(eventType: ChannelEventType): TimedMap<string, number[]> {
  switch (eventType) {
    case 'channelCreate': return channelCreateMap;
    case 'channelDelete': return channelDeleteMap;
    case 'roleCreate':    return roleCreateMap;
    case 'roleDelete':    return roleDeleteMap;
  }
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

function parseConfig(raw: unknown): ChannelProtectionConfig {
  const defaults: ChannelProtectionConfig = { enabled: true, threshold: 5, windowSeconds: 10 };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaults;

  const obj = raw as Record<string, unknown>;
  return {
    enabled: typeof obj['enabled'] === 'boolean' ? obj['enabled'] : defaults.enabled,
    threshold:
      typeof obj['threshold'] === 'number' && obj['threshold'] > 0
        ? obj['threshold']
        : defaults.threshold,
    windowSeconds:
      typeof obj['windowSeconds'] === 'number' && obj['windowSeconds'] > 0
        ? obj['windowSeconds']
        : defaults.windowSeconds,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTextChannel(client: Client, channelId: string | null): TextChannel | null {
  if (channelId === null) return null;
  const ch = client.channels.cache.get(channelId);
  if (ch?.isTextBased() && !ch.isDMBased()) return ch as TextChannel;
  return null;
}

async function safelySend(
  channel: TextChannel,
  options: Parameters<TextChannel['send']>[0],
): Promise<void> {
  try {
    await channel.send(options);
  } catch (err) {
    logger.error('ChannelProtector: failed to send notification', {
      channelId: channel.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function getChannelIds(guildId: string): Promise<{
  logChannelId: string | null;
  modChannelId: string | null;
}> {
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { logChannel: true, modChannel: true },
    });
    return { logChannelId: guild?.logChannel ?? null, modChannelId: guild?.modChannel ?? null };
  } catch {
    return { logChannelId: null, modChannelId: null };
  }
}

/** Strip dangerous permissions from a member's editable roles. */
async function stripPermissions(
  guild: Guild,
  member: GuildMember,
  permissions: bigint[],
  guildId: string,
): Promise<void> {
  for (const role of member.roles.cache.values()) {
    if (role.id === guild.id) continue; // skip @everyone
    if (!role.editable) continue;

    const hasAny = permissions.some((p) => role.permissions.has(p));
    if (!hasAny) continue;

    let newPerms = role.permissions;
    for (const p of permissions) {
      newPerms = newPerms.remove(p);
    }

    try {
      await role.setPermissions(newPerms, 'ChannelProtector: automatic permission strip');
      logger.info('ChannelProtector: stripped permissions from role', {
        guildId,
        roleId: role.id,
        roleName: role.name,
      });
    } catch (err) {
      logger.warn('ChannelProtector: failed to strip permissions from role', {
        guildId,
        roleId: role.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// ChannelProtector (Premium)
// ---------------------------------------------------------------------------

export class ChannelProtector {
  readonly name = 'channel-protector';

  async handle(guildId: string, eventType: ChannelEventType, client: Client): Promise<void> {
    const hasAccess = await checkFeatureAccess(guildId, Feature.ChannelProtection);
    if (!hasAccess) return;

    const guild = client.guilds.cache.get(guildId);
    if (guild === undefined) return;

    // Fetch guild settings from DB
    const guildRow = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { settings: true },
    });

    const rawSettings =
      guildRow?.settings !== null &&
      typeof guildRow?.settings === 'object' &&
      !Array.isArray(guildRow?.settings)
        ? (guildRow.settings as Record<string, unknown>)
        : {};

    const cfg = parseConfig(rawSettings['channelProtection']);
    if (!cfg.enabled) return;

    const now = Date.now();
    const windowMs = cfg.windowSeconds * 1000;

    // Record this event timestamp
    const stateMap = getMapForEvent(eventType);
    const timestamps = stateMap.get(guildId) ?? [];
    timestamps.push(now);
    stateMap.set(guildId, timestamps);

    // Filter to the current window
    const inWindow = timestamps.filter((ts) => now - ts <= windowMs);

    if (inWindow.length < cfg.threshold) return;

    // Threshold exceeded — clear to prevent repeated triggering
    stateMap.set(guildId, []);

    logger.warn('ChannelProtector: threshold exceeded', {
      guildId,
      eventType,
      count: inWindow.length,
      threshold: cfg.threshold,
      windowSeconds: cfg.windowSeconds,
    });

    // Look up executor from audit log
    const executor = await this.fetchExecutor(guild, eventType);

    // Strip permissions from executor (if found and not the bot itself)
    if (executor !== null && !executor.user.bot) {
      const dangerousPerms = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles];
      await stripPermissions(guild, executor, dangerousPerms, guildId);
    }

    // Notify channels
    await this.sendNotification(
      client,
      guildId,
      eventType,
      inWindow.length,
      cfg.threshold,
      cfg.windowSeconds,
      executor?.user.id ?? null,
    );
  }

  private async fetchExecutor(
    guild: Guild,
    eventType: ChannelEventType,
  ): Promise<GuildMember | null> {
    try {
      const auditLogType = this.auditLogEventType(eventType);
      const logs = await guild.fetchAuditLogs({ limit: 1, type: auditLogType });
      const entry = logs.entries.first();
      if (entry === undefined || entry.executor === null) return null;
      return guild.members.fetch(entry.executor.id).catch(() => null);
    } catch (err) {
      logger.warn('ChannelProtector: failed to fetch audit log', {
        guildId: guild.id,
        eventType,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private auditLogEventType(eventType: ChannelEventType): AuditLogEvent {
    switch (eventType) {
      case 'channelCreate': return AuditLogEvent.ChannelCreate;
      case 'channelDelete': return AuditLogEvent.ChannelDelete;
      case 'roleCreate':    return AuditLogEvent.RoleCreate;
      case 'roleDelete':    return AuditLogEvent.RoleDelete;
    }
  }

  private async sendNotification(
    client: Client,
    guildId: string,
    eventType: ChannelEventType,
    count: number,
    threshold: number,
    windowSeconds: number,
    executorId: string | null,
  ): Promise<void> {
    const { logChannelId, modChannelId } = await getChannelIds(guildId);
    const actionLabel = this.eventTypeLabel(eventType);

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🛡️ Channel/Role Protection Triggered')
      .addFields(
        { name: 'Event', value: actionLabel, inline: true },
        { name: 'Count', value: `${count} in ${windowSeconds}s`, inline: true },
        { name: 'Threshold', value: String(threshold), inline: true },
        {
          name: 'Suspected Executor',
          value: executorId !== null ? `<@${executorId}> (\`${executorId}\`)` : 'Unknown',
          inline: true,
        },
        { name: 'Action Taken', value: 'Dangerous permissions stripped', inline: true },
      )
      .setTimestamp();

    const logChannel = resolveTextChannel(client, logChannelId);
    if (logChannel !== null) {
      await safelySend(logChannel, { embeds: [embed] });
    }

    const modChannel = resolveTextChannel(client, modChannelId);
    if (modChannel !== null && (logChannel === null || modChannel.id !== logChannel.id)) {
      const mention = executorId !== null ? `<@${executorId}> ` : '';
      await safelySend(modChannel, {
        content: `🚨 **Channel/Role Protection**: ${mention}performed **${count}** ${actionLabel.toLowerCase()} operations within ${windowSeconds}s (threshold: ${threshold}). Dangerous permissions have been stripped.`,
        allowedMentions: executorId !== null ? { users: [executorId] } : { parse: [] },
      });
    }
  }

  private eventTypeLabel(eventType: ChannelEventType): string {
    switch (eventType) {
      case 'channelCreate': return 'Channel Create';
      case 'channelDelete': return 'Channel Delete';
      case 'roleCreate':    return 'Role Create';
      case 'roleDelete':    return 'Role Delete';
    }
  }
}

// ---------------------------------------------------------------------------
// State cleanup (called on GuildDelete)
// ---------------------------------------------------------------------------

export function clearChannelProtectorStateForGuild(guildId: string): void {
  channelCreateMap.delete(guildId);
  channelDeleteMap.delete(guildId);
  roleCreateMap.delete(guildId);
  roleDeleteMap.delete(guildId);
}
