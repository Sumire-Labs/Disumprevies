import type { GuildMember } from 'discord.js';
import { TimedMap } from '../utils/TimedMap.js';
import type { RaidSeverity } from '../settings/types.js';

// ---------------------------------------------------------------------------
// RaidDetector interface — separate from the message Detector interface
// because raid detection is triggered by GuildMemberAdd events, not messages.
// ---------------------------------------------------------------------------

export interface RaidContext {
  guildId: string;
  member: GuildMember;
  guildSettings: Record<string, unknown>;
  exemptRoles: string[];
}

export interface RaidResult {
  detectorName: string;
  severity: RaidSeverity;
  joinCount: number;
  windowSeconds: number;
  members: GuildMember[];
}

export interface RaidDetector {
  readonly name: string;
  detectRaid(context: RaidContext): Promise<RaidResult | null>;
}

// ---------------------------------------------------------------------------
// Join tracking — per guild join-burst state
//
// Key format: guildId
// Value: array of { timestamp, member } tuples
// TTL: 5 minutes (auto-cleaned); manual window filtering on each access.
// maxSize: 5 000 guilds — LRU eviction for large bots.
// ---------------------------------------------------------------------------

interface JoinEntry {
  timestamp: number;
  member: GuildMember;
}

const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 300_000; // 5 minutes
const MAX_ENTRIES = 5_000;

const joinWindows = new TimedMap<string, JoinEntry[]>({
  ttlMs: ENTRY_TTL_MS,
  maxSize: MAX_ENTRIES,
});

joinWindows.startAutoCleanup(CLEANUP_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Severity thresholds
// ---------------------------------------------------------------------------

function resolveSeverity(count: number): RaidSeverity {
  if (count >= 20) return 'high';
  if (count >= 10) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// BasicRaidDetector
// ---------------------------------------------------------------------------

export class BasicRaidDetector implements RaidDetector {
  readonly name = 'basic-raid';

  async detectRaid(ctx: RaidContext): Promise<RaidResult | null> {
    const { guildId, member, guildSettings } = ctx;

    // Read raid config from settings
    const raidSettings = guildSettings['raid'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof raidSettings?.['enabled'] === 'boolean' ? raidSettings['enabled'] : true;
    if (!enabled) return null;

    const threshold: number =
      typeof raidSettings?.['threshold'] === 'number' ? raidSettings['threshold'] : 5;

    const windowSeconds: number =
      typeof raidSettings?.['windowSeconds'] === 'number' ? raidSettings['windowSeconds'] : 10;

    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const cutoff = now - windowMs;

    // Retrieve and filter existing join entries within the window
    const existing = joinWindows.get(guildId) ?? [];
    const recent = existing.filter((e) => e.timestamp > cutoff);
    recent.push({ timestamp: now, member });
    joinWindows.set(guildId, recent);

    if (recent.length >= threshold) {
      const severity = resolveSeverity(recent.length);
      return {
        detectorName: this.name,
        severity,
        joinCount: recent.length,
        windowSeconds,
        members: recent.map((e) => e.member),
      };
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

/** Clear join-burst tracking for a specific guild (called on GuildDelete). */
export function clearRaidStateForGuild(guildId: string): void {
  joinWindows.delete(guildId);
}

/** Clear all join-burst state (for tests). */
export function clearRaidState(): void {
  joinWindows.clear();
}
