/**
 * /settings → Appeal System (Premium)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { t } from '../../i18n/index.js';
import { checkFeatureAccess, Feature } from '../../gates/index.js';
import { getGuildSettings, updateGuildSettings } from '../../settings/cache.js';
import {
  buildPremiumUpsellEmbed,
  buildSettingsEmbed,
  makeBackRow,
  makeButtonId,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Entry point from main settings menu
// ---------------------------------------------------------------------------

export async function handleAppealSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const hasAccess = await checkFeatureAccess(guildId, Feature.AppealSystem);
  if (!hasAccess) {
    const embed = await buildPremiumUpsellEmbed(guildId);
    const backRow = await makeBackRow(guildId);
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  const page = await buildAppealsPage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Build the appeals settings page
// ---------------------------------------------------------------------------

async function buildAppealsPage(guildId: string): Promise<{
  embeds: ReturnType<typeof buildSettingsEmbed>[];
  components: ActionRowBuilder<ButtonBuilder | ChannelSelectMenuBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const cfg = settings.appeals;

  const [
    title,
    fieldEnabled,
    fieldCooldown,
    fieldChannel,
    btnEnabled,
    btnDisabled,
    btnSetCooldown,
    btnSetChannel,
    notSet,
  ] = await Promise.all([
    t(guildId, 'settings.appeals.title'),
    t(guildId, 'settings.field.enabled'),
    t(guildId, 'settings.appeals.field.cooldown'),
    t(guildId, 'settings.appeals.field.channel'),
    t(guildId, 'settings.button.enabled'),
    t(guildId, 'settings.button.disabled'),
    t(guildId, 'settings.appeals.button.setCooldown'),
    t(guildId, 'settings.appeals.button.setChannel'),
    t(guildId, 'settings.log.notSet'),
  ]);

  const embed = buildSettingsEmbed(title, [
    { name: fieldEnabled, value: cfg.enabled ? btnEnabled : btnDisabled, inline: true },
    { name: fieldCooldown, value: `${cfg.cooldownHours}h`, inline: true },
    { name: fieldChannel, value: cfg.appealChannel !== null ? `<#${cfg.appealChannel}>` : notSet, inline: true },
  ]);

  const toggleBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'appeals', 'toggle'))
    .setLabel(cfg.enabled ? btnEnabled : btnDisabled)
    .setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const cooldownBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'appeals', 'cooldown'))
    .setLabel(btnSetCooldown)
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, cooldownBtn);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'appeals', 'channel_select'))
    .setPlaceholder(btnSetChannel)
    .addChannelTypes(ChannelType.GuildText);

  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
  const backRow = await makeBackRow(guildId);

  return { embeds: [embed], components: [row1, row2, backRow] };
}

// ---------------------------------------------------------------------------
// Toggle enabled
// ---------------------------------------------------------------------------

export async function handleAppealsToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    appeals: { ...s.appeals, enabled: !s.appeals.enabled },
  }));

  const page = await buildAppealsPage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Cooldown modal
// ---------------------------------------------------------------------------

export async function showAppealsCooldownModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);

  const [title, label] = await Promise.all([
    t(guildId, 'settings.appeals.modal.cooldown.title'),
    t(guildId, 'settings.appeals.modal.cooldown.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'appeals', 'cooldown_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setValue(String(settings.appeals.cooldownHours))
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleAppealsCooldownSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const val = parseInt(raw, 10);

  if (!Number.isInteger(val) || val < 0 || val > 8_760) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    appeals: { ...s.appeals, cooldownHours: val },
  }));

  const page = await buildAppealsPage(guildId);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Appeal channel select
// ---------------------------------------------------------------------------

export async function handleAppealsChannelSelect(
  interaction: ChannelSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const channelId = interaction.values[0] ?? null;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    appeals: { ...s.appeals, appealChannel: channelId },
  }));

  const page = await buildAppealsPage(guildId);
  await interaction.update(page);
}
