/**
 * Appeal embed builder for moderator notifications.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { AppealType } from '@disumprevies/core';
import { t } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Custom ID constants
// ---------------------------------------------------------------------------

/** Custom ID prefix for the approve button: appeal_approve_{appealId} */
export function makeApproveButtonId(appealId: number): string {
  return `appeal_approve_${appealId}`;
}

/** Custom ID prefix for the reject button: appeal_reject_{appealId} */
export function makeRejectButtonId(appealId: number): string {
  return `appeal_reject_${appealId}`;
}

/** Custom ID for the reject reason modal: appeal_reject_modal_{appealId} */
export function makeRejectModalId(appealId: number): string {
  return `appeal_reject_modal_${appealId}`;
}

/** Custom ID for the appeal button in BAN/MUTE DMs: appeal_submit_{guildId}_{type} */
export function makeAppealButtonId(guildId: string, type: 'BAN' | 'MUTE'): string {
  return `appeal_submit_${guildId}_${type}`;
}

/** Custom ID for the appeal submission modal: appeal_modal_{guildId}_{type} */
export function makeAppealModalId(guildId: string, type: 'BAN' | 'MUTE'): string {
  return `appeal_modal_${guildId}_${type}`;
}

// ---------------------------------------------------------------------------
// Mod channel embed
// ---------------------------------------------------------------------------

export interface AppealEmbedData {
  guildId: string;
  appealId: number;
  userId: string;
  type: AppealType;
  reason: string;
  createdAt: Date;
}

export async function buildAppealEmbed(data: AppealEmbedData): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const typeLabel = data.type === AppealType.BAN ? 'BAN' : 'MUTE';

  const [title, fieldUser, fieldType, fieldId, fieldReason, labelApprove, labelReject] = await Promise.all([
    t(data.guildId, 'appeal_embed_title'),
    t(data.guildId, 'appeal.embed.field.user'),
    t(data.guildId, 'appeal.embed.field.type'),
    t(data.guildId, 'appeal.embed.field.id'),
    t(data.guildId, 'appeal.embed.field.reason'),
    t(data.guildId, 'appeal.button.approve'),
    t(data.guildId, 'appeal.button.reject'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xffa500)
    .addFields(
      { name: fieldUser, value: `<@${data.userId}> (\`${data.userId}\`)`, inline: true },
      { name: fieldType, value: typeLabel, inline: true },
      { name: fieldId, value: String(data.appealId), inline: true },
      { name: fieldReason, value: data.reason },
    )
    .setTimestamp(data.createdAt);

  const approveBtn = new ButtonBuilder()
    .setCustomId(makeApproveButtonId(data.appealId))
    .setLabel(labelApprove)
    .setStyle(ButtonStyle.Success);

  const rejectBtn = new ButtonBuilder()
    .setCustomId(makeRejectButtonId(data.appealId))
    .setLabel(labelReject)
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, rejectBtn);

  return { embeds: [embed], components: [row] };
}
