import type { Guild, Message, GuildMember } from 'discord.js';

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

export interface DetectionContext {
  guild: Guild;
  guildId: string;
  /** Raw guild settings JSON from the database. */
  guildSettings: Record<string, unknown>;
  /** Roles that are exempt from all moderation checks. */
  exemptRoles: string[];
}

export interface MessageDetectionContext extends DetectionContext {
  message: Message<true>;
  member: GuildMember;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type DetectionAction = 'warn' | 'mute' | 'kick' | 'ban' | 'delete' | 'none';

export interface DetectionResult {
  /** Name of the detector that produced this result. */
  detectorName: string;
  /** Violation points to accumulate (0 = informational only). */
  points: number;
  /** Human-readable reason shown in logs and DMs. */
  reason: string;
  /** Suggested immediate action (pipeline may override based on accumulated points). */
  action: DetectionAction;
}

// ---------------------------------------------------------------------------
// Detector interface
// ---------------------------------------------------------------------------

export interface Detector {
  readonly name: string;
  detect(context: MessageDetectionContext): Promise<DetectionResult | null>;
}
