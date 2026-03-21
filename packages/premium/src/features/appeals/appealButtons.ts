/**
 * Button and modal interaction handlers for the appeal system (Premium).
 *
 * Handles:
 *   - appeal_submit_{guildId}_{type}  → open appeal submission modal (from DM)
 *   - appeal_modal_{guildId}_{type}   → modal submit → createAppeal
 *   - appeal_approve_{appealId}       → approve appeal
 *   - appeal_reject_{appealId}        → open reject reason modal
 *   - appeal_reject_modal_{appealId}  → modal submit → rejectAppeal
 */

import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { AppealType } from '@disumprevies/core';
import { prisma, tSync, t, logger } from '@disumprevies/core';
import { createAppeal, approveAppeal, rejectAppeal } from './appealManager.js';
import { buildAppealEmbed, makeAppealModalId, makeRejectModalId } from './appealEmbed.js';

// ---------------------------------------------------------------------------
// DM button handler: open the appeal submission modal
// ---------------------------------------------------------------------------

export async function handleAppealSubmitButton(interaction: ButtonInteraction): Promise<void> {
  // Custom ID: appeal_submit_{guildId}_{type}
  const parts = interaction.customId.split('_');
  // parts: ['appeal', 'submit', guildId, type]
  const guildId = parts[2];
  const rawType = parts[3];

  if (guildId === undefined || rawType === undefined) {
    await interaction.reply({ content: tSync('appeal.error.invalid'), ephemeral: true });
    return;
  }

  const type = rawType === 'BAN' ? 'BAN' : 'MUTE';
  const modalId = makeAppealModalId(guildId, type);

  const [modalTitle, reasonLabel] = await Promise.all([
    t(guildId, 'appeal_modal_title'),
    t(guildId, 'appeal_modal_reason_label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(modalTitle);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel(reasonLabel)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1_000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Modal submit: create the appeal and notify mod channel
// ---------------------------------------------------------------------------

export async function handleAppealModalSubmit(
  interaction: ModalSubmitInteraction,
  client: Client,
): Promise<void> {
  // Custom ID: appeal_modal_{guildId}_{type}
  const parts = interaction.customId.split('_');
  // parts: ['appeal', 'modal', guildId, type]
  const guildId = parts[2];
  const rawType = parts[3];

  if (guildId === undefined || rawType === undefined) {
    await interaction.reply({ content: tSync('appeal.error.invalid'), ephemeral: true });
    return;
  }

  const appealType: AppealType = rawType === 'BAN' ? AppealType.BAN : AppealType.MUTE;
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const userId = interaction.user.id;

  const result = await createAppeal({ guildId, userId, type: appealType, reason });

  if (!result.ok) {
    const errorKeyMap: Record<string, string> = {
      no_access: 'appeal.error.no_access',
      already_pending: 'appeal_already_pending',
      cooldown: 'appeal_cooldown',
      reason_too_long: 'appeal.error.reason_too_long',
      guild_not_found: 'appeal.error.guild_not_found',
    };
    const msgKey = errorKeyMap[result.error] ?? 'appeal.error.generic';
    const msg = await t(guildId, msgKey);
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  const submitted = await t(guildId, 'appeal_submitted');
  await interaction.reply({ content: submitted, ephemeral: true });

  // Notify the mod/appeal channel
  await notifyModChannel(guildId, result.appealId, userId, appealType, reason, new Date(), client);
}

// ---------------------------------------------------------------------------
// Approve button handler
// ---------------------------------------------------------------------------

export async function handleAppealApproveButton(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  // Custom ID: appeal_approve_{appealId}
  const appealIdStr = interaction.customId.replace('appeal_approve_', '');
  const appealId = parseInt(appealIdStr, 10);
  const guildId = interaction.guildId ?? '';

  if (isNaN(appealId)) {
    await interaction.reply({ content: await t(guildId, 'appeal.error.invalid'), ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  const result = await approveAppeal(appealId, interaction.user.id, client);

  if (!result.ok) {
    const msg = result.error === 'not_found'
      ? await t(guildId, 'appeal.error.not_found')
      : await t(guildId, 'appeal.error.already_resolved');
    await interaction.followUp({ content: msg, ephemeral: true });
    return;
  }

  const successMsg = await t(guildId, 'appeal_approved_mod', { moderatorId: interaction.user.id });
  await interaction.editReply({ content: successMsg, embeds: [], components: [] });
}

// ---------------------------------------------------------------------------
// Reject button handler: open reject reason modal
// ---------------------------------------------------------------------------

export async function handleAppealRejectButton(interaction: ButtonInteraction): Promise<void> {
  // Custom ID: appeal_reject_{appealId}
  const appealIdStr = interaction.customId.replace('appeal_reject_', '');
  const appealId = parseInt(appealIdStr, 10);
  const guildId = interaction.guildId ?? '';

  if (isNaN(appealId)) {
    await interaction.reply({ content: await t(guildId, 'appeal.error.invalid'), ephemeral: true });
    return;
  }

  const modalId = makeRejectModalId(appealId);

  const [modalTitle, noteLabel] = await Promise.all([
    t(guildId, 'appeal.modal.reject.title'),
    t(guildId, 'appeal.modal.reject.label'),
  ]);

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(modalTitle);

  const noteInput = new TextInputBuilder()
    .setCustomId('note')
    .setLabel(noteLabel)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput));

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Reject reason modal submit
// ---------------------------------------------------------------------------

export async function handleAppealRejectModalSubmit(
  interaction: ModalSubmitInteraction,
  client: Client,
): Promise<void> {
  // Custom ID: appeal_reject_modal_{appealId}
  const appealIdStr = interaction.customId.replace('appeal_reject_modal_', '');
  const appealId = parseInt(appealIdStr, 10);
  const guildId = interaction.guildId ?? '';

  if (isNaN(appealId)) {
    await interaction.reply({ content: await t(guildId, 'appeal.error.invalid'), ephemeral: true });
    return;
  }

  const note = interaction.fields.getTextInputValue('note').trim();

  await interaction.deferUpdate();

  const result = await rejectAppeal(appealId, interaction.user.id, note, client);

  if (!result.ok) {
    const msg = result.error === 'not_found'
      ? await t(guildId, 'appeal.error.not_found')
      : await t(guildId, 'appeal.error.already_resolved');
    await interaction.followUp({ content: msg, ephemeral: true });
    return;
  }

  const successMsg = await t(guildId, 'appeal_rejected_mod', { moderatorId: interaction.user.id, reason: note });
  await interaction.editReply({ content: successMsg, embeds: [], components: [] });
}

// ---------------------------------------------------------------------------
// Internal: notify mod/appeal channel
// ---------------------------------------------------------------------------

async function notifyModChannel(
  guildId: string,
  appealId: number,
  userId: string,
  type: AppealType,
  reason: string,
  createdAt: Date,
  client: Client,
): Promise<void> {
  try {
    const guildRow = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { settings: true, modChannel: true },
    });
    if (guildRow === null) return;

    // Prefer appeal-specific channel if configured
    let channelId: string | null = null;
    const settings = guildRow.settings as Record<string, unknown> | null;
    if (settings !== null && typeof settings === 'object') {
      const appeals = settings['appeals'] as Record<string, unknown> | undefined;
      if (appeals !== undefined) {
        const ac = appeals['appealChannel'];
        if (typeof ac === 'string') channelId = ac;
      }
    }
    if (channelId === null) channelId = guildRow.modChannel;
    if (channelId === null) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild === null) return;

    const channel = guild.channels.cache.get(channelId);
    if (channel === null || channel === undefined || !channel.isTextBased() || channel.isDMBased()) {
      return;
    }

    const embedData = await buildAppealEmbed({ guildId, appealId, userId, type, reason, createdAt });
    await (channel as TextChannel).send(embedData);
  } catch (err) {
    logger.warn('Failed to notify mod channel of appeal', {
      guildId,
      appealId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Route: determine if a customId belongs to the appeal system
// ---------------------------------------------------------------------------

export function isAppealInteraction(customId: string): boolean {
  return (
    customId.startsWith('appeal_submit_') ||
    customId.startsWith('appeal_approve_') ||
    customId.startsWith('appeal_reject_') && !customId.startsWith('appeal_reject_modal_')
  );
}

export function isAppealModalInteraction(customId: string): boolean {
  return (
    customId.startsWith('appeal_modal_') ||
    customId.startsWith('appeal_reject_modal_')
  );
}
