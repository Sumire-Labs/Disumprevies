import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  Client,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { Events } from 'discord.js';
import { logger } from '../logger/index.js';
import { t } from '../i18n/index.js';
import { getAppealButtonHandler, getAppealModalHandler } from '../actions/appealInteractionRegistry.js';

// ---------------------------------------------------------------------------
// Command interface
// ---------------------------------------------------------------------------

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const commandMap = new Map<string, Command>();

export function registerCommand(command: Command): void {
  commandMap.set(command.data.name, command);
}

export function getAllCommands(): Command[] {
  return [...commandMap.values()];
}

// ---------------------------------------------------------------------------
// Dynamic loader — imports all command modules to populate the registry
// ---------------------------------------------------------------------------

let loaded = false;

export async function loadCommands(): Promise<void> {
  if (loaded) return;
  loaded = true;

  const modules = [
    import('./warn.js'),
    import('./mute.js'),
    import('./unmute.js'),
    import('./kick.js'),
    import('./ban.js'),
    import('./unban.js'),
    import('./history.js'),
    import('./settings/index.js'),
    import('./raidmode.js'),
  ];

  await Promise.all(modules);
}

// ---------------------------------------------------------------------------
// ChatInput command handler
// ---------------------------------------------------------------------------

export async function handleInteractionCreate(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = commandMap.get(interaction.commandName);
  if (command === undefined) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('Command execution failed', {
      command: interaction.commandName,
      guildId: interaction.guildId ?? 'DM',
      userId: interaction.user.id,
      error: err instanceof Error ? err.message : String(err),
    });

    const guildId = interaction.guildId ?? '';
    const msg = await t(guildId, 'command.error.generic');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Settings interaction router (button / select / modal)
// ---------------------------------------------------------------------------

async function handleSettingsButton(interaction: ButtonInteraction): Promise<void> {
  const { routeSettingsButton } = await import('./settings/router.js');
  await routeSettingsButton(interaction);
}

async function handleSettingsSelectMenu(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const { routeSettingsMenu } = await import('./settings/index.js');
  const { routeSettingsStringSelect } = await import('./settings/router.js');

  if (interaction.customId === 'settings_menu') {
    await routeSettingsMenu(interaction);
  } else if (interaction.customId.startsWith('settings:')) {
    await routeSettingsStringSelect(interaction);
  }
}

async function handleSettingsChannelSelect(
  interaction: ChannelSelectMenuInteraction,
): Promise<void> {
  const { routeSettingsChannelSelect } = await import('./settings/router.js');
  await routeSettingsChannelSelect(interaction);
}

async function handleSettingsRoleSelect(
  interaction: RoleSelectMenuInteraction,
): Promise<void> {
  const { routeSettingsRoleSelect } = await import('./settings/router.js');
  await routeSettingsRoleSelect(interaction);
}

async function handleSettingsModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { routeSettingsModal } = await import('./settings/router.js');
  await routeSettingsModal(interaction);
}

// ---------------------------------------------------------------------------
// Wire into a Discord client
// ---------------------------------------------------------------------------

export async function registerCommandHandler(client: Client): Promise<void> {
  await loadCommands();

  client.on(Events.InteractionCreate, (interaction) => {
    const logErr = (err: unknown): void => {
      logger.error('Unhandled error in interactionCreate', {
        error: err instanceof Error ? err.message : String(err),
      });
    };

    if (interaction.isChatInputCommand()) {
      handleInteractionCreate(interaction).catch(logErr);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('settings:')) {
      handleSettingsButton(interaction).catch(logErr);
      return;
    }

    // Appeal interactions (may come from DMs — no guild context)
    if (interaction.isButton() && interaction.customId.startsWith('appeal_')) {
      const appealButtonHandler = getAppealButtonHandler();
      if (appealButtonHandler !== null) {
        appealButtonHandler(interaction, client).catch(logErr);
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('appeal_')) {
      const appealModalHandler = getAppealModalHandler();
      if (appealModalHandler !== null) {
        appealModalHandler(interaction, client).catch(logErr);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId === 'settings_menu' ||
        interaction.customId.startsWith('settings:')
      ) {
        handleSettingsSelectMenu(interaction).catch(logErr);
      }
      return;
    }

    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId.startsWith('settings:')
    ) {
      handleSettingsChannelSelect(interaction).catch(logErr);
      return;
    }

    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId.startsWith('settings:')
    ) {
      handleSettingsRoleSelect(interaction).catch(logErr);
      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('settings:')
    ) {
      handleSettingsModal(interaction).catch(logErr);
      return;
    }
  });
}
