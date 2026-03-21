import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
  makeButtonId,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Account Age Filter settings page
// ---------------------------------------------------------------------------

export async function handleAccountAgeSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildAccountAgePage(guildId);
  await interaction.update(page);
}

async function buildAccountAgePage(guildId: string): Promise<{
  embeds: ReturnType<typeof buildSettingsEmbed>[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const cfg = settings.accountAge;

  const [
    title,
    fieldEnabled,
    fieldMinDays,
    fieldAction,
    btnEnabled,
    btnDisabled,
    btnSetMinDays,
    btnSetAction,
    actionLabel,
  ] = await Promise.all([
    t(guildId, 'settings.accountAge.title'),
    t(guildId, 'settings.field.enabled'),
    t(guildId, 'settings.accountAge.field.minDays'),
    t(guildId, 'settings.accountAge.field.action'),
    t(guildId, 'settings.button.enabled'),
    t(guildId, 'settings.button.disabled'),
    t(guildId, 'settings.accountAge.button.setMinDays'),
    t(guildId, 'settings.accountAge.button.setAction'),
    t(guildId, `settings.accountAge.action.${cfg.action}`),
  ]);

  const embed = buildSettingsEmbed(title, [
    { name: fieldEnabled, value: cfg.enabled ? btnEnabled : btnDisabled, inline: true },
    { name: fieldMinDays, value: `${cfg.minDays} day(s)`, inline: true },
    { name: fieldAction, value: actionLabel, inline: true },
  ]);

  const toggleBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'accountAge', 'toggle'))
    .setLabel(cfg.enabled ? btnEnabled : btnDisabled)
    .setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const minDaysBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'accountAge', 'minDays'))
    .setLabel(btnSetMinDays)
    .setStyle(ButtonStyle.Secondary);

  const actionBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'accountAge', 'action'))
    .setLabel(btnSetAction)
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(toggleBtn, minDaysBtn, actionBtn);
  const backRow = await makeBackRow(guildId);

  return { embeds: [embed], components: [row1, backRow] };
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

export async function handleAccountAgeToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    accountAge: { ...s.accountAge, enabled: !s.accountAge.enabled },
  }));

  const page = await buildAccountAgePage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Min Days modal
// ---------------------------------------------------------------------------

export async function showAccountAgeMinDaysModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);

  const [title, label] = await Promise.all([
    t(guildId, 'settings.accountAge.modal.minDays.title'),
    t(guildId, 'settings.accountAge.modal.minDays.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'accountAge', 'minDays_submit'))
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setValue(String(settings.accountAge.minDays))
          .setMinLength(1)
          .setMaxLength(4)
          .setRequired(true),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleAccountAgeMinDaysSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const val = parseInt(raw, 10);

  if (!Number.isInteger(val) || val < 1 || val > 3650) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    accountAge: { ...s.accountAge, minDays: val },
  }));

  const page = await buildAccountAgePage(guildId);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Action select menu
// ---------------------------------------------------------------------------

export async function showAccountAgeActionMenu(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const [title, labelNotify, labelKick, labelBan, labelMute, placeholder, fieldName, fieldValue] = await Promise.all([
    t(guildId, 'settings.accountAge.title'),
    t(guildId, 'settings.accountAge.action.notify'),
    t(guildId, 'settings.accountAge.action.kick'),
    t(guildId, 'settings.accountAge.action.ban'),
    t(guildId, 'settings.accountAge.action.mute'),
    t(guildId, 'settings.accountAge.select.placeholder'),
    t(guildId, 'settings.accountAge.actionSelect.name'),
    t(guildId, 'settings.accountAge.actionSelect.value'),
  ]);

  const select = new StringSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'accountAge', 'action_select'))
    .setPlaceholder(placeholder)
    .addOptions(
      new StringSelectMenuOptionBuilder().setValue('notify').setLabel(labelNotify),
      new StringSelectMenuOptionBuilder().setValue('kick').setLabel(labelKick),
      new StringSelectMenuOptionBuilder().setValue('ban').setLabel(labelBan),
      new StringSelectMenuOptionBuilder().setValue('mute').setLabel(labelMute),
    );

  const embed = buildSettingsEmbed(title, [
    { name: fieldName, value: fieldValue },
  ]);

  const backRow = await makeBackRow(guildId);
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.update({ embeds: [embed], components: [row, backRow] });
}

export async function handleAccountAgeActionSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const value = interaction.values[0];
  if (value !== 'notify' && value !== 'kick' && value !== 'ban' && value !== 'mute') {
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    accountAge: { ...s.accountAge, action: value },
  }));

  const page = await buildAccountAgePage(guildId);
  await interaction.update(page);
}
