import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../../db.js';
import { t } from '../../i18n/index.js';
import { guildConfigCache } from '../../utils/GuildConfigCache.js';
import { checkFeatureAccess } from '../../gates/index.js';
import { Feature } from '../../gates/index.js';
import { getGuildSettings, updateGuildSettings } from '../../settings/cache.js';
import { FREE_LIMITS } from '../../settings/types.js';
import {
  buildPremiumUpsellEmbed,
  buildSettingsEmbed,
  makeBackRow,
  makeButtonId,
  makeToggleButton,
  showMainMenu,
  updateReply,
} from './_helpers.js';

// ---------------------------------------------------------------------------
// Page size for pagination
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Main word filter settings page
// ---------------------------------------------------------------------------

export async function handleWordFilterSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildWordFilterPage(guildId, 0);
  await updateReply(interaction, page);
}

export async function buildWordFilterPage(
  guildId: string,
  listPage: number,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}> {
  const settings = await getGuildSettings(guildId);
  const isPremium = await checkFeatureAccess(guildId, Feature.WordFilter);

  const count = await prisma.wordFilter.count({ where: { guildId } });
  const limit = FREE_LIMITS.wordFilterPatterns;

  const title = await t(guildId, 'settings.wordFilter.title');
  const labelEnabled = await t(guildId, 'settings.field.enabled');
  const labelCount = await t(guildId, 'settings.wordFilter.field.count');
  const labelLimit = await t(guildId, 'settings.wordFilter.field.limit');

  const statusLabel = settings.wordFilter.enabled
    ? await t(guildId, 'settings.button.enabled')
    : await t(guildId, 'settings.button.disabled');

  const fields = [
    { name: labelEnabled, value: statusLabel, inline: true },
    { name: labelCount, value: String(count), inline: true },
    { name: labelLimit, value: isPremium ? '∞' : String(limit), inline: true },
  ];

  const embeds: EmbedBuilder[] = [buildSettingsEmbed(title, fields)];

  const atLimit = !isPremium && count >= limit;
  if (atLimit) {
    embeds.push(await buildPremiumUpsellEmbed(guildId));
  }

  // Row 1: toggle + add + list
  const toggleBtn = await makeToggleButton(
    guildId,
    makeButtonId('settings', 'wordFilter', 'toggle'),
    settings.wordFilter.enabled,
  );

  const addBtnLabel = await t(guildId, 'settings.button.add');
  const addBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'add'))
    .setLabel(addBtnLabel)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(atLimit);

  const listBtnLabel = await t(guildId, 'settings.button.list');
  const listBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'list', '0'))
    .setLabel(listBtnLabel)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(count === 0);

  const deleteBtnLabel = await t(guildId, 'settings.button.delete');
  const deleteBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'delete_page', '0'))
    .setLabel(deleteBtnLabel)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(count === 0);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    toggleBtn,
    addBtn,
    listBtn,
    deleteBtn,
  );

  const backRow = await makeBackRow(guildId);

  return {
    embeds,
    components: [
      row1 as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
      backRow as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
    ],
  };
}

// ---------------------------------------------------------------------------
// Toggle enabled
// ---------------------------------------------------------------------------

export async function handleWordFilterToggle(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  await updateGuildSettings(guildId, (s) => ({
    ...s,
    wordFilter: { ...s.wordFilter, enabled: !s.wordFilter.enabled },
  }));

  const page = await buildWordFilterPage(guildId, 0);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Show "add pattern" modal
// ---------------------------------------------------------------------------

export async function showWordFilterAddModal(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const title = await t(guildId, 'settings.wordFilter.modal.add.title');
  const patternLabel = await t(guildId, 'settings.wordFilter.modal.add.patternLabel');

  const modal = new ModalBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'add_submit'))
    .setTitle(title);

  const patternInput = new TextInputBuilder()
    .setCustomId('pattern')
    .setLabel(patternLabel)
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(200)
    .setRequired(true);

  const isRegexLabel = await t(guildId, 'settings.wordFilter.modal.add.isRegexLabel');
  const isRegexInput = new TextInputBuilder()
    .setCustomId('is_regex')
    .setLabel(isRegexLabel)
    .setStyle(TextInputStyle.Short)
    .setValue('no')
    .setMinLength(2)
    .setMaxLength(3)
    .setPlaceholder('yes / no')
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(patternInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(isRegexInput),
  );

  await interaction.showModal(modal);
}

