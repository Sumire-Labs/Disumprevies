/**
 * Registry for the premium appeal DM button provider.
 *
 * The premium package registers a factory here at startup.
 * The ActionExecutor reads it without creating a circular dependency.
 */

import type { GuildMember, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import type { InfractionType } from '@prisma/client';

export type AppealDmRowProvider = (
  guildId: string,
  type: InfractionType,
) => Promise<ActionRowBuilder<ButtonBuilder> | null>;

let provider: AppealDmRowProvider | null = null;

export function registerAppealDmRowProvider(fn: AppealDmRowProvider): void {
  provider = fn;
}

export function getAppealDmRowProvider(): AppealDmRowProvider | null {
  return provider;
}

/** For tests only. */
export function clearAppealDmRowProvider(): void {
  provider = null;
}
