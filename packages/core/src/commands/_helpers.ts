import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import type { InfractionType } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger/index.js';
import { t } from '../i18n/index.js';

// ---------------------------------------------------------------------------
// Embed color map (matches logger/index.ts)
// ---------------------------------------------------------------------------

const EMBED_COLORS: Record<InfractionType | 'UNMUTE' | 'UNBAN', number> = {
  WARN: 0xffa500,
  MUTE: 0xffff00,
  UNMUTE: 0x00cc88,
  KICK: 0xff6600,
  BAN: 0xff0000,
  UNBAN: 0x5865f2,
};

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

/**
 * Reply with a localised permission-error message and return false.
 * Returns true if the caller may proceed.
 */
export async function requirePermission(
  interaction: ChatInputCommandInteraction,
  flag: bigint,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;

  const member = interaction.member as GuildMember;
  if (!member.permissions.has(flag)) {
    const guildId = interaction.guildId ?? '';
    const msg = await t(guildId, 'command.error.missingPermissions');
    await interaction.reply({ content: msg, ephemeral: true });
    return false;
  }
  return true;
}

/**
 * Check whether the executor can moderate the target (hierarchy check).
 */
export async function canModerate(
  interaction: ChatInputCommandInteraction,
  target: GuildMember,
): Promise<boolean> {
  const me = interaction.guild?.members.me;
  const executor = interaction.member as GuildMember;

  const guildId = interaction.guildId ?? '';

  // Bot cannot moderate
  if (me !== undefined && me !== null && !me.roles.highest.comparePositionTo(target.roles.highest)) {
    const msg = await t(guildId, 'command.error.botMissingPermissions');
    await interaction.reply({ content: msg, ephemeral: true });
    return false;
  }

  // Executor cannot moderate someone equal or higher in role hierarchy
  if (executor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    const msg = await t(guildId, 'command.error.cannotModerate');
    await interaction.reply({ content: msg, ephemeral: true });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// DM sender
// ---------------------------------------------------------------------------

export async function sendDm(member: GuildMember, text: string): Promise<void> {
  try {
    await member.send(text);
  } catch {
    // DMs disabled — not fatal
  }
}

// ---------------------------------------------------------------------------
// Log channel helper
// ---------------------------------------------------------------------------

export async function getLogChannel(guild: Guild): Promise<TextChannel | undefined> {
  const guildRecord = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { logChannel: true },
  });
  const logChannelId = guildRecord?.logChannel;
  if (!logChannelId) return undefined;

  const channel = guild.channels.cache.get(logChannelId);
  if (!channel?.isTextBased()) return undefined;
  return channel as TextChannel;
}

// ---------------------------------------------------------------------------
// Infraction creator
// ---------------------------------------------------------------------------

export async function createInfraction(opts: {
  guildId: string;
  userId: string;
  type: InfractionType;
  reason: string;
  moderatorId: string;
  muteDurationMinutes?: number;
}): Promise<void> {
  const expiresAt =
    opts.type === 'MUTE' && opts.muteDurationMinutes !== undefined
      ? new Date(Date.now() + opts.muteDurationMinutes * 60 * 1000)
      : undefined;

  await prisma.infraction.create({
    data: {
      guildId: opts.guildId,
      userId: opts.userId,
      type: opts.type,
      reason: opts.reason,
      moderator: opts.moderatorId,
      auto: false,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Log embed sender
// ---------------------------------------------------------------------------

export async function sendLogEmbed(opts: {
  channel: TextChannel;
  type: InfractionType | 'UNMUTE' | 'UNBAN';
  description: string;
}): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS[opts.type])
    .setDescription(opts.description)
    .setTimestamp();

  try {
    await opts.channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('Failed to send log embed', {
      channelId: opts.channel.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