// ---------------------------------------------------------------------------
// Handle "add pattern" modal submit
// ---------------------------------------------------------------------------

export async function handleWordFilterAddSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const isPremium = await checkFeatureAccess(guildId, Feature.WordFilter);
  const count = await prisma.wordFilter.count({ where: { guildId } });

  if (!isPremium && count >= FREE_LIMITS.wordFilterPatterns) {
    const upsell = await buildPremiumUpsellEmbed(guildId);
    await interaction.reply({ embeds: [upsell], ephemeral: true });
    return;
  }

  const pattern = interaction.fields.getTextInputValue('pattern').trim();
  const isRegexRaw = interaction.fields.getTextInputValue('is_regex').trim().toLowerCase();
  const isRegex = isRegexRaw === 'yes' || isRegexRaw === 'y' || isRegexRaw === 'true';

  if (isRegex) {
    try {
      new RegExp(pattern);
    } catch {
      const msg = await t(guildId, 'settings.wordFilter.error.invalidRegex');
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }
  }

  await prisma.wordFilter.create({ data: { guildId, pattern, isRegex } });
  guildConfigCache.invalidateWordFilters(guildId);

  const page = await buildWordFilterPage(guildId, 0);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Paginated list view
// ---------------------------------------------------------------------------

export async function handleWordFilterList(
  interaction: ButtonInteraction,
  page: number,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const total = await prisma.wordFilter.count({ where: { guildId } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const filters = await prisma.wordFilter.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' },
    skip: safePage * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const title = await t(guildId, 'settings.wordFilter.list.title');
  const footer = await t(guildId, 'settings.wordFilter.list.footer', {
    page: safePage + 1,
    total: totalPages,
  });

  const lines = filters.map((f) => `\`${f.pattern}\`${f.isRegex ? ' (regex)' : ''}`).join('\n');
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.length > 0 ? lines : '—')
    .setFooter({ text: footer })
    .setColor(0x5865f2);

  const prevBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'list', String(safePage - 1)))
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'list', String(safePage + 1)))
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage >= totalPages - 1);

  const backBtnLabel = await t(guildId, 'settings.button.back');
  const backBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'back_main'))
    .setLabel(backBtnLabel)
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn, backBtn);
  await interaction.update({ embeds: [embed], components: [row] });
}

// ---------------------------------------------------------------------------
// Delete: show select menu of patterns
// ---------------------------------------------------------------------------

export async function handleWordFilterDeletePage(
  interaction: ButtonInteraction,
  page: number,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const total = await prisma.wordFilter.count({ where: { guildId } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const filters = await prisma.wordFilter.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' },
    skip: safePage * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const title = await t(guildId, 'settings.wordFilter.delete.title');
  const placeholder = await t(guildId, 'settings.wordFilter.delete.placeholder');

  const embed = new EmbedBuilder().setTitle(title).setColor(0xff6600);

  const select = new StringSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'delete_select'))
    .setPlaceholder(placeholder);

  for (const f of filters) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue(String(f.id))
        .setLabel(f.pattern.slice(0, 100))
        .setDescription(f.isRegex ? 'regex' : 'plain'),
    );
  }

  const prevBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'delete_page', String(safePage - 1)))
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'delete_page', String(safePage + 1)))
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(safePage >= totalPages - 1);

  const backBtnLabel = await t(guildId, 'settings.button.back');
  const backBtn = new ButtonBuilder()
    .setCustomId(makeButtonId('settings', 'wordFilter', 'back_main'))
    .setLabel(backBtnLabel)
    .setStyle(ButtonStyle.Secondary);

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn, backBtn);

  await interaction.update({
    embeds: [embed],
    components: [
      selectRow as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
      navRow as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>,
    ],
  });
}

// ---------------------------------------------------------------------------
// Delete: handle select menu choice
// ---------------------------------------------------------------------------

export async function handleWordFilterDeleteSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const idStr = interaction.values[0];
  if (idStr === undefined) return;
  const id = parseInt(idStr, 10);

  if (!Number.isNaN(id)) {
    await prisma.wordFilter.deleteMany({ where: { id, guildId } });
    guildConfigCache.invalidateWordFilters(guildId);
  }

  const page = await buildWordFilterPage(guildId, 0);
  await updateReply(interaction, page);
}

// ---------------------------------------------------------------------------
// Back from list/delete to main word filter page
// ---------------------------------------------------------------------------

export async function handleWordFilterBackMain(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildWordFilterPage(guildId, 0);
  await updateReply(interaction, page);
}
