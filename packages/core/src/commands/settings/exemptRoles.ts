import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  RoleSelectMenuBuilder,
  type ButtonInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../../db.js';
import { t } from '../../i18n/index.js';
import { FREE_LIMITS } from '../../settings/types.js';
import {
  buildPremiumUpsellEmbed,
  buildSettingsEmbed,
  makeBackRow,
  makeButtonId,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Build exempt roles page
// ---------------------------------------------------------------------------

export async function handleExemptRoleSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildExemptRolePage(guildId);
  await interaction.update(page);
}

export async function buildExemptRolePage(guildId: string): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | RoleSelectMenuBuilder>[];
}> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { exemptRoles: true, plan: true },
  });

  const exemptRoles = guild?.exemptRoles ?? [];
  const isPremium = guild?.plan === 'PREMIUM';
  const limit = FREE_LIMITS.exemptRoles;
  const atLimit = !isPremium && exemptRoles.length >= limit;

  const title = await t(guildId, 'settings.exemptRoles.title');
  const labelRoles = await t(guildId, 'settings.exemptRoles.field.roles');
  const labelLimit = await t(guildId, 'settings.exemptRoles.field.limit');

  const roleList =
    exemptRoles.length > 0
      ? exemptRoles.map((id) => `<@&${id}>`).join('\n')
      : await t(guildId, 'settings.exemptRoles.noRoles');

  const embed = buildSettingsEmbed(title, [
    { name: labelRoles, value: roleList },
    { name: labelLimit, value: isPremium ? '∞' : `${exemptRoles.length}/${limit}`, inline: true },
  ]);

  const embeds: EmbedBuilder[] = [embed];
  if (atLimit) {
    embeds.push(await buildPremiumUpsellEmbed(guildId));
  }

  // Add role select
  const addPlaceholder = await t(guildId, 'settings.exemptRoles.select.add');
  const addSelect = new RoleSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'exemptRoles', 'add'))
    .setPlaceholder(addPlaceholder)
    .setDisabled(atLimit);

  const addRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(addSelect);

  const components: ActionRowBuilder<ButtonBuilder | RoleSelectMenuBuilder>[] = [
    addRow as ActionRowBuilder<ButtonBuilder | RoleSelectMenuBuilder>,
  ];

  // Delete button (only if there are roles)
  if (exemptRoles.length > 0) {
    const deleteBtnLabel = await t(guildId, 'settings.exemptRoles.button.delete');
    const deleteBtn = new ButtonBuilder()
      .setCustomId(makeButtonId('settings', 'exemptRoles', 'delete_menu'))
      .setLabel(deleteBtnLabel)
      .setStyle(ButtonStyle.Danger);
    const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteBtn);
    components.push(btnRow as ActionRowBuilder<ButtonBuilder | RoleSelectMenuBuilder>);
  }

  const backRow = await makeBackRow(guildId);
  components.push(backRow as ActionRowBuilder<ButtonBuilder | RoleSelectMenuBuilder>);

  return { embeds, components };
}

// ---------------------------------------------------------------------------
// Add role
// ---------------------------------------------------------------------------

export async function handleExemptRoleAdd(
  interaction: RoleSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { exemptRoles: true, plan: true },
  });

  const isPremium = guild?.plan === 'PREMIUM';
  const current = guild?.exemptRoles ?? [];

  if (!isPremium && current.length >= FREE_LIMITS.exemptRoles) {
    const upsell = await buildPremiumUpsellEmbed(guildId);
    await interaction.reply({ embeds: [upsell], ephemeral: true });
    return;
  }

  const roleId = interaction.values[0];
  if (roleId === undefined) return;

  if (!current.includes(roleId)) {
    await prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId, exemptRoles: [roleId] },
      update: { exemptRoles: { push: roleId } },
    });
  }

  const page = await buildExemptRolePage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Show delete menu (role select to remove)
// ---------------------------------------------------------------------------

export async function handleExemptRoleDeleteMenu(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { exemptRoles: true },
  });

  const current = guild?.exemptRoles ?? [];
  if (current.length === 0) {
    const page = await buildExemptRolePage(guildId);
    await interaction.update(page);
    return;
  }

  const title = await t(guildId, 'settings.exemptRoles.delete.title');
  const placeholder = await t(guildId, 'settings.exemptRoles.delete.placeholder');

  const embed = new EmbedBuilder().setTitle(title).setColor(0xff6600);

  const select = new RoleSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'exemptRoles', 'delete_select'))
    .setPlaceholder(placeholder);

  const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select);

  const backBtnLabel = await t(guildId, 'settings.button.back');
  const backBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'exemptRoles', 'back_main'))
    .setLabel(backBtnLabel)
    .setStyle(ButtonStyle.Secondary);

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);

  type AnyRow = ActionRowBuilder<ButtonBuilder | RoleSelectMenuBuilder>;
  await interaction.update({
    embeds: [embed],
    components: [row as AnyRow, backRow as AnyRow],
  });
}

// ---------------------------------------------------------------------------
// Handle delete select
// ---------------------------------------------------------------------------

export async function handleExemptRoleDeleteSelect(
  interaction: RoleSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const roleId = interaction.values[0];
  if (roleId === undefined) return;

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { exemptRoles: true },
  });

  const updated = (guild?.exemptRoles ?? []).filter((id) => id !== roleId);

  await prisma.guild.update({
    where: { id: guildId },
    data: { exemptRoles: updated },
  });

  const page = await buildExemptRolePage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Back from delete view to main exempt roles page
// ---------------------------------------------------------------------------

export async function handleExemptRoleBackMain(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildExemptRolePage(guildId);
  await interaction.update(page);
}
