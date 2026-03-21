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
import type { ModEventType } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModAbuseConfig {
  enabled: boolean;
  threshold: number;
  windowSeconds: number;
}

// ---------------------------------------------------------------------------
// State — per moderator (guildId:executorId) → timestamps of actions
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 600_000; // 10 minutes
const MAX_ENTRIES = 10_000;

/** Key format: `guildId:executorId` */
const banMap  = new TimedMap<string, number[]>({ ttlMs: ENTRY_TTL_MS, maxSize: MAX_ENTRIES });
const kickMap = new TimedMap<string, number[]>({ ttlMs: ENTRY_TTL_MS, maxSize: MAX_ENTRIES });

banMap.startAutoCleanup(CLEANUP_INTERVAL_MS);
kickMap.startAutoCleanup(CLEANUP_INTERVAL_MS);

function getMapForEvent(eventType: ModEventType): TimedMap<string, number[]> {
  return eventType === 'ban' ? banMap : kickMap;
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

function parseConfig(raw: unknown): ModAbuseConfig {
  const defaults: ModAbuseConfig = { enabled: true, threshold: 5, windowSeconds: 60 };
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
    logger.error('ModAbuseDetector: failed to send notification', {
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
    if (role.id === guild.id) continue;
    if (!role.editable) continue;

    const hasAny = permissions.some((p) => role.permissions.has(p));
    if (!hasAny) continue;

    let newPerms = role.permissions;
    for (const p of permissions) {
      newPerms = newPerms.remove(p);
    }

    try {
      await role.setPermissions(newPerms, 'ModAbuseDetector: automatic permission strip');
      logger.info('ModAbuseDetector: stripped permissions from role', {
        guildId,
        roleId: role.id,
        roleName: role.name,
      });
    } catch (err) {
      logger.warn('ModAbuseDetector: failed to strip permissions from role', {
        guildId,
        roleId: role.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// ModAbuseDetector (Premium)
// ---------------------------------------------------------------------------

export class ModAbuseDetector {
  readonly name = 'mod-abuse';

  /** Bot's own user ID — set on first use to filter out auto-actions. */
  private botUserId: string | null = null;

  async handle(guildId: string, eventType: ModEventType, client: Client): Promise<void> {
    const hasAccess = await checkFeatureAccess(guildId, Feature.ModAbuseDetection);
    if (!hasAccess) return;

    const guild = client.guilds.cache.get(guildId);
    if (guild === undefined) return;

    // Resolve bot user ID (cache it after first lookup)
    if (this.botUserId === null) {
      this.botUserId = client.user?.id ?? null;
    }

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

    const cfg = parseConfig(rawSettings['modAbuse']);
    if (!cfg.enabled) return;

    // Fetch the executor from audit log
    const executor = await this.fetchExecutor(guild, eventType);
    if (executor === null) return;

    // Skip bot's own actions (from auto-punishment pipeline)
    if (executor.id === this.botUserId || executor.bot) return;

    const now = Date.now();
    const windowMs = cfg.windowSeconds * 1000;
    const key = `${guildId}:${executor.id}`;

    const stateMap = getMapForEvent(eventType);
    const timestamps = stateMap.get(key) ?? [];
    timestamps.push(now);
    stateMap.set(key, timestamps);

    const inWindow = timestamps.filter((ts) => now - ts <= windowMs);

    if (inWindow.length < cfg.threshold) return;

    // Threshold exceeded — clear to prevent repeated triggering
    stateMap.set(key, []);

    logger.warn('ModAbuseDetector: threshold exceeded', {
      guildId,
      executorId: executor.id,
      eventType,
      count: inWindow.length,
      threshold: cfg.threshold,
      windowSeconds: cfg.windowSeconds,
    });

    // Fetch executor as GuildMember for permission stripping
    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
    if (executorMember !== null) {
      const dangerousPerms = eventType === 'ban'
        ? [PermissionFlagsBits.BanMembers]
        : [PermissionFlagsBits.KickMembers];
      await stripPermissions(guild, executorMember, dangerousPerms, guildId);
    }

    // Notify guild owner via DM
    await this.notifyOwner(guild, executor.id, eventType, inWindow.length, cfg.threshold, cfg.windowSeconds);

    // Notify log + mod channels
    await this.sendNotification(
      client,
      guildId,
      executor.id,
      eventType,
      inWindow.length,
      cfg.threshold,
      cfg.windowSeconds,
    );
  }

  private async fetchExecutor(guild: Guild, eventType: ModEventType): Promise<{ id: string; bot: boolean } | null> {
    try {
      const auditLogType = eventType === 'ban'
        ? AuditLogEvent.MemberBanAdd
        : AuditLogEvent.MemberKick;

      const logs = await guild.fetchAuditLogs({ limit: 1, type: auditLogType });
      const entry = logs.entries.first();
      if (entry === undefined || entry.executor === null) return null;

      return { id: entry.executor.id, bot: entry.executor.bot };
    } catch (err) {
      logger.warn('ModAbuseDetector: failed to fetch audit log', {
        guildId: guild.id,
        eventType,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async notifyOwner(
    guild: Guild,
    executorId: string,
    eventType: ModEventType,
    count: number,
    threshold: number,
    windowSeconds: number,
  ): Promise<void> {
    try {
      const owner = await guild.fetchOwner();
      const actionWord = eventType === 'ban' ? 'banned' : 'kicked';
      await owner.user.send(
        `🚨 **[${guild.name}] Moderator Abuse Detected**\n` +
        `Moderator <@${executorId}> has ${actionWord} **${count}** users within ${windowSeconds}s ` +
        `(threshold: ${threshold}). Their dangerous permissions have been stripped. ` +
        `Please review the situation immediately.`,
      );
    } catch {
      // Owner DMs may be disabled — not a fatal error
    }
  }

  private async sendNotification(
    client: Client,
    guildId: string,
    executorId: string,
    eventType: ModEventType,
    count: number,
    threshold: number,
    windowSeconds: number,
  ): Promise<void> {
    const { logChannelId, modChannelId } = await getChannelIds(guildId);
    const actionWord = eventType === 'ban' ? 'bans' : 'kicks';
    const permStripped = eventType === 'ban' ? 'BAN_MEMBERS' : 'KICK_MEMBERS';

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🚨 Moderator Abuse Detected')
      .addFields(
        { name: 'Moderator', value: `<@${executorId}> (\`${executorId}\`)`, inline: true },
        { name: 'Action', value: actionWord.toUpperCase(), inline: true },
        { name: 'Count', value: `${count} in ${windowSeconds}s`, inline: true },
        { name: 'Threshold', value: String(threshold), inline: true },
        { name: 'Permission Stripped', value: permStripped, inline: true },
      )
      .setTimestamp();

    const logChannel = resolveTextChannel(client, logChannelId);
    if (logChannel !== null) {
      await safelySend(logChannel, { embeds: [embed] });
    }

    const modChannel = resolveTextChannel(client, modChannelId);
    if (modChannel !== null && (logChannel === null || modChannel.id !== logChannel.id)) {
      await safelySend(modChannel, {
        content: `🚨 <@${executorId}> performed **${count}** ${actionWord} within ${windowSeconds}s (threshold: ${threshold}). **${permStripped}** permission has been stripped.`,
        allowedMentions: { users: [executorId] },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// State cleanup (called on GuildDelete)
// ---------------------------------------------------------------------------

export function clearModAbuseStateForGuild(guildId: string): void {
  banMap.deleteWhere((k) => k.startsWith(`${guildId}:`));
  kickMap.deleteWhere((k) => k.startsWith(`${guildId}:`));
}
