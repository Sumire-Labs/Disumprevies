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
import {
  buildSettingsEmbed,
  makeBackRow,
  makeToggleButton,
  makeButtonId,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Raid settings page
// ---------------------------------------------------------------------------

export async function handleRaidSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildRaidSettingsPage(guildId);
  await interaction.update(page);
}

async function buildRaidSettingsPage(guildId: string): Promise<{
  embeds: ReturnType<typeof buildSettingsEmbed>[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const { raid, raidMode } = settings;

  const [
    title,
    fieldEnabled,
    fieldThreshold,
    fieldWindow,
    fieldAutoDisable,
    fieldAutoActivate,
    fieldSeverity,
    btnSetThreshold,
    btnSetWindow,
    btnSetAutoDisable,
    btnEnabled,
    btnDisabled,
  ] = await Promise.all([
    t(guildId, 'settings.raid.title'),
    t(guildId, 'settings.field.enabled'),
    t(guildId, 'settings.field.threshold'),
    t(guildId, 'settings.field.window'),
    t(guildId, 'settings.raid.field.autoDisable'),
    t(guildId, 'settings.raid.field.autoActivate'),
    t(guildId, 'settings.raid.field.severity'),
    t(guildId, 'settings.button.setThreshold'),
    t(guildId, 'settings.button.setWindow'),
    t(guildId, 'settings.raid.button.setAutoDisable'),
    t(guildId, 'settings.button.enabled'),
    t(guildId, 'settings.button.disabled'),
  ]);

  const embed = buildSettingsEmbed(title, [
    {
      name: fieldEnabled,
      value: raid.enabled ? btnEnabled : btnDisabled,
      inline: true,
    },
    {
      name: fieldThreshold,
      value: `${raid.threshold} members`,
      inline: true,
    },
    {
      name: fieldWindow,
      value: `${raid.windowSeconds}s`,
      inline: true,
    },
    {
      name: fieldAutoDisable,
      value:
        raidMode.autoDisableMinutes > 0
          ? `${raidMode.autoDisableMinutes} min`
          : 'Manual only',
      inline: true,
    },
    {
      name: fieldAutoActivate,
      value: raidMode.autoActivate ? btnEnabled : btnDisabled,
      inline: true,
    },
    {
      name: fieldSeverity,
      value: raidMode.autoActivateSeverity.toUpperCase(),
      inline: true,
    },
  ]);

  const toggleBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'toggle'))
    .setLabel(raid.enabled ? btnEnabled : btnDisabled)
    .setStyle(raid.enabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const thresholdBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'threshold'))
    .setLabel(btnSetThreshold)
    .setStyle(ButtonStyle.Secondary);

  const windowBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'window'))
    .setLabel(btnSetWindow)
    .setStyle(ButtonStyle.Secondary);

  const autoDisableBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'auto_disable'))
    .setLabel(btnSetAutoDisable)
    .setStyle(ButtonStyle.Secondary);

  const autoActivateBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'auto_activate'))
    .setLabel(raidMode.autoActivate ? btnEnabled : btnDisabled)
    .setStyle(raidMode.autoActivate ? ButtonStyle.Success : ButtonStyle.Danger);

  const backRow = await makeBackRow(guildId);
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, thresholdBtn, windowBtn);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(autoDisableBtn, autoActivateBtn);

  return { embeds: [embed], components: [row1, row2, backRow] };
}

// ---------------------------------------------------------------------------
// Button handlers
// ---------------------------------------------------------------------------

export async function handleRaidToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raid: { ...s.raid, enabled: !s.raid.enabled },
  }));

  const page = await buildRaidSettingsPage(guildId);
  await interaction.update(page);
}

export async function handleRaidAutoActivateToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raidMode: { ...s.raidMode, autoActivate: !s.raidMode.autoActivate },
  }));

  const page = await buildRaidSettingsPage(guildId);
  await interaction.update(page);
}

export async function showRaidThresholdModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const [title, label] = await Promise.all([
    t(guildId, 'settings.modal.threshold.title'),
    t(guildId, 'settings.raid.modal.threshold.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'threshold_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4),
      ),
    );

  await interaction.showModal(modal);
}

export async function showRaidWindowModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const [title, label] = await Promise.all([
    t(guildId, 'settings.modal.window.title'),
    t(guildId, 'settings.modal.window.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'window_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4),
      ),
    );

  await interaction.showModal(modal);
}

export async function showRaidAutoDisableModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const [title, label] = await Promise.all([
    t(guildId, 'settings.raid.modal.autoDisable.title'),
    t(guildId, 'settings.raid.modal.autoDisable.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'raid', 'auto_disable_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4),
      ),
    );

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Modal submit handlers
// ---------------------------------------------------------------------------

export async function handleRaidThresholdSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value');
  const val = parseInt(raw, 10);
  if (!Number.isInteger(val) || val < 1) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raid: { ...s.raid, threshold: val },
  }));

  const page = await buildRaidSettingsPage(guildId);
  await updateReply(interaction, page);
}

export async function handleRaidWindowSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value');
  const val = parseInt(raw, 10);
  if (!Number.isInteger(val) || val < 1 || val > 3600) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raid: { ...s.raid, windowSeconds: val },
  }));

  const page = await buildRaidSettingsPage(guildId);
  await updateReply(interaction, page);
}

export async function handleRaidAutoDisableSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value');
  const val = parseInt(raw, 10);
  if (!Number.isInteger(val) || val < 0) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    raidMode: { ...s.raidMode, autoDisableMinutes: val },
  }));

  const page = await buildRaidSettingsPage(guildId);
  await updateReply(interaction, page);
}
