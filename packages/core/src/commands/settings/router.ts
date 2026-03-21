/**
 * Central router for all settings interaction events.
 * Parses the custom ID prefix scheme: "settings:<module>:<action>[:<extra>]"
 * and dispatches to the correct handler.
 */

import type {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from '../../logger/index.js';
import { t } from '../../i18n/index.js';
import { parseButtonId, showMainMenu } from './_helpers.js';

// ---------------------------------------------------------------------------
// Error wrapper
// ---------------------------------------------------------------------------

async function withErrorHandling(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const guildId = interaction.guildId ?? '';
    logger.error('Settings interaction handler failed', {
      customId: interaction.customId,
      guildId,
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
// Button router
// ---------------------------------------------------------------------------

export async function routeSettingsButton(interaction: ButtonInteraction): Promise<void> {
  await withErrorHandling(interaction, async () => {
    const parts = parseButtonId(interaction.customId);
    // parts[0] = 'settings', parts[1] = module, parts[2] = action, parts[3] = extra
    const module_ = parts[1];
    const action = parts[2];
    const extra = parts[3];

    if (module_ === 'back' || action === 'back') {
      await showMainMenu(interaction);
      return;
    }

    switch (module_) {
      case 'spam':
      case 'duplicate':
      case 'mention':
      case 'link':
      case 'invite': {
        const key = module_ as import('./_detectorFactory.js').SimpleDetectorKey;
        if (action === 'toggle') {
          const { handleDetectorToggle } = await import('./_detectorFactory.js');
          await handleDetectorToggle(interaction, key);
        } else if (action === 'threshold') {
          const { showThresholdModal } = await import('./_detectorFactory.js');
          await showThresholdModal(interaction, key);
        } else if (action === 'window') {
          const { showWindowModal } = await import('./_detectorFactory.js');
          await showWindowModal(interaction, key);
        }
        break;
      }

      case 'wordFilter': {
        if (action === 'toggle') {
          const { handleWordFilterToggle } = await import('./wordFilter.js');
          await handleWordFilterToggle(interaction);
        } else if (action === 'add') {
          const { showWordFilterAddModal } = await import('./wordFilter.js');
          await showWordFilterAddModal(interaction);
        } else if (action === 'list') {
          const page = extra !== undefined ? parseInt(extra, 10) : 0;
          const { handleWordFilterList } = await import('./wordFilter.js');
          await handleWordFilterList(interaction, isNaN(page) ? 0 : page);
        } else if (action === 'delete_page') {
          const page = extra !== undefined ? parseInt(extra, 10) : 0;
          const { handleWordFilterDeletePage } = await import('./wordFilter.js');
          await handleWordFilterDeletePage(interaction, isNaN(page) ? 0 : page);
        } else if (action === 'back_main') {
          const { handleWordFilterBackMain } = await import('./wordFilter.js');
          await handleWordFilterBackMain(interaction);
        }
        break;
      }

      case 'punishment': {
        if (action === 'add') {
          const { showPunishmentAddModal } = await import('./punishment.js');
          await showPunishmentAddModal(interaction);
        } else if (action === 'edit') {
          const idx = extra !== undefined ? parseInt(extra, 10) : 0;
          const { showPunishmentEditModal } = await import('./punishment.js');
          await showPunishmentEditModal(interaction, isNaN(idx) ? 0 : idx);
        } else if (action === 'decay') {
          const { showDecayModal } = await import('./punishment.js');
          await showDecayModal(interaction);
        }
        break;
      }

      case 'exemptRoles': {
        if (action === 'delete_menu') {
          const { handleExemptRoleDeleteMenu } = await import('./exemptRoles.js');
          await handleExemptRoleDeleteMenu(interaction);
        } else if (action === 'back_main') {
          const { handleExemptRoleBackMain } = await import('./exemptRoles.js');
          await handleExemptRoleBackMain(interaction);
        }
        break;
      }

      case 'raid': {
        if (action === 'toggle') {
          const { handleRaidToggle } = await import('./raid.js');
          await handleRaidToggle(interaction);
        } else if (action === 'threshold') {
          const { showRaidThresholdModal } = await import('./raid.js');
          await showRaidThresholdModal(interaction);
        } else if (action === 'window') {
          const { showRaidWindowModal } = await import('./raid.js');
          await showRaidWindowModal(interaction);
        } else if (action === 'auto_disable') {
          const { showRaidAutoDisableModal } = await import('./raid.js');
          await showRaidAutoDisableModal(interaction);
        } else if (action === 'auto_activate') {
          const { handleRaidAutoActivateToggle } = await import('./raid.js');
          await handleRaidAutoActivateToggle(interaction);
        }
        break;
      }

      case 'accountAge': {
        if (action === 'toggle') {
          const { handleAccountAgeToggle } = await import('./accountAge.js');
          await handleAccountAgeToggle(interaction);
        } else if (action === 'minDays') {
          const { showAccountAgeMinDaysModal } = await import('./accountAge.js');
          await showAccountAgeMinDaysModal(interaction);
        } else if (action === 'action') {
          const { showAccountAgeActionMenu } = await import('./accountAge.js');
          await showAccountAgeActionMenu(interaction);
        }
        break;
      }

      case 'channelOverrides': {
        if (action === 'toggle') {
          const { handleChannelOverrideToggle } = await import('./channelOverrides.js');
          await handleChannelOverrideToggle(interaction);
        } else if (action === 'reset') {
          const { handleChannelOverrideReset } = await import('./channelOverrides.js');
          await handleChannelOverrideReset(interaction);
        } else if (action === 'back_channel') {
          const { handleChannelOverrideBackChannel } = await import('./channelOverrides.js');
          await handleChannelOverrideBackChannel(interaction);
        }
        break;
      }

      case 'appeals': {
        if (action === 'toggle') {
          const { handleAppealsToggle } = await import('./appeals.js');
          await handleAppealsToggle(interaction);
        } else if (action === 'cooldown') {
          const { showAppealsCooldownModal } = await import('./appeals.js');
          await showAppealsCooldownModal(interaction);
        }
        break;
      }

      case 'channelProtection': {
        if (action === 'toggle') {
          const { handleChannelProtectionToggle } = await import('./channelProtection.js');
          await handleChannelProtectionToggle(interaction);
        } else if (action === 'threshold') {
          const { showChannelProtectionThresholdModal } = await import('./channelProtection.js');
          await showChannelProtectionThresholdModal(interaction);
        } else if (action === 'window') {
          const { showChannelProtectionWindowModal } = await import('./channelProtection.js');
          await showChannelProtectionWindowModal(interaction);
        }
        break;
      }

      case 'modAbuse': {
        if (action === 'toggle') {
          const { handleModAbuseToggle } = await import('./modAbuse.js');
          await handleModAbuseToggle(interaction);
        } else if (action === 'threshold') {
          const { showModAbuseThresholdModal } = await import('./modAbuse.js');
          await showModAbuseThresholdModal(interaction);
        } else if (action === 'window') {
          const { showModAbuseWindowModal } = await import('./modAbuse.js');
          await showModAbuseWindowModal(interaction);
        }
        break;
      }

      default:
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// String select menu router (non-main-menu)
// ---------------------------------------------------------------------------

export async function routeSettingsStringSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  await withErrorHandling(interaction, async () => {
    const parts = parseButtonId(interaction.customId);
    const module_ = parts[1];
    const action = parts[2];

    switch (module_) {
      case 'wordFilter': {
        if (action === 'delete_select') {
          const { handleWordFilterDeleteSelect } = await import('./wordFilter.js');
          await handleWordFilterDeleteSelect(interaction);
        }
        break;
      }

      case 'language': {
        if (action === 'select') {
          const { handleLanguageSelect } = await import('./language.js');
          await handleLanguageSelect(interaction);
        }
        break;
      }

      case 'accountAge': {
        if (action === 'action_select') {
          const { handleAccountAgeActionSelect } = await import('./accountAge.js');
          await handleAccountAgeActionSelect(interaction);
        }
        break;
      }

      default:
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Channel select menu router
// ---------------------------------------------------------------------------

export async function routeSettingsChannelSelect(
  interaction: ChannelSelectMenuInteraction,
): Promise<void> {
  await withErrorHandling(interaction, async () => {
    const parts = parseButtonId(interaction.customId);
    const module_ = parts[1];
    const action = parts[2];

    if (module_ === 'log') {
      if (action === 'log_channel' || action === 'mod_channel') {
        const { handleLogChannelSelect } = await import('./logging.js');
        await handleLogChannelSelect(interaction, action);
      }
    } else if (module_ === 'channelOverrides') {
      if (action === 'channel_select') {
        const { handleChannelOverrideChannelSelect } = await import('./channelOverrides.js');
        await handleChannelOverrideChannelSelect(interaction);
      }
    } else if (module_ === 'appeals') {
      if (action === 'channel_select') {
        const { handleAppealsChannelSelect } = await import('./appeals.js');
        await handleAppealsChannelSelect(interaction);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Role select menu router
// ---------------------------------------------------------------------------

export async function routeSettingsRoleSelect(
  interaction: RoleSelectMenuInteraction,
): Promise<void> {
  await withErrorHandling(interaction, async () => {
    const parts = parseButtonId(interaction.customId);
    const module_ = parts[1];
    const action = parts[2];

    if (module_ === 'exemptRoles') {
      if (action === 'add') {
        const { handleExemptRoleAdd } = await import('./exemptRoles.js');
        await handleExemptRoleAdd(interaction);
      } else if (action === 'delete_select') {
        const { handleExemptRoleDeleteSelect } = await import('./exemptRoles.js');
        await handleExemptRoleDeleteSelect(interaction);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Modal submit router
// ---------------------------------------------------------------------------

export async function routeSettingsModal(interaction: ModalSubmitInteraction): Promise<void> {
  await withErrorHandling(interaction, async () => {
    const parts = parseButtonId(interaction.customId);
    const module_ = parts[1];
    const action = parts[2];
    const extra = parts[3];

    switch (module_) {
      case 'spam':
      case 'duplicate':
      case 'mention':
      case 'link':
      case 'invite': {
        const key = module_ as import('./_detectorFactory.js').SimpleDetectorKey;
        if (action === 'threshold_submit') {
          const { handleThresholdSubmit } = await import('./_detectorFactory.js');
          await handleThresholdSubmit(interaction, key);
        } else if (action === 'window_submit') {
          const { handleWindowSubmit } = await import('./_detectorFactory.js');
          await handleWindowSubmit(interaction, key);
        }
        break;
      }

      case 'wordFilter': {
        if (action === 'add_submit') {
          const { handleWordFilterAddSubmit } = await import('./wordFilter.js');
          await handleWordFilterAddSubmit(interaction);
        }
        break;
      }

      case 'punishment': {
        if (action === 'submit_add') {
          const { handlePunishmentSubmit } = await import('./punishment.js');
          await handlePunishmentSubmit(interaction, 'add');
        } else if (action !== undefined && action.startsWith('submit_edit_')) {
          // action = "submit_edit", extra = "0"
          const idx = extra !== undefined ? extra : '0';
          const { handlePunishmentSubmit } = await import('./punishment.js');
          await handlePunishmentSubmit(interaction, `edit_${idx}`);
        } else if (action === 'decay_submit') {
          const { handleDecaySubmit } = await import('./punishment.js');
          await handleDecaySubmit(interaction);
        }
        break;
      }

      case 'raid': {
        if (action === 'threshold_submit') {
          const { handleRaidThresholdSubmit } = await import('./raid.js');
          await handleRaidThresholdSubmit(interaction);
        } else if (action === 'window_submit') {
          const { handleRaidWindowSubmit } = await import('./raid.js');
          await handleRaidWindowSubmit(interaction);
        } else if (action === 'auto_disable_submit') {
          const { handleRaidAutoDisableSubmit } = await import('./raid.js');
          await handleRaidAutoDisableSubmit(interaction);
        }
        break;
      }

      case 'appeals': {
        if (action === 'cooldown_submit') {
          const { handleAppealsCooldownSubmit } = await import('./appeals.js');
          await handleAppealsCooldownSubmit(interaction);
        }
        break;
      }

      case 'accountAge': {
        if (action === 'minDays_submit') {
          const { handleAccountAgeMinDaysSubmit } = await import('./accountAge.js');
          await handleAccountAgeMinDaysSubmit(interaction);
        }
        break;
      }

      case 'channelProtection': {
        if (action === 'threshold_submit') {
          const { handleChannelProtectionThresholdSubmit } = await import('./channelProtection.js');
          await handleChannelProtectionThresholdSubmit(interaction);
        } else if (action === 'window_submit') {
          const { handleChannelProtectionWindowSubmit } = await import('./channelProtection.js');
          await handleChannelProtectionWindowSubmit(interaction);
        }
        break;
      }

      case 'modAbuse': {
        if (action === 'threshold_submit') {
          const { handleModAbuseThresholdSubmit } = await import('./modAbuse.js');
          await handleModAbuseThresholdSubmit(interaction);
        } else if (action === 'window_submit') {
          const { handleModAbuseWindowSubmit } = await import('./modAbuse.js');
          await handleModAbuseWindowSubmit(interaction);
        }
        break;
      }

      default:
        break;
    }
  });
}
