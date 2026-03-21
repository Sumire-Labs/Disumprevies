import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { t } from '../../i18n/index.js';
import { getGuildSettings, updateGuildSettings } from '../../settings/cache.js';
import { checkFeatureAccess, Feature } from '../../gates/index.js';
import {
  buildSettingsEmbed,
  buildPremiumUpsellEmbed,
  makeBackRow,
  makeButtonId,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Channel Protection settings page (Premium)
// ---------------------------------------------------------------------------

export async function handleChannelProtectionSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const hasAccess = await checkFeatureAccess(guildId, Feature.ChannelProtection);
  if (!hasAccess) {
    const embed = await buildPremiumUpsellEmbed(guildId);
    const backRow = await makeBackRow(guildId);
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  const page = await buildChannelProtectionPage(guildId);
  await interaction.update(page);
}

async function buildChannelProtectionPage(guildId: string): Promise<{
  embeds: ReturnType<typeof buildSettingsEmbed>[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const cfg = settings.channelProtection;

  const [
    title,
    fieldEnabled,
    fieldThreshold,
    fieldWindow,
    btnEnabled,
    btnDisabled,
    btnSetThreshold,
    btnSetWindow,
  ] = await Promise.all([
    t(guildId, 'settings.channelProtection.title'),
    t(guildId, 'settings.field.enabled'),
    t(guildId, 'settings.field.threshold'),
    t(guildId, 'settings.field.window'),
    t(guildId, 'settings.button.enabled'),
    t(guildId, 'settings.button.disabled'),
    t(guildId, 'settings.button.setThreshold'),
    t(guildId, 'settings.button.setWindow'),
  ]);

  const embed = buildSettingsEmbed(title, [
    { name: fieldEnabled, value: cfg.enabled ? btnEnabled : btnDisabled, inline: true },
    { name: fieldThreshold, value: `${cfg.threshold} events`, inline: true },
    { name: fieldWindow, value: `${cfg.windowSeconds}s`, inline: true },
  ]);

  const toggleBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'channelProtection', 'toggle'))
    .setLabel(cfg.enabled ? btnEnabled : btnDisabled)
    .setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const thresholdBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'channelProtection', 'threshold'))
    .setLabel(btnSetThreshold)
    .setStyle(ButtonStyle.Secondary);

  const windowBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'channelProtection', 'window'))
    .setLabel(btnSetWindow)
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, thresholdBtn, windowBtn);
  const backRow = await makeBackRow(guildId);

  return { embeds: [embed], components: [row1, backRow] };
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export async function handleChannelProtectionToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    channelProtection: { ...s.channelProtection, enabled: !s.channelProtection.enabled },
  }));

  const page = await buildChannelProtectionPage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Threshold modal
// ---------------------------------------------------------------------------

export async function showChannelProtectionThresholdModal(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);

  const [title, label] = await Promise.all([
    t(guildId, 'settings.modal.threshold.title'),
    t(guildId, 'settings.modal.threshold.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'channelProtection', 'threshold_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setValue(String(settings.channelProtection.threshold))
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleChannelProtectionThresholdSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const val = parseInt(raw, 10);

  if (!Number.isInteger(val) || val < 1 || val > 9999) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    channelProtection: { ...s.channelProtection, threshold: val },
  }));

  const page = await buildChannelProtectionPage(guildId);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Window modal
// ---------------------------------------------------------------------------

export async function showChannelProtectionWindowModal(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);

  const [title, label] = await Promise.all([
    t(guildId, 'settings.modal.window.title'),
    t(guildId, 'settings.modal.window.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'channelProtection', 'window_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setValue(String(settings.channelProtection.windowSeconds))
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleChannelProtectionWindowSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const val = parseInt(raw, 10);

  if (!Number.isInteger(val) || val < 1 || val > 3600) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    channelProtection: { ...s.channelProtection, windowSeconds: val },
  }));

  const page = await buildChannelProtectionPage(guildId);
  await updateReply(interaction, page);
}
