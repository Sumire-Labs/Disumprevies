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
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The member to kick').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for the kick').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild() || interaction.guild === null) return;

    const allowed = await requirePermission(interaction, PermissionFlagsBits.KickMembers);
    if (!allowed) return;

    const targetUser = interaction.options.getUser('user', true);
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

    // DM before kick (member loses server access after)
    const dmText = await t(guildId, 'command.kick.dm', {
      guildName: interaction.guild.name,
      reason,
    });
    await sendDm(targetMember as GuildMember, dmText);

    // Kick
    await (targetMember as GuildMember).kick(reason);

    // Record infraction
    await createInfraction({
      guildId,
      userId: targetUser.id,
      type: 'KICK',
      reason,
      moderatorId: interaction.user.id,
    });

    // Reply to moderator
    const successText = await t(guildId, 'command.kick.success', {
      tag: targetUser.tag,
      reason,
    });
    await interaction.reply({ content: successText, ephemeral: true });

    // Log to log channel
    const logChannel = await getLogChannel(interaction.guild);
    if (logChannel !== undefined) {
      const logText = await t(guildId, 'command.log.kick', {
        userId: targetUser.id,
        moderatorId: interaction.user.id,
        reason,
      });
      await sendLogEmbed({ channel: logChannel, type: 'KICK', description: logText });
    }
  },
});
