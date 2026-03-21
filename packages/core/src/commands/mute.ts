import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';
import { t } from '../i18n/index.js';
import {
  requirePermission,
  canModerate,
  sendDm,
  getLogChannel,
  createInfraction,
  sendLogEmbed,
} from './_helpers.js';
import { registerCommand } from './index.js';

// ---------------------------------------------------------------------------
// Duration choices
// ---------------------------------------------------------------------------

const DURATION_CHOICES = [
  { name: '1 minute', value: '1m' },
  { name: '5 minutes', value: '5m' },
  { name: '10 minutes', value: '10m' },
  { name: '1 hour', value: '1h' },
  { name: '1 day', value: '1d' },
  { name: '7 days', value: '7d' },
] as const;

type DurationValue = (typeof DURATION_CHOICES)[number]['value'];

function parseDuration(value: DurationValue): { ms: number; label: string } {
  const table: Record<DurationValue, { ms: number; label: string }> = {
    '1m': { ms: 60_000, label: '1 minute' },
    '5m': { ms: 5 * 60_000, label: '5 minutes' },
    '10m': { ms: 10 * 60_000, label: '10 minutes' },
    '1h': { ms: 60 * 60_000, label: '1 hour' },
    '1d': { ms: 24 * 60 * 60_000, label: '1 day' },
    '7d': { ms: 7 * 24 * 60 * 60_000, label: '7 days' },
  };
  return table[value];
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

registerCommand({
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute (timeout) a member')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to mute').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('Mute duration')
        .setRequired(true)
        .addChoices(...DURATION_CHOICES),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the mute').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || interaction.guild === null) return;

    const allowed = await requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
    if (!allowed) return;

    const targetUser = interaction.options.getUser('user', true);
    const durationRaw = interaction.options.getString('duration', true) as DurationValue;
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const guildId = interaction.guildId;

    const targetMember = interaction.guild.members.cache.get(targetUser.id)
      ?? await interaction.guild.members.fetch(targetUser.id).catch(() => undefined);

    if (targetMember === undefined) {
      const msg = await t(guildId, 'command.error.memberNotFound');
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    const moderatable = await canModerate(interaction, targetMember as GuildMember);
    if (!moderatable) return;

    const { ms, label: durationLabel } = parseDuration(durationRaw);
    const muteDurationMinutes = Math.round(ms / 60_000);

    // DM before muting (member will lose ability to read DMs in locked channels)
    const dmText = await t(guildId, 'command.mute.dm', {
      guildName: interaction.guild.name,
      duration: durationLabel,
      reason,
    });
    await sendDm(targetMember as GuildMember, dmText);

    // Apply timeout
    await (targetMember as GuildMember).disableCommunicationUntil(Date.now() + ms, reason);

    // Record infraction
    await createInfraction({
      guildId,
      userId: targetUser.id,
      type: 'MUTE',
      reason,
      moderatorId: interaction.user.id,
      muteDurationMinutes,
    });

    // Reply to moderator
    const successText = await t(guildId, 'command.mute.success', {
      tag: targetUser.tag,
      duration: durationLabel,
      reason,
    });
    await interaction.reply({ content: successText, ephemeral: true });

    // Log to log channel
    const logChannel = await getLogChannel(interaction.guild);
    if (logChannel !== undefined) {
      const logText = await t(guildId, 'command.log.mute', {
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        duration: durationLabel,
        reason,
      });
      await sendLogEmbed({ channel: logChannel, type: 'MUTE', description: logText });
    }
  },
});
