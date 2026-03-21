/**
 * Factory helpers that build the UI for detector settings pages.
 * Each detector page follows the same pattern:
 *   - Embed showing current ON/OFF + numeric threshold(s)
 *   - Toggle button
 *   - "Set threshold" button → modal
 *   - "Back" button
 *
 * Handlers are generated at module level for each detector to stay DRY.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { t } from '../../i18n/index.js';
import { getGuildSettings, updateGuildSettings } from '../../settings/cache.js';
import type { DetectorConfig, GuildSettings } from '../../settings/types.js';
import {
  buildSettingsEmbed,
  makeBackRow,
  makeButtonId,
  makeToggleButton,
  showMainMenu,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Keys for the detector subset of GuildSettings
// (excludes wordFilter / punishments)
// ---------------------------------------------------------------------------

export type SimpleDetectorKey = 'spam' | 'duplicate' | 'mention' | 'link' | 'invite';

// ---------------------------------------------------------------------------
// Config shape used by the factory (window is optional)
// ---------------------------------------------------------------------------

interface DetectorUIConfig {
  key: SimpleDetectorKey;
  /** i18n key prefix, e.g. "settings.spam" */
  i18nPrefix: string;
  /** Whether this detector has a windowSeconds field */
  hasWindow: boolean;
}

// ---------------------------------------------------------------------------
// Build the category embed + buttons
// ---------------------------------------------------------------------------

export async function buildDetectorPage(
  guildId: string,
  cfg: DetectorUIConfig,
): Promise<{
  embeds: ReturnType<typeof buildSettingsEmbed>[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const detector = settings[cfg.key] as DetectorConfig & { windowSeconds?: number };

  const title = await t(guildId, `${cfg.i18nPrefix}.title`);
  const labelEnabled = await t(guildId, 'settings.field.enabled');
  const labelThreshold = await t(guildId, 'settings.field.threshold');
  const labelWindow = cfg.hasWindow ? await t(guildId, 'settings.field.window') : '';
  const statusLabel = detector.enabled
    ? await t(guildId, 'settings.button.enabled')
    : await t(guildId, 'settings.button.disabled');

  const fields = [
    { name: labelEnabled, value: statusLabel, inline: true },
    { name: labelThreshold, value: String(detector.threshold), inline: true },
    ...(cfg.hasWindow && detector.windowSeconds !== undefined
      ? [{ name: labelWindow, value: `${detector.windowSeconds}s`, inline: true }]
      : []),
  ];

  const embed = buildSettingsEmbed(title, fields);

  // Row 1: toggle + set threshold + (optional) set window
  const toggleBtn = await makeToggleButton(
    guildId,
    makeButtonId('settings', cfg.key, 'toggle'),
    detector.enabled,
  );

  const thresholdBtnLabel = await t(guildId, 'settings.button.setThreshold');
  const thresholdBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', cfg.key, 'threshold'))
    .setLabel(thresholdBtnLabel)
    .setStyle(ButtonStyle.Primary);

  const row1Buttons: ButtonBuilder[] = [toggleBtn, thresholdBtn];

  if (cfg.hasWindow) {
    const windowBtnLabel = await t(guildId, 'settings.button.setWindow');
    const windowBtn = new ButtonBuilder()
      .setCustomId(makeButtonId('settings', cfg.key, 'window'))
      .setLabel(windowBtnLabel)
      .setStyle(ButtonStyle.Primary);
    row1Buttons.push(windowBtn);
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row1Buttons);
  const backRow = await makeBackRow(guildId);

  return { embeds: [embed], components: [row1, backRow] };
}

// ---------------------------------------------------------------------------
// Handle toggle
// ---------------------------------------------------------------------------

export async function handleDetectorToggle(
  interaction: ButtonInteraction,
  key: SimpleDetectorKey,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const updated = await updateGuildSettings(guildId, (s) => ({
    ...s,
    [key]: { ...s[key], enabled: !(s[key] as DetectorConfig).enabled },
  }));

  const uiCfg = DETECTOR_UI_CONFIGS[key];
  if (uiCfg === undefined) return;

  const page = await buildDetectorPage(guildId, uiCfg);
  const successMsg = (s: GuildSettings) =>
    ((s[key] as DetectorConfig).enabled
      ? t(guildId, 'settings.toast.enabled')
      : t(guildId, 'settings.toast.disabled'));
  void updated; // used only for side effects
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Show threshold modal
// ---------------------------------------------------------------------------

export async function showThresholdModal(
  interaction: ButtonInteraction,
  key: SimpleDetectorKey,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);
  const current = (settings[key] as DetectorConfig).threshold;

  const title = await t(guildId, 'settings.modal.threshold.title');
  const label = await t(guildId, 'settings.modal.threshold.label');

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', key, 'threshold_submit'))
    .setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setValue(String(current))
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Submit threshold modal
// ---------------------------------------------------------------------------

export async function handleThresholdSubmit(
  interaction: ModalSubmitInteraction,
  key: SimpleDetectorKey,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const value = parseInt(raw, 10);

  if (!Number.isInteger(value) || value < 1 || value > 9999) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    [key]: { ...s[key], threshold: value },
  }));

  const uiCfg = DETECTOR_UI_CONFIGS[key];
  if (uiCfg === undefined) return;

  const page = await buildDetectorPage(guildId, uiCfg);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Show window modal
// ---------------------------------------------------------------------------

export async function showWindowModal(
  interaction: ButtonInteraction,
  key: SimpleDetectorKey,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);
  const current = (settings[key] as DetectorConfig & { windowSeconds?: number }).windowSeconds ?? 5;

  const title = await t(guildId, 'settings.modal.window.title');
  const label = await t(guildId, 'settings.modal.window.label');

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', key, 'window_submit'))
    .setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setValue(String(current))
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Submit window modal
// ---------------------------------------------------------------------------

export async function handleWindowSubmit(
  interaction: ModalSubmitInteraction,
  key: SimpleDetectorKey,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const value = parseInt(raw, 10);

  if (!Number.isInteger(value) || value < 1 || value > 3600) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    [key]: { ...s[key], windowSeconds: value },
  }));

  const uiCfg = DETECTOR_UI_CONFIGS[key];
  if (uiCfg === undefined) return;

  const page = await buildDetectorPage(guildId, uiCfg);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Detector UI config registry
// ---------------------------------------------------------------------------

export const DETECTOR_UI_CONFIGS: Record<SimpleDetectorKey, DetectorUIConfig> = {
  spam: { key: 'spam', i18nPrefix: 'settings.spam', hasWindow: true },
  duplicate: { key: 'duplicate', i18nPrefix: 'settings.duplicate', hasWindow: false },
  mention: { key: 'mention', i18nPrefix: 'settings.mention', hasWindow: false },
  link: { key: 'link', i18nPrefix: 'settings.link', hasWindow: true },
  invite: { key: 'invite', i18nPrefix: 'settings.invite', hasWindow: false },
};

// ---------------------------------------------------------------------------
// Re-export showMainMenu for convenience
// ---------------------------------------------------------------------------

export { showMainMenu };
