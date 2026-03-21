import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { registerCommand } from './index.js';
import { t } from '../i18n/index.js';
import { logger } from '../logger/index.js';
import {
  activateRaidMode,
  deactivateRaidMode,
  isRaidModeActive,
} from '../raid/raidMode.js';
import { getGuildSettings, updateGuildSettings } from '../settings/cache.js';

// ---------------------------------------------------------------------------
// /raidmode command
// ---------------------------------------------------------------------------

const raidmodeCommand = {
  data: new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('Manage raid mode for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('on')
        .setDescription('Activate raid mode (automatically kicks new joins)')
        .addIntegerOption((opt) =>
          opt
            .setName('duration')
            .setDescription('Auto-disable after N minutes (0 = use server default)')
            .setMinValue(0)
            .setMaxValue(1440)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('off')
        .setDescription('Deactivate raid mode'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Show current raid mode status'),
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) return;

    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand(true);
    const client = interaction.client;

    try {
      switch (subcommand) {
        case 'on': {
          const durationOption = interaction.options.getInteger('duration');
          await handleRaidModeOn(interaction, guildId, client, durationOption);
          break;
        }
        case 'off': {
          await handleRaidModeOff(interaction, guildId, client);
          break;
        }
        case 'status': {
          await handleRaidModeStatus(interaction, guildId);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      logger.error('raidmode command failed', {
        guildId,
        subcommand,
        error: err instanceof Error ? err.message : String(err),
      });
      const msg = await t(guildId, 'command.error.generic');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleRaidModeOn(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  client: ChatInputCommandInteraction['client'],
  durationOverride: number | null,
): Promise<void> {
  const already = await isRaidModeActive(guildId);
  if (already) {
    const msg = await t(guildId, 'command.raidmode.alreadyActive');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  // If caller specified a custom duration, update settings temporarily
  if (durationOverride !== null && durationOverride !== 0) {
    await updateGuildSettings(guildId, (s) => ({
      ...s,
      raidMode: { ...s.raidMode, autoDisableMinutes: durationOverride },
    }));
  }

  await activateRaidMode(guildId, 'manual', client);

  const settings = await getGuildSettings(guildId);
  const autoMin = settings.raidMode.autoDisableMinutes;
  const disableMsg =
    autoMin > 0
      ? await t(guildId, 'command.raidmode.on.withDuration', { minutes: autoMin })
      : await t(guildId, 'command.raidmode.on.noDuration');

  await interaction.reply({ content: disableMsg, ephemeral: false });
}

async function handleRaidModeOff(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  client: ChatInputCommandInteraction['client'],
): Promise<void> {
  const active = await isRaidModeActive(guildId);
  if (!active) {
    const msg = await t(guildId, 'command.raidmode.notActive');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  await deactivateRaidMode(guildId, client);

  const msg = await t(guildId, 'command.raidmode.off.success');
  await interaction.reply({ content: msg, ephemeral: false });
}

async function handleRaidModeStatus(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): Promise<void> {
  const settings = await getGuildSettings(guildId);
  const { active, activatedAt, activatedBy, autoDisableMinutes } = settings.raidMode;

  if (!active) {
    const msg = await t(guildId, 'command.raidmode.status.inactive');
    await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  const since = activatedAt !== null ? new Date(activatedAt).toUTCString() : 'unknown';
  const by = activatedBy === 'auto' ? 'automatic detection' : 'moderator';
  const until =
    autoDisableMinutes > 0
      ? await t(guildId, 'command.raidmode.status.autoDisable', { minutes: autoDisableMinutes })
      : await t(guildId, 'command.raidmode.status.noAutoDisable');

  const msg = await t(guildId, 'command.raidmode.status.active', {
    since,
    by,
    until,
  });
  await interaction.reply({ content: msg, ephemeral: true });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

registerCommand(raidmodeCommand);
