import { tSync } from '../i18n/index.js';
import { TimedMap } from '../utils/TimedMap.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './base.js';

// ---------------------------------------------------------------------------
// Per-guild, per-user message timestamp tracking.
//
// Key format: "<guildId>:<userId>"
// TTL: 5 minutes — entries for inactive users are cleaned up automatically.
// maxSize: 10 000 — LRU eviction prevents unbounded growth on large bots.
// Cleanup interval: 60 seconds.
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 300_000; // 5 minutes
const MAX_ENTRIES = 10_000;

const messageTimestamps = new TimedMap<string, number[]>({
  ttlMs: ENTRY_TTL_MS,
  maxSize: MAX_ENTRIES,
});

messageTimestamps.startAutoCleanup(CLEANUP_INTERVAL_MS);

export class SpamDetector implements Detector {
  readonly name = 'spam';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    const { guildId, member, guildSettings } = ctx;

    const spamSettings = guildSettings['spam'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof spamSettings?.['enabled'] === 'boolean' ? spamSettings['enabled'] : true;
    if (!enabled) return null;

    const windowMs: number =
      typeof spamSettings?.['windowSeconds'] === 'number'
        ? (spamSettings['windowSeconds'] as number) * 1000
        : 5_000;

    const threshold: number =
      typeof spamSettings?.['threshold'] === 'number'
        ? (spamSettings['threshold'] as number)
        : 5;

    const key = `${guildId}:${member.user.id}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    // Retrieve existing timestamps, clean up those outside the detection window.
    const existing = messageTimestamps.get(key) ?? [];
    const timestamps = existing.filter((t) => t > cutoff);
    timestamps.push(now);
    messageTimestamps.set(key, timestamps);

    if (timestamps.length >= threshold) {
      // Reset to avoid re-triggering on every subsequent message.
      messageTimestamps.set(key, []);
      return {
        detectorName: this.name,
        points: 3,
        reason: tSync('detector.spam.reason', {
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
export function clearSpamState(): void {
  messageTimestamps.clear();
}

/** Clears all state for a specific guild (called on GuildDelete). */
export function clearSpamStateForGuild(guildId: string): void {
  messageTimestamps.deleteWhere((key) => key.startsWith(`${guildId}:`));
}
