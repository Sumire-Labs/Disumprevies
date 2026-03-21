import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../../db.js';
import { t } from '../../i18n/index.js';
import { invalidateGuildLocaleCache } from '../../i18n/index.js';
import { buildSettingsEmbed, makeBackRow, makeButtonId } from './_helpers.js';

// ---------------------------------------------------------------------------
// Discover available locales dynamically from locales/ directory
// ---------------------------------------------------------------------------

const LOCALES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../locales',
);

function getAvailableLocales(): string[] {
  try {
    return readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return ['en'];
  }
}

// ---------------------------------------------------------------------------
// Human-readable locale names
// ---------------------------------------------------------------------------

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ja: '日本語',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ko: '한국어',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
};

function localeDisplayName(code: string): string {
  return LOCALE_NAMES[code] ?? code;
}

// ---------------------------------------------------------------------------
// Build language settings page
// ---------------------------------------------------------------------------

export async function handleLanguageSettings(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;
  const page = await buildLanguagePage(guildId);
  await interaction.update(page);
}

async function buildLanguagePage(guildId: string): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder | import('discord.js').ButtonBuilder>[];
}> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { locale: true },
  });

  const currentLocale = guild?.locale ?? 'en';
  const title = await t(guildId, 'settings.language.title');
  const labelCurrent = await t(guildId, 'settings.language.field.current');

  const embed = buildSettingsEmbed(title, [
    { name: labelCurrent, value: localeDisplayName(currentLocale), inline: true },
  ]);

  const placeholder = await t(guildId, 'settings.language.select.placeholder');
  const select = new StringSelectMenuBuilder()
    .setCustomId(makeButtonId('settings', 'language', 'select'))
    .setPlaceholder(placeholder);

  for (const locale of getAvailableLocales()) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue(locale)
        .setLabel(localeDisplayName(locale))
        .setDescription(locale)
        .setDefault(locale === currentLocale),
    );
  }

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const backRow = await makeBackRow(guildId);

  type AnyRow = ActionRowBuilder<StringSelectMenuBuilder | import('discord.js').ButtonBuilder>;

  return {
    embeds: [embed],
    components: [selectRow as AnyRow, backRow as AnyRow],
  };
}

// ---------------------------------------------------------------------------
// Handle locale select
// ---------------------------------------------------------------------------

export async function handleLanguageSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const guildId = interaction.guildId;

  const locale = interaction.values[0];
  if (locale === undefined) return;

  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, locale },
    update: { locale },
  });

  invalidateGuildLocaleCache(guildId);

  const page = await buildLanguagePage(guildId);
  await interaction.update(page);
}
