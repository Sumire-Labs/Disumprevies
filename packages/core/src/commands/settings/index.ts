import {
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { registerCommand } from '../index.js';
import { t } from '../../i18n/index.js';
import { logger } from '../../logger/index.js';
import { handleSpamSettings } from './spam.js';
import { handleDuplicateSettings } from './duplicate.js';
import { handleMentionSettings } from './mention.js';
import { handleLinkSettings } from './link.js';
import { handleInviteSettings } from './invite.js';
import { handleWordFilterSettings } from './wordFilter.js';
import { handlePunishmentSettings } from './punishment.js';
import { handleLogSettings } from './logging.js';
import { handleExemptRoleSettings } from './exemptRoles.js';
import { handleLanguageSettings } from './language.js';
import { handleRaidSettings } from './raid.js';
import { handleAccountAgeSettings } from './accountAge.js';
import { handleChannelProtectionSettings } from './channelProtection.js';
import { handleModAbuseSettings } from './modAbuse.js';
import { handleChannelOverridesSettings } from './channelOverrides.js';
import { handleAppealSettings } from './appeals.js';

// ---------------------------------------------------------------------------
// Custom ID constants
// ---------------------------------------------------------------------------

export const SETTINGS_MENU_ID = 'settings_menu';

export const SETTINGS_CATEGORY = {
  SPAM: 'spam',
  DUPLICATE: 'duplicate',
  MENTION: 'mention',
  LINK: 'link',
  INVITE: 'invite',
  WORD_FILTER: 'word_filter',
  PUNISHMENT: 'punishment',
  LOG: 'log',
  EXEMPT_ROLES: 'exempt_roles',
  LANGUAGE: 'language',
  RAID: 'raid',
  ACCOUNT_AGE: 'account_age',
  CHANNEL_PROTECTION: 'channel_protection',
  MOD_ABUSE: 'mod_abuse',
  CHANNEL_OVERRIDES: 'channel_overrides',
  APPEALS: 'appeals',
} as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORY)[keyof typeof SETTINGS_CATEGORY];

// ---------------------------------------------------------------------------
// Build the main settings embed + select menu
// ---------------------------------------------------------------------------

export async function buildMainMenu(
  guildId: string,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
}> {
  const title = await t(guildId, 'settings.menu.title');
  const description = await t(guildId, 'settings.menu.description');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x5865f2);

  const labels = await Promise.all([
    t(guildId, 'settings.category.spam'),
    t(guildId, 'settings.category.duplicate'),
    t(guildId, 'settings.category.mention'),
    t(guildId, 'settings.category.link'),
    t(guildId, 'settings.category.invite'),
    t(guildId, 'settings.category.wordFilter'),
    t(guildId, 'settings.category.punishment'),
    t(guildId, 'settings.category.log'),
    t(guildId, 'settings.category.exemptRoles'),
    t(guildId, 'settings.category.language'),
    t(guildId, 'settings.category.raid'),
    t(guildId, 'settings.category.accountAge'),
    t(guildId, 'settings.category.channelProtection'),
    t(guildId, 'settings.category.modAbuse'),
    t(guildId, 'settings.category.channelOverrides'),
    t(guildId, 'settings.category.appeals'),
  ]);

  const descs = await Promise.all([
    t(guildId, 'settings.category.spam.desc'),
    t(guildId, 'settings.category.duplicate.desc'),
    t(guildId, 'settings.category.mention.desc'),
    t(guildId, 'settings.category.link.desc'),
    t(guildId, 'settings.category.invite.desc'),
    t(guildId, 'settings.category.wordFilter.desc'),
    t(guildId, 'settings.category.punishment.desc'),
    t(guildId, 'settings.category.log.desc'),
    t(guildId, 'settings.category.exemptRoles.desc'),
    t(guildId, 'settings.category.language.desc'),
    t(guildId, 'settings.category.raid.desc'),
    t(guildId, 'settings.category.accountAge.desc'),
    t(guildId, 'settings.category.channelProtection.desc'),
    t(guildId, 'settings.category.modAbuse.desc'),
    t(guildId, 'settings.category.channelOverrides.desc'),
    t(guildId, 'settings.category.appeals.desc'),
  ]);

  const categories: [SettingsCategory, string, string][] = [
    [SETTINGS_CATEGORY.SPAM, labels[0] ?? '', descs[0] ?? ''],
    [SETTINGS_CATEGORY.DUPLICATE, labels[1] ?? '', descs[1] ?? ''],
    [SETTINGS_CATEGORY.MENTION, labels[2] ?? '', descs[2] ?? ''],
    [SETTINGS_CATEGORY.LINK, labels[3] ?? '', descs[3] ?? ''],
    [SETTINGS_CATEGORY.INVITE, labels[4] ?? '', descs[4] ?? ''],
    [SETTINGS_CATEGORY.WORD_FILTER, labels[5] ?? '', descs[5] ?? ''],
    [SETTINGS_CATEGORY.PUNISHMENT, labels[6] ?? '', descs[6] ?? ''],
    [SETTINGS_CATEGORY.LOG, labels[7] ?? '', descs[7] ?? ''],
    [SETTINGS_CATEGORY.EXEMPT_ROLES, labels[8] ?? '', descs[8] ?? ''],
    [SETTINGS_CATEGORY.LANGUAGE, labels[9] ?? '', descs[9] ?? ''],
    [SETTINGS_CATEGORY.RAID, labels[10] ?? '', descs[10] ?? ''],
    [SETTINGS_CATEGORY.ACCOUNT_AGE, labels[11] ?? '', descs[11] ?? ''],
    [SETTINGS_CATEGORY.CHANNEL_PROTECTION, labels[12] ?? '', descs[12] ?? ''],
    [SETTINGS_CATEGORY.MOD_ABUSE, labels[13] ?? '', descs[13] ?? ''],
    [SETTINGS_CATEGORY.CHANNEL_OVERRIDES, labels[14] ?? '', descs[14] ?? ''],
    [SETTINGS_CATEGORY.APPEALS, labels[15] ?? '', descs[15] ?? ''],
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId(SETTINGS_MENU_ID)
    .setPlaceholder(await t(guildId, 'settings.menu.placeholder'));

  for (const [value, label, description_] of categories) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue(value)
        .setLabel(label)
        .setDescription(description_),
    );
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  return { embeds: [embed], components: [row] };
}

