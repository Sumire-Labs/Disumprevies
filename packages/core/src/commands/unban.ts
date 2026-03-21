import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { t } from '../i18n/index.js';
import { requirePermission, getLogChannel, sendLogEmbed } from './_helpers.js';
import { registerCommand } from './index.js';

registerCommand({
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .addStringOption((opt) =>
      opt.setName('user_id').setDescription('The user ID to unban').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the unban').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || interaction.guild === null) return;

    const allowed = await requirePermission(interaction, PermissionFlagsBits.BanMembers);
    if (!allowed) return;

    const userId = interaction.options.getString('user_id', true).trim();
    const guildId = interaction.guildId;

    // Validate ID looks like a snowflake
    if (!/^\d{17,20}$/.test(userId)) {
      const msg = await t(guildId, 'command.error.userNotFound');
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    // Check if user is actually banned
    const banEntry = await interaction.guild.bans.fetch(userId).catch(() => undefined);
    if (banEntry === undefined) {
      const msg = await t(guildId, 'command.unban.notBanned');
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    await interaction.guild.bans.remove(userId);

    const successText = await t(guildId, 'command.unban.success', { userId });
    await interaction.reply({ content: successText, ephemeral: true });

    // Log to log channel
    const logChannel = await getLogChannel(interaction.guild);
    if (logChannel !== undefined) {
      const logText = await t(guildId, 'command.log.unban', {
        userId,
        moderatorId: interaction.user.id,
      });
      await sendLogEmbed({ channel: logChannel, type: 'UNBAN', description: logText });
    }
  },
});
