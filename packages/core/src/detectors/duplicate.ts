import { tSync } from '../i18n/index.js';
import { TimedMap } from '../utils/TimedMap.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './base.js';

// ---------------------------------------------------------------------------
// Per-guild, per-user duplicate message tracking.
//
// Key format: "<guildId>:<userId>"
// TTL: 5 minutes — idle users are cleaned up automatically.
// maxSize: 10 000 — LRU eviction prevents unbounded growth.
// Cleanup interval: 60 seconds.
// ---------------------------------------------------------------------------

const CLEANUP_INTERVAL_MS = 60_000;
const ENTRY_TTL_MS = 300_000; // 5 minutes
const MAX_ENTRIES = 10_000;

interface UserHistory {
  lastHash: string;
  count: number;
}

const userHistory = new TimedMap<string, UserHistory>({
  ttlMs: ENTRY_TTL_MS,
  maxSize: MAX_ENTRIES,
});

userHistory.startAutoCleanup(CLEANUP_INTERVAL_MS);

/** Simple deterministic hash for message content comparison. */
function hashContent(content: string): string {
  // Normalise: trim + collapse whitespace + lowercase
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class DuplicateDetector implements Detector {
  readonly name = 'duplicate';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    const { guildId, member, message, guildSettings } = ctx;

    const dupSettings = guildSettings['duplicate'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof dupSettings?.['enabled'] === 'boolean' ? dupSettings['enabled'] : true;
    if (!enabled) return null;

    const threshold: number =
      typeof dupSettings?.['threshold'] === 'number'
        ? (dupSettings['threshold'] as number)
        : 3;

    const content = message.content;
    if (content.trim().length === 0) return null;

    const key = `${guildId}:${member.user.id}`;
    const hash = hashContent(content);
    const history = userHistory.get(key);

    if (history === undefined || history.lastHash !== hash) {
      // New or different message — reset counter.
      userHistory.set(key, { lastHash: hash, count: 1 });
      return null;
    }

    const newCount = history.count + 1;
    userHistory.set(key, { lastHash: hash, count: newCount });

    if (newCount >= threshold) {
      // Reset to avoid triggering on every subsequent duplicate.
      userHistory.set(key, { lastHash: hash, count: 0 });
      return {
        detectorName: this.name,
        points: 2,
        reason: tSync('detector.duplicate.reason', { count: newCount }),
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
export function clearDuplicateState(): void {
  userHistory.clear();
}

/** Clears all state for a specific guild (called on GuildDelete). */
export function clearDuplicateStateForGuild(guildId: string): void {
  userHistory.deleteWhere((key) => key.startsWith(`${guildId}:`));
}
