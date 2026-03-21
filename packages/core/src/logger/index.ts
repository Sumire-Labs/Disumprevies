import { EmbedBuilder, type TextChannel } from 'discord.js';
import type { InfractionType } from '@prisma/client';
import { t } from '../i18n/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// ---------------------------------------------------------------------------
// LOG_LEVEL filtering
// ---------------------------------------------------------------------------

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function isLevelEnabled(level: LogLevel): boolean {
  const raw = process.env['LOG_LEVEL'] ?? 'info';
  const configured = (LOG_LEVEL_ORDER[raw as LogLevel] !== undefined
    ? (raw as LogLevel)
    : 'info');
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[configured];
}

// ---------------------------------------------------------------------------
// Console logger (structured JSON, one JSON object per line)
//
// Output format:
//   {"timestamp":"…","level":"info","message":"…"[,…context fields…]}
//
// Optional context fields: module, guildId, userId, action, detector, error, …
// ---------------------------------------------------------------------------

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!isLevelEnabled(level)) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context !== undefined ? context : {}),
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
};

// ---------------------------------------------------------------------------
// Discord channel logger
// ---------------------------------------------------------------------------

/** Embed color per infraction type */
const EMBED_COLORS: Record<InfractionType, number> = {
  WARN: 0xffa500, // orange
  MUTE: 0xffff00, // yellow
  KICK: 0xff6600, // deep orange
  BAN: 0xff0000, // red
};

export interface InfractionLogOptions {
  guildId: string;
  channel: TextChannel;
  type: InfractionType;
  userId: string;
  moderatorId?: string;
  reason: string;
  points: number;
  totalPoints: number;
  muteDurationMinutes?: number;
  /** If set, mention this role/user in the mod channel. */
  modChannel?: TextChannel;
  modMentionRoleId?: string;
}

/**
 * Send a structured embed to the guild log channel.
 * If `modChannel` is provided, also pings that channel.
 */
export async function logInfractionToChannel(opts: InfractionLogOptions): Promise<void> {
  const {
    guildId,
    channel,
    type,
    userId,
    moderatorId,
    reason,
    points,
    totalPoints,
    muteDurationMinutes,
    modChannel,
    modMentionRoleId,
  } = opts;

  const [
    titleText,
    fieldUser,
    fieldModerator,
    moderatorValue,
    fieldReason,
    fieldPoints,
    fieldTotalPoints,
  ] = await Promise.all([
    t(guildId, 'log.embed.title', { type }),
    t(guildId, 'log.embed.field.user'),
    t(guildId, 'log.embed.field.moderator'),
    moderatorId !== undefined
      ? Promise.resolve(`<@${moderatorId}>`)
      : t(guildId, 'log.embed.field.moderatorAuto'),
    t(guildId, 'log.embed.field.reason'),
    t(guildId, 'log.embed.field.points'),
    t(guildId, 'log.embed.field.totalPoints'),
  ]);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS[type])
    .setTitle(titleText)
    .addFields(
      { name: fieldUser, value: `<@${userId}> (\`${userId}\`)`, inline: true },
      { name: fieldModerator, value: moderatorValue, inline: true },
      { name: fieldReason, value: reason },
      { name: fieldPoints, value: String(points), inline: true },
      { name: fieldTotalPoints, value: String(Math.round(totalPoints * 100) / 100), inline: true },
    )
    .setTimestamp();

  if (type === 'MUTE' && muteDurationMinutes !== undefined) {
    const fieldDuration = await t(guildId, 'log.embed.field.duration');
    embed.addFields({ name: fieldDuration, value: `${muteDurationMinutes} min`, inline: true });
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to send embed to log channel', {
      channelId: channel.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Mod channel notification — skip if modChannel is the same as the log channel
  // to prevent the same infraction appearing twice (once as embed, once as plain text).
  if (modChannel !== undefined && modChannel.id !== channel.id) {
    const mention = modMentionRoleId !== undefined ? `<@&${modMentionRoleId}> ` : '';
    const notifText = await t(guildId, 'log.embed.modNotification', { type, userId, reason });
    try {
      await modChannel.send({
        content: `${mention}${notifText}`,
        allowedMentions: { roles: modMentionRoleId !== undefined ? [modMentionRoleId] : [] },
      });
    } catch (err) {
      logger.error('Failed to send mod channel notification', {
        channelId: modChannel.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
