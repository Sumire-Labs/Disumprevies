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
  getLogChannel,
  sendLogEmbed,
} from './_helpers.js';
import { registerCommand } from './index.js';

registerCommand({
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove a timeout (unmute) from a member')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to unmute').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the unmute').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || interaction.guild === null) return;

    const allowed = await requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
    if (!allowed) return;

    const targetUser = interaction.options.getUser('user', true);
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

    // Remove timeout
    await (targetMember as GuildMember).disableCommunicationUntil(null);

    // Reply to moderator
    const successText = await t(guildId, 'command.unmute.success', {
      tag: targetUser.tag,
    });
    await interaction.reply({ content: successText, ephemeral: true });

    // Log to log channel
    const logChannel = await getLogChannel(interaction.guild);
    if (logChannel !== undefined) {
      const logText = await t(guildId, 'command.log.unmute', {
        userId: targetUser.id,
        moderatorId: interaction.user.id,
      });
      await sendLogEmbed({ channel: logChannel, type: 'UNMUTE', description: logText });
    }
  },
});
