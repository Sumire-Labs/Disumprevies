import { tSync } from '../i18n/index.js';
import { TimedMap } from '../utils/TimedMap.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './base.js';

const URL_REGEX = /https?:\/\/\S+/gi;

// ---------------------------------------------------------------------------
// Per-guild, per-user link post timestamps.
//
// Key format: "<guildId>:<userId>"
// TTL: 5 minutes — idle users are cleaned up automatically.
// maxSize: 10 000 — LRU eviction prevents unbounded growth.
// Cleanup interval: 60 seconds.
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 300_000; // 5 minutes
const MAX_ENTRIES = 10_000;

const linkTimestamps = new TimedMap<string, number[]>({
  ttlMs: ENTRY_TTL_MS,
  maxSize: MAX_ENTRIES,
});

linkTimestamps.startAutoCleanup(CLEANUP_INTERVAL_MS);

export class LinkDetector implements Detector {
  readonly name = 'link';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    const { guildId, member, message, guildSettings } = ctx;

    const linkSettings = guildSettings['link'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof linkSettings?.['enabled'] === 'boolean' ? linkSettings['enabled'] : true;
    if (!enabled) return null;

    const windowMs: number =
      typeof linkSettings?.['windowSeconds'] === 'number'
        ? (linkSettings['windowSeconds'] as number) * 1000
        : 10_000;

    const threshold: number =
      typeof linkSettings?.['threshold'] === 'number'
        ? (linkSettings['threshold'] as number)
        : 3;

    const matches = message.content.match(URL_REGEX);
    if (matches === null || matches.length === 0) return null;

    const key = `${guildId}:${member.user.id}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    const existing = linkTimestamps.get(key) ?? [];
    const timestamps = existing.filter((t) => t > cutoff);

    // Record one timestamp per URL in this message.
    for (let i = 0; i < matches.length; i++) {
      timestamps.push(now);
    }
    linkTimestamps.set(key, timestamps);

    if (timestamps.length >= threshold) {
      linkTimestamps.set(key, []);
      return {
        detectorName: this.name,
        points: 2,
        reason: tSync('detector.link.reason', {
          count: timestamps.length,
          window: Math.round(windowMs / 1000),
        }),
        action: 'delete',
      };
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

/** Exposed for testing — clears all in-memory state. */
export function clearLinkState(): void {
  linkTimestamps.clear();
}

/** Clears all state for a specific guild (called on GuildDelete). */
export function clearLinkStateForGuild(guildId: string): void {
  linkTimestamps.deleteWhere((key) => key.startsWith(`${guildId}:`));
}
