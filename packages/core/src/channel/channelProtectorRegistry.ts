import type { Client } from 'discord.js';

// ---------------------------------------------------------------------------
// ChannelProtectorRegistry
//
// Allows the premium package to register a handler that is called when
// channel/role create/delete events fire.  Core remains decoupled from
// the premium implementation.
// ---------------------------------------------------------------------------

export type ChannelEventType = 'channelCreate' | 'channelDelete' | 'roleCreate' | 'roleDelete';

export type ChannelProtectorHandler = (
  guildId: string,
  eventType: ChannelEventType,
  client: Client,
) => Promise<void>;

let registeredHandler: ChannelProtectorHandler | null = null;

/** Register the channel-protector handler (called once from the premium package). */
export function registerChannelProtectorHandler(handler: ChannelProtectorHandler): void {
  registeredHandler = handler;
}

/**
 * Run the registered handler for a channel/role event.
 * No-op if no handler has been registered.
 */
export async function runChannelProtectorHandler(
  guildId: string,
  eventType: ChannelEventType,
  client: Client,
): Promise<void> {
  if (registeredHandler === null) return;
  await registeredHandler(guildId, eventType, client);
}

/** Remove the handler (used in tests). */
export function clearChannelProtectorHandler(): void {
  registeredHandler = null;
}
