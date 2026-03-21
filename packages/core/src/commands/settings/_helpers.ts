import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type InteractionUpdateOptions,
  type MessageEditOptions,
} from 'discord.js';
import { t } from '../../i18n/index.js';
import { buildMainMenu, SETTINGS_MENU_ID } from './index.js';

// ---------------------------------------------------------------------------
// Re-export common Discord.js types used across settings handlers
// ---------------------------------------------------------------------------

export type {
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
};

// ---------------------------------------------------------------------------
// Custom ID helpers
// ---------------------------------------------------------------------------

export function makeButtonId(...parts: string[]): string {
  return parts.join(':');
}

export function parseButtonId(customId: string): string[] {
  return customId.split(':');
}

// ---------------------------------------------------------------------------
// "Back to main menu" button
// ---------------------------------------------------------------------------

export async function makeBackButton(guildId: string): Promise<ButtonBuilder> {
  const label = await t(guildId, 'settings.button.back');
  return new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'back'))
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

// ---------------------------------------------------------------------------
// Toggle button (ON / OFF)
// ---------------------------------------------------------------------------

export async function makeToggleButton(
  guildId: string,
  customId: string,
  enabled: boolean,
): Promise<ButtonBuilder> {
  const label = enabled
    ? await t(guildId, 'settings.button.enabled')
    : await t(guildId, 'settings.button.disabled');

  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger);
}

// ---------------------------------------------------------------------------
// Standard action row with back button
// ---------------------------------------------------------------------------

export async function makeBackRow(
  guildId: string,
): Promise<ActionRowBuilder<ButtonBuilder>> {
  const backBtn = await makeBackButton(guildId);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn);
}

// ---------------------------------------------------------------------------
// Update the original ephemeral reply for both button interactions
// and modal submits (which must use deferUpdate + editReply).
// ---------------------------------------------------------------------------

export async function updateReply(
  interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  data: InteractionUpdateOptions & MessageEditOptions,
): Promise<void> {
  if (interaction.isModalSubmit()) {
    // Modals don't have .update(); use deferUpdate → editReply
    await interaction.deferUpdate();
    await interaction.editReply(data);
  } else {
    await interaction.update(data);
  }
}

// ---------------------------------------------------------------------------
// Navigate back to the main settings menu
// (used from ButtonInteraction / ModalSubmitInteraction)
// ---------------------------------------------------------------------------

export async function showMainMenu(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const menu = await buildMainMenu(guildId);
  await updateReply(interaction, { ...menu });
}

// ---------------------------------------------------------------------------
// Convenience: build a simple settings embed with a title + field list
// ---------------------------------------------------------------------------

export function buildSettingsEmbed(
  title: string,
  fields: { name: string; value: string; inline?: boolean }[],
  color = 0x5865f2,
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(title).setColor(color);
  for (const field of fields) {
    embed.addFields({ name: field.name, value: field.value, inline: field.inline ?? false });
  }
  return embed;
}

// ---------------------------------------------------------------------------
// Premium upsell embed (generic)
// ---------------------------------------------------------------------------

export async function buildPremiumUpsellEmbed(guildId: string): Promise<EmbedBuilder> {
  const title = await t(guildId, 'settings.premium.title');
  const description = await t(guildId, 'settings.premium.description');
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xffd700);
}

// ---------------------------------------------------------------------------
// SETTINGS_MENU_ID re-export for interaction routing in bot/index
// ---------------------------------------------------------------------------

export { SETTINGS_MENU_ID };