// ---------------------------------------------------------------------------
// Route select menu interaction to the appropriate category handler
// ---------------------------------------------------------------------------

export async function routeSettingsMenu(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;

  const guildId = interaction.guildId;
  const value = interaction.values[0] as SettingsCategory | undefined;
  if (value === undefined) return;

  try {
    switch (value) {
      case SETTINGS_CATEGORY.SPAM:
        await handleSpamSettings(interaction);
        break;
      case SETTINGS_CATEGORY.DUPLICATE:
        await handleDuplicateSettings(interaction);
        break;
      case SETTINGS_CATEGORY.MENTION:
        await handleMentionSettings(interaction);
        break;
      case SETTINGS_CATEGORY.LINK:
        await handleLinkSettings(interaction);
        break;
      case SETTINGS_CATEGORY.INVITE:
        await handleInviteSettings(interaction);
        break;
      case SETTINGS_CATEGORY.WORD_FILTER:
        await handleWordFilterSettings(interaction);
        break;
      case SETTINGS_CATEGORY.PUNISHMENT:
        await handlePunishmentSettings(interaction);
        break;
      case SETTINGS_CATEGORY.LOG:
        await handleLogSettings(interaction);
        break;
      case SETTINGS_CATEGORY.EXEMPT_ROLES:
        await handleExemptRoleSettings(interaction);
        break;
      case SETTINGS_CATEGORY.LANGUAGE:
        await handleLanguageSettings(interaction);
        break;
      case SETTINGS_CATEGORY.RAID:
        await handleRaidSettings(interaction);
        break;
      case SETTINGS_CATEGORY.ACCOUNT_AGE:
        await handleAccountAgeSettings(interaction);
        break;
      case SETTINGS_CATEGORY.CHANNEL_PROTECTION:
        await handleChannelProtectionSettings(interaction);
        break;
      case SETTINGS_CATEGORY.MOD_ABUSE:
        await handleModAbuseSettings(interaction);
        break;
      case SETTINGS_CATEGORY.CHANNEL_OVERRIDES:
        await handleChannelOverridesSettings(interaction);
        break;
      case SETTINGS_CATEGORY.APPEALS:
        await handleAppealSettings(interaction);
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error('Settings menu routing failed', {
      guildId,
      value,
      error: err instanceof Error ? err.message : String(err),
    });
    const msg = await t(guildId, 'command.error.generic');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

// ---------------------------------------------------------------------------
// /settings command definition
// ---------------------------------------------------------------------------

const settingsCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure bot settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) return;

    const guildId = interaction.guildId;
    const menu = await buildMainMenu(guildId);
    await interaction.reply({ ...menu, ephemeral: true });
  },
};

registerCommand(settingsCommand);
