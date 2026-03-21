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

registerCommand({
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to ban').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the ban').setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('delete_days')
        .setDescription('Number of days of messages to delete (0–7, default: 0)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || interaction.guild === null) return;

    const allowed = await requirePermission(interaction, PermissionFlagsBits.BanMembers);
    if (!allowed) return;

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
    const guildId = interaction.guildId;

    // Member might not be in the guild (banning by user lookup)
    const targetMember = interaction.guild.members.cache.get(targetUser.id)
      ?? await interaction.guild.members.fetch(targetUser.id).catch(() => undefined);

    if (targetMember !== undefined) {
      const moderatable = await canModerate(interaction, targetMember as GuildMember);
      if (!moderatable) return;

      // DM before ban
      const dmText = await t(guildId, 'command.ban.dm', {
        guildName: interaction.guild.name,
        reason,
      });
      await sendDm(targetMember as GuildMember, dmText);
    }

    // Ban (delete_message_seconds = days * 86400)
    await interaction.guild.bans.create(targetUser.id, {
      reason,
      deleteMessageSeconds: deleteDays * 86_400,
    });

    // Record infraction
    await createInfraction({
      guildId,
      userId: targetUser.id,
      type: 'BAN',
      reason,
      moderatorId: interaction.user.id,
    });

    // Reply to moderator
    const successText = await t(guildId, 'command.ban.success', {
      tag: targetUser.tag,
      reason,
    });
    await interaction.reply({ content: successText, ephemeral: true });

    // Log to log channel
    const logChannel = await getLogChannel(interaction.guild);
    if (logChannel !== undefined) {
      const logText = await t(guildId, 'command.log.ban', {
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        deleteDays: String(deleteDays),
        reason,
      });
      await sendLogEmbed({ channel: logChannel, type: 'BAN', description: logText });
    }
  },
});
