/**
 * Registry for the premium channel-override resolver.
 *
 * The premium package registers its resolver here at startup.
 * Core reads it in the pipeline without creating a circular dependency.
 */

import type { GuildSettings, ChannelOverrideDetectorKey } from '../settings/types.js';

export type ChannelOverrideResolver = (
  guildSettings: GuildSettings,
  channelId: string,
  detectorName: ChannelOverrideDetectorKey,
) => boolean;

let resolver: ChannelOverrideResolver | null = null;

export function registerChannelOverrideResolver(fn: ChannelOverrideResolver): void {
  resolver = fn;
}

export function getChannelOverrideResolver(): ChannelOverrideResolver | null {
  return resolver;
}

/** For tests only — reset to null. */
export function clearChannelOverrideResolver(): void {
  resolver = null;
}
