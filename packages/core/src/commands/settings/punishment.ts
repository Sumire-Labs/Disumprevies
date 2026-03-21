import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../../db.js';
import { t } from '../../i18n/index.js';
import { getGuildSettings, updateGuildSettings } from '../../settings/cache.js';
import { FREE_LIMITS } from '../../settings/types.js';
import type { ActionThreshold } from '../../settings/types.js';
import {
  buildPremiumUpsellEmbed,
  buildSettingsEmbed,
  makeBackRow,
  makeButtonId,
  showMainMenu,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Build punishment settings page
// ---------------------------------------------------------------------------

export async function handlePunishmentSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildPunishmentPage(guildId);
  await updateReply(interaction, page);
}

async function buildPunishmentPage(guildId: string): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { plan: true },
  });
  const isPremium = guild?.plan === 'PREMIUM';

  const settings = await getGuildSettings(guildId);
  const { thresholds, decayPerHour } = settings.punishments;

  const title = await t(guildId, 'settings.punishment.title');
  const labelDecay = await t(guildId, 'settings.punishment.field.decay');

  const thresholdLines = thresholds
    .map(
      (entry, i) =>
        `**${i + 1}.** ${entry.minPoints} pts → ${entry.action}${
          entry.action === 'MUTE' && entry.muteDurationMinutes !== undefined
            ? ` (${entry.muteDurationMinutes}m)`
            : ''
        }`,
    )
    .join('\n');

  const embed = buildSettingsEmbed(title, [
    { name: await t(guildId, 'settings.punishment.field.thresholds'), value: thresholdLines || '—' },
    { name: labelDecay, value: `${decayPerHour} pts/h`, inline: true },
  ]);

  const embeds: EmbedBuilder[] = [embed];

  const atLimit = !isPremium && thresholds.length >= FREE_LIMITS.punishmentThresholds;
  if (atLimit) {
    embeds.push(await buildPremiumUpsellEmbed(guildId));
  }

  // Row 1: add + edit + decay
  const addLabel = await t(guildId, 'settings.button.add');
  const addBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'punishment', 'add'))
    .setLabel(addLabel)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(atLimit);

  const editLabel = await t(guildId, 'settings.punishment.button.edit');
  const editBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'punishment', 'edit', '0'))
    .setLabel(editLabel)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(thresholds.length === 0);

  const decayLabel = await t(guildId, 'settings.punishment.button.decay');
  const decayBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'punishment', 'decay'))
    .setLabel(decayLabel)
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(addBtn, editBtn, decayBtn);
  const backRow = await makeBackRow(guildId);

  return { embeds, components: [row1, backRow] };
}

// ---------------------------------------------------------------------------
// Show add threshold modal
// ---------------------------------------------------------------------------

export async function showPunishmentAddModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { plan: true },
  });
  const isPremium = guild?.plan === 'PREMIUM';
  const settings = await getGuildSettings(guildId);

  if (!isPremium && settings.punishments.thresholds.length >= FREE_LIMITS.punishmentThresholds) {
    const upsell = await buildPremiumUpsellEmbed(guildId);
    await interaction.reply({ embeds: [upsell], ephemeral: true });
    return;
  }

  const modal = await buildThresholdModal(guildId, 'add', undefined);
  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Show edit threshold modal (index from button id)
// ---------------------------------------------------------------------------

export async function showPunishmentEditModal(
  interaction: ButtonInteraction,
  index: number,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);
  const entry = settings.punishments.thresholds[index];

  const modal = await buildThresholdModal(guildId, `edit_${index}`, entry);
  await interaction.showModal(modal);
}

