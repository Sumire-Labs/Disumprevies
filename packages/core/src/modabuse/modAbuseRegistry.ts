import type { Client } from 'discord.js';

// ---------------------------------------------------------------------------
// ModAbuseRegistry
//
// Allows the premium package to register a handler that is called when
// guildBanAdd / guildMemberRemove (kick) events fire.  Core remains
// decoupled from the premium implementation.
// ---------------------------------------------------------------------------

export type ModEventType = 'ban' | 'kick';

export type ModAbuseHandler = (
  guildId: string,
  eventType: ModEventType,
  client: Client,
) => Promise<void>;

let registeredHandler: ModAbuseHandler | null = null;

/** Register the mod-abuse handler (called once from the premium package). */
export function registerModAbuseHandler(handler: ModAbuseHandler): void {
  registeredHandler = handler;
}

/**
 * Run the registered handler for a moderation event.
 * No-op if no handler has been registered.
 */
export async function runModAbuseHandler(
  guildId: string,
  eventType: ModEventType,
  client: Client,
): Promise<void> {
  if (registeredHandler === null) return;
  await registeredHandler(guildId, eventType, client);
}

/** Remove the handler (used in tests). */
export function clearModAbuseHandler(): void {
  registeredHandler = null;
}
