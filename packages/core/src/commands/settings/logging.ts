import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  type ChannelSelectMenuInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../../db.js';
import { t } from '../../i18n/index.js';
import { buildSettingsEmbed, makeBackRow, makeButtonId } from './_helpers.js';

// ---------------------------------------------------------------------------
// Build log settings page
// ---------------------------------------------------------------------------

export async function handleLogSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildLogPage(guildId);
  await interaction.update(page);
}

export async function buildLogPage(guildId: string): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ChannelSelectMenuBuilder | import('discord.js').ButtonBuilder>[];
}> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { logChannel: true, modChannel: true },
  });

  const title = await t(guildId, 'settings.log.title');
  const labelLog = await t(guildId, 'settings.log.field.logChannel');
  const labelMod = await t(guildId, 'settings.log.field.modChannel');

  const logVal = guild?.logChannel ? `<#${guild.logChannel}>` : await t(guildId, 'settings.log.notSet');
  const modVal = guild?.modChannel ? `<#${guild.modChannel}>` : await t(guildId, 'settings.log.notSet');

  const embed = buildSettingsEmbed(title, [
    { name: labelLog, value: logVal, inline: true },
    { name: labelMod, value: modVal, inline: true },
  ]);

  // Channel select for log channel
  const logSelectPlaceholder = await t(guildId, 'settings.log.select.logChannel');
  const logSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'log', 'log_channel'))
    .setPlaceholder(logSelectPlaceholder)
    .addChannelTypes(ChannelType.GuildText);

  // Channel select for mod channel
  const modSelectPlaceholder = await t(guildId, 'settings.log.select.modChannel');
  const modSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'log', 'mod_channel'))
    .setPlaceholder(modSelectPlaceholder)
    .addChannelTypes(ChannelType.GuildText);

  const row1 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(logSelect);
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(modSelect);
  const backRow = await makeBackRow(guildId);

  type AnyRow = ActionRowBuilder<ChannelSelectMenuBuilder | import('discord.js').ButtonBuilder>;

  return {
    embeds: [embed],
    components: [row1 as AnyRow, row2 as AnyRow, backRow as AnyRow],
  };
}

// ---------------------------------------------------------------------------
// Handle log channel select
// ---------------------------------------------------------------------------

export async function handleLogChannelSelect(
  interaction: ChannelSelectMenuInteraction,
  field: 'log_channel' | 'mod_channel',
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const channelId = interaction.values[0] ?? null;

  if (field === 'log_channel') {
    await prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, ...(channelId !== null ? { logChannel: channelId } : {}) },
      update: { ...(channelId !== null ? { logChannel: channelId } : { logChannel: null }) },
    });
  } else {
    await prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, ...(channelId !== null ? { modChannel: channelId } : {}) },
      update: { ...(channelId !== null ? { modChannel: channelId } : { modChannel: null }) },
    });
  }

  const page = await buildLogPage(guildId);
  await interaction.update(page);
}
