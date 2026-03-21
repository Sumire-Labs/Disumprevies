// Public API exports for consumers (e.g. packages/premium)
export type {
  Detector,
  DetectionResult,
  DetectionAction,
  DetectionContext,
  MessageDetectionContext,
  DetectorResult,
  DetectorAction,
  DetectorContext,
  MessageDetectorContext,
} from './types/index.js';
export { Feature, checkFeatureAccess } from './gates/index.js';
export type { InfractionType } from '@prisma/client';
export { AppealType, AppealStatus, Plan } from '@prisma/client';
export { prisma } from './db.js';
export { logger, logInfractionToChannel } from './logger/index.js';
export type { InfractionLogOptions } from './logger/index.js';
export { t, tSync, invalidateGuildLocaleCache } from './i18n/index.js';
export { config } from './config.js';
export { DetectionPipeline, DETECTOR_NAME_TO_OVERRIDE_KEY } from './pipeline.js';
export type { GuildConfig, PipelineOptions } from './pipeline.js';
export {
  ActionExecutor,
  getUserPoints,
  addPoints,
  resolveAction,
  THRESHOLDS,
} from './actions/index.js';
export type { ActionContext, ActionResult, ThresholdEntry } from './actions/index.js';
export {
  registerAppealDmRowProvider,
  getAppealDmRowProvider,
  clearAppealDmRowProvider,
} from './actions/appealDmRegistry.js';
export type { AppealDmRowProvider } from './actions/appealDmRegistry.js';
export {
  registerAppealInteractionHandlers,
  getAppealButtonHandler,
  getAppealModalHandler,
  clearAppealInteractionHandlers,
} from './actions/appealInteractionRegistry.js';
export type { AppealButtonHandler, AppealModalHandler } from './actions/appealInteractionRegistry.js';
export type { RaidResult, RaidContext, RaidDetector } from './detectors/raidBasic.js';
export type {
  GuildSettings,
  ChannelOverrideDetectorKey,
  ChannelOverridesMap,
  ChannelOverride,
  AppealConfig,
  RaidSeverity,
} from './settings/types.js';
export { DEFAULT_SETTINGS } from './settings/types.js';
export { guildConfigCache } from './utils/GuildConfigCache.js';
export { registerRaidAnalyzer, runAdditionalRaidAnalyzers, clearRaidAnalyzers } from './raid/raidAnalyzerRegistry.js';
export type { RaidAnalyzerFn } from './raid/raidAnalyzerRegistry.js';
export {
  registerChannelProtectorHandler,
  runChannelProtectorHandler,
  clearChannelProtectorHandler,
} from './channel/channelProtectorRegistry.js';
export type { ChannelEventType, ChannelProtectorHandler } from './channel/channelProtectorRegistry.js';
export {
  registerChannelOverrideResolver,
  getChannelOverrideResolver,
  clearChannelOverrideResolver,
} from './channel/channelOverrideRegistry.js';
export type { ChannelOverrideResolver } from './channel/channelOverrideRegistry.js';
export {
  registerModAbuseHandler,
  runModAbuseHandler,
  clearModAbuseHandler,
} from './modabuse/modAbuseRegistry.js';
export type { ModEventType, ModAbuseHandler } from './modabuse/modAbuseRegistry.js';
export { TimedMap } from './utils/TimedMap.js';
