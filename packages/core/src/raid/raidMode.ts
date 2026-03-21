import type { Client, GuildMember, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../logger/index.js';
import { updateGuildSettings, getGuildSettings } from '../settings/cache.js';
import type { RaidResult } from '../detectors/raidBasic.js';

// ---------------------------------------------------------------------------
// In-memory raid mode state (tracks timers to avoid duplicate auto-disable)
// ---------------------------------------------------------------------------

interface ActiveRaidMode {
  timer: ReturnType<typeof setTimeout> | null;
}

const activeRaidModes = new Map<string, ActiveRaidMode>();

// ---------------------------------------------------------------------------
// Embed colors
// ---------------------------------------------------------------------------

const COLOR_RAID_DETECTED = 0xff6600;  // deep orange — raid detected
const COLOR_RAID_ACTIVE = 0xff0000;    // red — raid mode activated
const COLOR_RAID_DEACTIVATED = 0x00aa00; // green — raid mode deactivated

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTextChannel(client: Client, channelId: string | null): TextChannel | null {
  if (channelId === null) return null;
  const ch = client.channels.cache.get(channelId);
  if (ch?.isTextBased() && !ch.isDMBased()) return ch as TextChannel;
  return null;
}

async function safelySend(channel: TextChannel, options: Parameters<TextChannel['send']>[0]): Promise<void> {
  try {
    await channel.send(options);
  } catch (err) {
    logger.error('RaidMode: failed to send channel message', {
      channelId: channel.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a raid-detected notification to the log channel (does NOT activate raid mode).
 * Called by the guildMemberAdd handler for all detection results.
 */
export async function notifyRaidDetected(
  guildId: string,
  result: RaidResult,
  client: Client,
): Promise<void> {
  const settings = await getGuildSettings(guildId);
  const guild = client.guilds.cache.get(guildId);
  if (guild === undefined) return;

  const logChannelId = await getLogChannelId(guildId);
  const logChannel = resolveTextChannel(client, logChannelId);
  const modChannelId = await getModChannelId(guildId);
  const modChannel = resolveTextChannel(client, modChannelId);

  const { t } = await import('../i18n/index.js');
  const severityLabel = await t(guildId, `raid.severity.${result.severity}`);
  const [
    embedTitle,
    fieldDetector,
    fieldSeverity,
    fieldJoins,
    fieldJoinsValue,
  ] = await Promise.all([
    t(guildId, 'raid.embed.detected.title', { severity: severityLabel }),
    t(guildId, 'raid.embed.field.detector'),
    t(guildId, 'raid.embed.field.severity'),
    t(guildId, 'raid.embed.field.joins'),
    t(guildId, 'raid.embed.field.joinsValue', { joinCount: String(result.joinCount), windowSeconds: String(result.windowSeconds) }),
  ]);

  const embed = new EmbedBuilder()
    .setColor(COLOR_RAID_DETECTED)
    .setTitle(embedTitle)
    .addFields(
      { name: fieldDetector, value: result.detectorName, inline: true },
      { name: fieldSeverity, value: severityLabel, inline: true },
      { name: fieldJoins, value: fieldJoinsValue, inline: true },
    )
    .setTimestamp();

  if (logChannel !== null) {
    await safelySend(logChannel, { embeds: [embed] });
  }

  if (modChannel !== null && (logChannel === null || modChannel.id !== logChannel.id)) {
    const memberList = result.members
      .slice(0, 10)
      .map((m) => `<@${m.user.id}>`)
      .join(', ');
    const extraCount = result.members.length > 10 ? result.members.length - 10 : 0;
    const extraStr = extraCount > 0 ? await t(guildId, 'raid.mod.detected.more', { count: String(extraCount) }) : '';
    const modMsg = await t(guildId, 'raid.mod.detected', { severity: severityLabel, members: memberList + extraStr });
    await safelySend(modChannel, {
      content: modMsg,
      allowedMentions: { parse: [] },
    });
  }

  logger.warn('Raid detected', {
    guildId,
    severity: result.severity,
    joinCount: result.joinCount,
    windowSeconds: result.windowSeconds,
  });
}

/**
 * Activate raid mode for a guild.
 * - Updates Guild.settings.raidMode in DB and cache
 * - Schedules auto-disable timer
 * - Sends log + mod channel notifications
 */
export async function activateRaidMode(
  guildId: string,
  activatedBy: 'auto' | 'manual',
  client: Client,
): Promise<void> {
  const settings = await getGuildSettings(guildId);

  if (settings.raidMode.active) {
    logger.debug('RaidMode: already active, skipping activation', { guildId });
    return;
  }

  const now = new Date().toISOString();
  const autoDisableMinutes = settings.raidMode.autoDisableMinutes;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raidMode: {
      ...s.raidMode,
      active: true,
      activatedAt: now,
      activatedBy,
    },
  }));

  // Schedule auto-disable if configured
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (autoDisableMinutes > 0) {
    timer = setTimeout(() => {
      deactivateRaidMode(guildId, client).catch((err: unknown) => {
        logger.error('RaidMode: auto-disable failed', {
          guildId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, autoDisableMinutes * 60_000);
    timer.unref();
  }

  activeRaidModes.set(guildId, { timer });

  // Notify channels
  const logChannelId = await getLogChannelId(guildId);
  const logChannel = resolveTextChannel(client, logChannelId);
  const modChannelId = await getModChannelId(guildId);
  const modChannel = resolveTextChannel(client, modChannelId);

  const { t } = await import('../i18n/index.js');
  const [
    embedTitle,
    fieldActivatedBy,
    fieldActivatedByValue,
    fieldAutoDisable,
    fieldAutoDisableValue,
    autoDisableMsg,
    modActivatedMsg,
  ] = await Promise.all([
    t(guildId, 'raid.embed.activated.title'),
    t(guildId, 'raid.embed.field.activatedBy'),
    t(guildId, activatedBy === 'auto' ? 'raid.embed.field.activatedByAuto' : 'raid.embed.field.activatedByManual'),
    t(guildId, 'raid.embed.field.autoDisable'),
    autoDisableMinutes > 0
      ? t(guildId, 'raid.embed.field.autoDisableValue', { minutes: String(autoDisableMinutes) })
      : t(guildId, 'raid.embed.field.autoDisableManual'),
    autoDisableMinutes > 0
      ? t(guildId, 'raid.mod.activated.autoDisable', { minutes: String(autoDisableMinutes) })
      : Promise.resolve(''),
    t(guildId, 'raid.mod.activated', { by: activatedBy, extra: '' }),
  ]);

  const embed = new EmbedBuilder()
    .setColor(COLOR_RAID_ACTIVE)
    .setTitle(embedTitle)
    .addFields(
      { name: fieldActivatedBy, value: fieldActivatedByValue, inline: true },
      { name: fieldAutoDisable, value: fieldAutoDisableValue, inline: true },
    )
    .setTimestamp();

  if (logChannel !== null) {
    await safelySend(logChannel, { embeds: [embed] });
  }

  if (modChannel !== null && (logChannel === null || modChannel.id !== logChannel.id)) {
    const content = await t(guildId, 'raid.mod.activated', { by: activatedBy, extra: autoDisableMsg });
    await safelySend(modChannel, {
      content,
      allowedMentions: { parse: [] },
    });
  }

  logger.warn('Raid mode activated', { guildId, activatedBy, autoDisableMinutes });
}

/**
 * Deactivate raid mode for a guild.
 * - Updates Guild.settings.raidMode in DB and cache
 * - Clears auto-disable timer
 * - Sends log + mod channel notifications
 */
export async function deactivateRaidMode(guildId: string, client: Client): Promise<void> {
  const settings = await getGuildSettings(guildId);

  if (!settings.raidMode.active) {
    logger.debug('RaidMode: already inactive, skipping deactivation', { guildId });
    return;
  }

  // Clear timer if running
  const state = activeRaidModes.get(guildId);
  if (state?.timer !== null && state?.timer !== undefined) {
    clearTimeout(state.timer);
  }
  activeRaidModes.delete(guildId);

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raidMode: {
      ...s.raidMode,
      active: false,
      activatedAt: null,
      activatedBy: null,
    },
  }));

  // Notify channels
  const logChannelId = await getLogChannelId(guildId);
  const logChannel = resolveTextChannel(client, logChannelId);
  const modChannelId = await getModChannelId(guildId);
  const modChannel = resolveTextChannel(client, modChannelId);

  const { t } = await import('../i18n/index.js');
  const [deactivatedTitle, deactivatedDesc, modDeactivatedMsg] = await Promise.all([
    t(guildId, 'raid.embed.deactivated.title'),
    t(guildId, 'raid.embed.deactivated.description'),
    t(guildId, 'raid.mod.deactivated'),
  ]);

  const embed = new EmbedBuilder()
    .setColor(COLOR_RAID_DEACTIVATED)
    .setTitle(deactivatedTitle)
    .setDescription(deactivatedDesc)
    .setTimestamp();

  if (logChannel !== null) {
    await safelySend(logChannel, { embeds: [embed] });
  }

  if (modChannel !== null && (logChannel === null || modChannel.id !== logChannel.id)) {
    await safelySend(modChannel, {
      content: modDeactivatedMsg,
      allowedMentions: { parse: [] },
    });
  }

  logger.info('Raid mode deactivated', { guildId });
}

/**
 * Returns true if raid mode is currently active for the guild.
 * Reads from the settings cache (fast, no DB hit unless cache expired).
 */
export async function isRaidModeActive(guildId: string): Promise<boolean> {
  const settings = await getGuildSettings(guildId);
  return settings.raidMode.active;
}

/**
 * Kick a member because raid mode is active.
 */
export async function kickRaidJoiner(member: GuildMember, reason: string): Promise<void> {
  try {
    await member.kick(reason);
    logger.info('RaidMode: kicked joining member', {
      guildId: member.guild.id,
      userId: member.user.id,
    });
  } catch (err) {
    logger.warn('RaidMode: failed to kick joining member', {
      guildId: member.guild.id,
      userId: member.user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Clear all in-memory raid mode state for a guild (called on GuildDelete).
 */
export function clearRaidModeStateForGuild(guildId: string): void {
  const state = activeRaidModes.get(guildId);
  if (state?.timer !== null && state?.timer !== undefined) {
    clearTimeout(state.timer);
  }
  activeRaidModes.delete(guildId);
}

// ---------------------------------------------------------------------------
// Private helpers — fetch channel IDs from DB via settings cache
// ---------------------------------------------------------------------------

async function getLogChannelId(guildId: string): Promise<string | null> {
  try {
    const { prisma } = await import('../db.js');
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { logChannel: true },
    });
    return guild?.logChannel ?? null;
  } catch {
    return null;
  }
}

async function getModChannelId(guildId: string): Promise<string | null> {
  try {
    const { prisma } = await import('../db.js');
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { modChannel: true },
    });
    return guild?.modChannel ?? null;
  } catch {
    return null;
  }
}
