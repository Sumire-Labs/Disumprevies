/**
 * /settings → Channel Overrides (Premium)
 *
 * Lets server admins enable or disable individual detection modules
 * per channel.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { t } from '../../i18n/index.js';
import { checkFeatureAccess, Feature } from '../../gates/index.js';
import { getGuildSettings, updateGuildSettings } from '../../settings/cache.js';
import {
  buildPremiumUpsellEmbed,
  makeBackRow,
  makeButtonId,
  updateReply,
} from './_helpers.js';
import type { ChannelOverrideDetectorKey } from '../../settings/types.js';

// ---------------------------------------------------------------------------
// Detector key display names
// ---------------------------------------------------------------------------

const DETECTOR_LABELS: Record<ChannelOverrideDetectorKey, string> = {
  spam: 'Spam',
  duplicate: 'Duplicate',
  mention: 'Mention',
  link: 'Link',
  invite: 'Invite',
  wordFilter: 'Word Filter',
};

const ALL_DETECTOR_KEYS: ChannelOverrideDetectorKey[] = [
  'spam', 'duplicate', 'mention', 'link', 'invite', 'wordFilter',
];

// ---------------------------------------------------------------------------
// Main entry point from settings menu
// ---------------------------------------------------------------------------

export async function handleChannelOverridesSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const hasAccess = await checkFeatureAccess(guildId, Feature.ChannelOverrides);
  if (!hasAccess) {
    const embed = await buildPremiumUpsellEmbed(guildId);
    const backRow = await makeBackRow(guildId);
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  const page = await buildChannelSelectPage(guildId);
  await interaction.update(page);
}

// ---------------------------------------------------------------------------
// Channel select page
// ---------------------------------------------------------------------------

async function buildChannelSelectPage(guildId: string): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | ChannelSelectMenuBuilder>[];
}> {
  const [title, desc, placeholder] = await Promise.all([
    t(guildId, 'settings.channelOverrides.title'),
    t(guildId, 'settings.channelOverrides.description'),
    t(guildId, 'settings.channelOverrides.channel.placeholder'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(0x5865f2);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'channelOverrides', 'channel_select'))
    .setPlaceholder(placeholder)
    .addChannelTypes(ChannelType.GuildText);

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
  const backRow = await makeBackRow(guildId);

  return { embeds: [embed], components: [channelRow, backRow] };
}

// ---------------------------------------------------------------------------
// Handle channel selection → show per-channel override buttons
// ---------------------------------------------------------------------------

export async function handleChannelOverrideChannelSelect(
  interaction: ChannelSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const channelId = interaction.values[0];
  if (channelId === undefined) return;

  const page = await buildChannelOverridePage(guildId, channelId);
  await interaction.update(page);
}

async function buildChannelOverridePage(
  guildId: string,
  channelId: string,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const overrides = settings.channelOverrides[channelId] ?? {};

  const [
    title, resetLabel, backLabel,
    labelDefault, labelOn, labelOff,
    valueDefault, valueOn, valueOff,
  ] = await Promise.all([
    t(guildId, 'settings.channelOverrides.channel.title', { channelId }),
    t(guildId, 'settings.channelOverrides.button.reset'),
    t(guildId, 'settings.button.back'),
    t(guildId, 'settings.channelOverrides.label.default'),
    t(guildId, 'settings.channelOverrides.label.on'),
    t(guildId, 'settings.channelOverrides.label.off'),
    t(guildId, 'settings.channelOverrides.override.default'),
    t(guildId, 'settings.channelOverrides.override.on'),
    t(guildId, 'settings.channelOverrides.override.off'),
  ]);

  // Build embed with current state for each detector
  const fields = ALL_DETECTOR_KEYS.map((key) => {
    const override = overrides[key];
    let value: string;
    if (override === undefined) {
      value = valueDefault;
    } else {
      value = override ? valueOn : valueOff;
    }
    return { name: DETECTOR_LABELS[key], value, inline: true };
  });

  const embed = new EmbedBuilder()
    .setTitle(title)
    .addFields(fields)
    .setColor(0x5865f2);

  // Two rows of 3 toggle buttons each
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const chunks: ChannelOverrideDetectorKey[][] = [
    ALL_DETECTOR_KEYS.slice(0, 3),
    ALL_DETECTOR_KEYS.slice(3),
  ];

  for (const chunk of chunks) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const key of chunk) {
      const override = overrides[key];
      // Cycle: undefined → true → false → undefined (reset)
      // We use a simple "force ON" / "force OFF" / "reset" pattern via 3 buttons per key
      // For brevity, a single button cycles through the states
      let label: string;
      let style: ButtonStyle;
      if (override === undefined) {
        label = `${DETECTOR_LABELS[key]}: ${labelDefault}`;
        style = ButtonStyle.Secondary;
      } else if (override) {
        label = `${DETECTOR_LABELS[key]}: ${labelOn}`;
        style = ButtonStyle.Success;
      } else {
        label = `${DETECTOR_LABELS[key]}: ${labelOff}`;
        style = ButtonStyle.Danger;
      }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(makeButtonId('settings', 'channelOverrides', 'toggle', `${channelId}:${key}`))
          .setLabel(label)
          .setStyle(style),
      );
    }
    rows.push(row);
  }

  // Reset + Back row
  const resetBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'channelOverrides', 'reset', channelId))
    .setLabel(resetLabel)
    .setStyle(ButtonStyle.Danger);

  const backBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'channelOverrides', 'back_channel'))
    .setLabel(backLabel)
    .setStyle(ButtonStyle.Secondary);

  const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(resetBtn, backBtn);
  rows.push(controlRow);

  return { embeds: [embed], components: rows };
}

// ---------------------------------------------------------------------------
// Toggle a detector override for a channel (cycle: default → ON → OFF → default)
// ---------------------------------------------------------------------------

export async function handleChannelOverrideToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  // customId: settings:channelOverrides:toggle:{channelId}:{key}
  const parts = interaction.customId.split(':');
  // parts: ['settings', 'channelOverrides', 'toggle', channelId, key]
  const channelId = parts[3];
  const key = parts[4] as ChannelOverrideDetectorKey | undefined;

  if (channelId === undefined || key === undefined) return;

  await updateGuildSettings(guildId, (s) => {
    const channelOverride = s.channelOverrides[channelId] ?? {};
    const current = channelOverride[key];

    let next: boolean | undefined;
    if (current === undefined) {
      next = true; // default → ON
    } else if (current === true) {
      next = false; // ON → OFF
    } else {
      next = undefined; // OFF → default (remove key)
    }

    const updatedOverride = { ...channelOverride };
    if (next === undefined) {
      delete updatedOverride[key];
    } else {
      updatedOverride[key] = next;
    }

    const updatedOverrides = { ...s.channelOverrides };
    if (Object.keys(updatedOverride).length === 0) {
      delete updatedOverrides[channelId];
    } else {
      updatedOverrides[channelId] = updatedOverride;
    }

    return { ...s, channelOverrides: updatedOverrides };
  });

  const page = await buildChannelOverridePage(guildId, channelId);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Reset all overrides for a channel
// ---------------------------------------------------------------------------

export async function handleChannelOverrideReset(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  // customId: settings:channelOverrides:reset:{channelId}
  const parts = interaction.customId.split(':');
  const channelId = parts[3];
  if (channelId === undefined) return;

  await updateGuildSettings(guildId, (s) => {
    const updatedOverrides = { ...s.channelOverrides };
    delete updatedOverrides[channelId];
    return { ...s, channelOverrides: updatedOverrides };
  });

  const page = await buildChannelOverridePage(guildId, channelId);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Back to channel select page
// ---------------------------------------------------------------------------

export async function handleChannelOverrideBackChannel(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildChannelSelectPage(guildId);
  await interaction.update(page);
}
