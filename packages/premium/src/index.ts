// Premium features entry point (BSL licensed)
// Feature access is always gated via checkFeatureAccess() from @disumprevies/core

import { t } from '@disumprevies/core';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { AdvancedRaidDetector } from './detectors/raidAdvanced.js';
import { ChannelProtector } from './detectors/channelProtector.js';
import { ModAbuseDetector } from './detectors/modAbuse.js';
import { resolveDetectorEnabled } from './features/channelOverrides.js';
import {
  handleAppealSubmitButton,
  handleAppealModalSubmit,
  handleAppealApproveButton,
  handleAppealRejectButton,
  handleAppealRejectModalSubmit,
} from './features/appeals/appealButtons.js';
import { makeAppealButtonId } from './features/appeals/appealEmbed.js';
import type {
  InfractionType,
  RaidAnalyzerFn,
  ChannelProtectorHandler,
  ModAbuseHandler,
  ChannelOverrideResolver,
  AppealDmRowProvider,
  AppealButtonHandler,
  AppealModalHandler,
} from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Registry bridge
//
// All registrations are performed via functions passed in by the caller
// (bot/index.ts) rather than imported from @disumprevies/core directly.
// This eliminates the pnpm virtual-store dual-module problem in Docker
// environments where premium's import of @disumprevies/core may resolve
// through .pnpm/ symlinks to a different module instance than the one
// core's pipeline already loaded — which would make the resolver invisible
// to getChannelOverrideResolver() even though premium "registered" it.
// ---------------------------------------------------------------------------

export interface PremiumRegistries {
  registerRaidAnalyzer: (fn: RaidAnalyzerFn) => void;
  registerChannelProtectorHandler: (fn: ChannelProtectorHandler) => void;
  registerModAbuseHandler: (fn: ModAbuseHandler) => void;
  registerChannelOverrideResolver: (fn: ChannelOverrideResolver) => void;
  registerAppealDmRowProvider: (fn: AppealDmRowProvider) => void;
  registerAppealInteractionHandlers: (btn: AppealButtonHandler, modal: AppealModalHandler) => void;
}

/**
 * Register all premium feature handlers using the registry functions supplied
 * by the caller.  bot/index.ts imports these directly from core's local module
 * files, guaranteeing they write to the same module instance that the pipeline
 * reads from — regardless of how Node resolves @disumprevies/core inside premium.
 */
export function registerPremiumFeatures(registries: PremiumRegistries): void {
  // Advanced raid detection
  const advancedRaidDetector = new AdvancedRaidDetector();
  registries.registerRaidAnalyzer((result, guildId) =>
    advancedRaidDetector.analyzeRaid(result, guildId),
  );

  // Channel protection (create/delete/role events)
  const channelProtector = new ChannelProtector();
  registries.registerChannelProtectorHandler((guildId, eventType, client) =>
    channelProtector.handle(guildId, eventType, client),
  );

  // Mod abuse detection (ban/kick events)
  const modAbuseDetector = new ModAbuseDetector();
  registries.registerModAbuseHandler((guildId, eventType, client) =>
    modAbuseDetector.handle(guildId, eventType, client),
  );

  // Channel-level override resolver
  registries.registerChannelOverrideResolver((guildSettings, channelId, detectorName) =>
    resolveDetectorEnabled(guildSettings, channelId, detectorName),
  );

  // Appeal DM button row provider
  registries.registerAppealDmRowProvider(async (guildId: string, type: InfractionType) => {
    // Only BAN and MUTE are appealable
    if (type !== 'BAN' && type !== 'MUTE') return null;

    const appealType = type === 'BAN' ? ('BAN' as const) : ('MUTE' as const);
    const buttonId = makeAppealButtonId(guildId, appealType);
    const label = await t(guildId, 'appeal_button_label');

    const button = new ButtonBuilder()
      .setCustomId(buttonId)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  });

  // Appeal interaction handlers (buttons + modals)
  registries.registerAppealInteractionHandlers(
    async (interaction, client) => {
      const { customId } = interaction;
      if (customId.startsWith('appeal_submit_')) {
        await handleAppealSubmitButton(interaction);
      } else if (customId.startsWith('appeal_approve_')) {
        await handleAppealApproveButton(interaction, client);
      } else if (customId.startsWith('appeal_reject_') && !customId.startsWith('appeal_reject_modal_')) {
        await handleAppealRejectButton(interaction);
      }
    },
    async (interaction, client) => {
      const { customId } = interaction;
      if (customId.startsWith('appeal_modal_')) {
        await handleAppealModalSubmit(interaction, client);
      } else if (customId.startsWith('appeal_reject_modal_')) {
        await handleAppealRejectModalSubmit(interaction, client);
      }
    },
  );
}

export * from './detectors/index.js';
export * from './features/channelOverrides.js';