async function buildThresholdModal(
  guildId: string,
  mode: string,
  existing: ActionThreshold | undefined,
): Promise<ModalBuilder> {
  const title = await t(guildId, 'settings.punishment.modal.title');

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'punishment', `submit_${mode}`))
    .setTitle(title);

  const pointsLabel = await t(guildId, 'settings.punishment.modal.points');
  const pointsInput = new TextInputBuilder()
    .setCustomId('points')
    .setLabel(pointsLabel)
    .setStyle(TextInputStyle.Short)
    .setValue(existing !== undefined ? String(existing.minPoints) : '')
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true);

  const actionLabel = await t(guildId, 'settings.punishment.modal.action');
  const actionInput = new TextInputBuilder()
    .setCustomId('action')
    .setLabel(actionLabel)
    .setStyle(TextInputStyle.Short)
    .setValue(existing?.action ?? 'WARN')
    .setPlaceholder('WARN / MUTE / KICK / BAN')
    .setMinLength(3)
    .setMaxLength(4)
    .setRequired(true);

  const durationLabel = await t(guildId, 'settings.punishment.modal.duration');
  const durationInput = new TextInputBuilder()
    .setCustomId('duration')
    .setLabel(durationLabel)
    .setStyle(TextInputStyle.Short)
    .setValue(
      existing?.action === 'MUTE' && existing.muteDurationMinutes !== undefined
        ? String(existing.muteDurationMinutes)
        : '',
    )
    .setMaxLength(5)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(pointsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(actionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput),
  );

  return modal;
}

// ---------------------------------------------------------------------------
// Handle threshold modal submit (add or edit)
// ---------------------------------------------------------------------------

export async function handlePunishmentSubmit(
  interaction: ModalSubmitInteraction,
  mode: string,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const pointsRaw = interaction.fields.getTextInputValue('points').trim();
  const actionRaw = interaction.fields.getTextInputValue('action').trim().toUpperCase();
  const durationRaw = interaction.fields.getTextInputValue('duration').trim();

  const points = parseInt(pointsRaw, 10);
  if (!Number.isInteger(points) || points < 1) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  if (!['WARN', 'MUTE', 'KICK', 'BAN'].includes(actionRaw)) {
    const msg = await t(guildId, 'settings.punishment.error.invalidAction');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  const action = actionRaw as ActionThreshold['action'];
  const muteDurationMinutes =
    action === 'MUTE' && durationRaw !== ''
      ? parseInt(durationRaw, 10)
      : undefined;

  const entry: ActionThreshold = {
    minPoints: points,
    action,
    ...(muteDurationMinutes !== undefined && !Number.isNaN(muteDurationMinutes)
      ? { muteDurationMinutes }
      : {}),
  };

  await updateGuildSettings(guildId, (s) => {
    let thresholds: ActionThreshold[];

    if (mode === 'add') {
      thresholds = [...s.punishments.thresholds, entry].sort((a, b) => a.minPoints - b.minPoints);
    } else {
      const editMatch = mode.match(/^edit_(\d+)$/);
      if (editMatch !== null) {
        const idx = parseInt(editMatch[1] ?? '0', 10);
        thresholds = s.punishments.thresholds.map((e, i) => (i === idx ? entry : e));
        thresholds.sort((a, b) => a.minPoints - b.minPoints);
      } else {
        thresholds = s.punishments.thresholds;
      }
    }

    return {
      ...s,
      punishments: { ...s.punishments, thresholds },
    };
  });

  const page = await buildPunishmentPage(guildId);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Show decay modal
// ---------------------------------------------------------------------------

export async function showDecayModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const settings = await getGuildSettings(guildId);

  const title = await t(guildId, 'settings.punishment.decay.modal.title');
  const label = await t(guildId, 'settings.punishment.decay.modal.label');

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'punishment', 'decay_submit'))
    .setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.punishments.decayPerHour))
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Handle decay modal submit
// ---------------------------------------------------------------------------

export async function handleDecaySubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const raw = interaction.fields.getTextInputValue('value').trim();
  const value = parseFloat(raw);

  if (Number.isNaN(value) || value <= 0) {
    const msg = await t(guildId, 'settings.error.invalidNumber');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    punishments: { ...s.punishments, decayPerHour: value },
  }));

  const page = await buildPunishmentPage(guildId);
  await updateReply(interaction, page);
}
