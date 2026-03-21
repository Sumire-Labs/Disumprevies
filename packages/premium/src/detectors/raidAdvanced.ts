import type { GuildMember } from 'discord.js';
import { checkFeatureAccess, Feature } from '@disumprevies/core';
import type { RaidResult, RaidSeverity } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Levenshtein distance (iterative DP, O(m·n) time)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[m]![n]!;
}

// ---------------------------------------------------------------------------
// Analysis configuration
// ---------------------------------------------------------------------------

/** Account age threshold in days: accounts newer than this are "suspicious" */
const NEW_ACCOUNT_DAYS = 30;

/** Ratio of new accounts above which the join is flagged */
const NEW_ACCOUNT_RATIO_THRESHOLD = 0.5;

/** Ratio of default-avatar members above which the join is flagged */
const DEFAULT_AVATAR_RATIO_THRESHOLD = 0.6;

/** Levenshtein threshold: usernames within this distance are "similar" */
const USERNAME_DISTANCE_THRESHOLD = 3;

/** Ratio of similar-username pairs above which the join is flagged */
const SIMILAR_USERNAME_RATIO_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<RaidSeverity, number> = { low: 0, medium: 1, high: 2 };
const SEVERITY_LIST: RaidSeverity[] = ['low', 'medium', 'high'];

function bumpSeverity(base: RaidSeverity, levels: number): RaidSeverity {
  const idx = Math.min(SEVERITY_ORDER[base] + levels, 2);
  return SEVERITY_LIST[idx]!;
}

// ---------------------------------------------------------------------------
// AdvancedRaidDetector (Premium)
//
// Accepts a BasicRaidDetector result and performs additional heuristic
// analysis to potentially upgrade the severity.
//
// Analysis indicators (each contributes +1 to a suspicion score):
//   1. Account age   — ≥50% of members created within NEW_ACCOUNT_DAYS days
//   2. Default avatar — ≥60% of members have the default Discord avatar
//   3. Similar names — ≥40% of member-pairs have Levenshtein distance ≤3
//
// Suspicion score → severity bump:
//   0 → no change
//   1 → +1 severity level
//   2 → +2 severity levels (caps at 'high')
//   3 → 'high' (always)
// ---------------------------------------------------------------------------

export class AdvancedRaidDetector {
  readonly name = 'advanced-raid';

  /**
   * Analyze a BasicRaidDetector result and return an enhanced result.
   * Returns null if the guild does not have premium access.
   */
  async analyzeRaid(
    base: RaidResult,
    guildId: string,
  ): Promise<RaidResult | null> {
    const hasAccess = await checkFeatureAccess(guildId, Feature.AdvancedRaidDetection);
    if (!hasAccess) return null;

    const members = base.members;
    if (members.length === 0) return base;

    const now = Date.now();
    let suspicionScore = 0;

    // ---- 1. Account age analysis ----
    const newAccountRatio = analyzeAccountAge(members, now);
    if (newAccountRatio >= NEW_ACCOUNT_RATIO_THRESHOLD) {
      suspicionScore += 1;
    }

    // ---- 2. Default avatar rate ----
    const defaultAvatarRatio = analyzeDefaultAvatars(members);
    if (defaultAvatarRatio >= DEFAULT_AVATAR_RATIO_THRESHOLD) {
      suspicionScore += 1;
    }

    // ---- 3. Similar usernames ----
    const similarNameRatio = analyzeSimilarUsernames(members);
    if (similarNameRatio >= SIMILAR_USERNAME_RATIO_THRESHOLD) {
      suspicionScore += 1;
    }

    if (suspicionScore === 0) return base;

    const enhancedSeverity = suspicionScore >= 3
      ? 'high'
      : bumpSeverity(base.severity, suspicionScore);

    return {
      ...base,
      detectorName: this.name,
      severity: enhancedSeverity,
    };
  }
}

// ---------------------------------------------------------------------------
// Analysis helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Returns ratio of members whose account is newer than NEW_ACCOUNT_DAYS days. */
export function analyzeAccountAge(members: GuildMember[], now: number): number {
  if (members.length === 0) return 0;
  const cutoffMs = NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
  const newAccounts = members.filter(
    (m) => now - m.user.createdTimestamp < cutoffMs,
  );
  return newAccounts.length / members.length;
}

/** Returns ratio of members with the default Discord avatar (null avatar). */
export function analyzeDefaultAvatars(members: GuildMember[]): number {
  if (members.length === 0) return 0;
  // A member has the default avatar when user.avatar is null
  const defaultCount = members.filter((m) => m.user.avatar === null).length;
  return defaultCount / members.length;
}

/**
 * Returns ratio of member pairs whose usernames are within USERNAME_DISTANCE_THRESHOLD
 * Levenshtein distance.
 *
 * For n members there are n*(n-1)/2 pairs. We sample up to MAX_PAIRS to keep
 * the computation bounded for large raid groups.
 */
const MAX_PAIRS_FOR_SIMILARITY = 200;

export function analyzeSimilarUsernames(members: GuildMember[]): number {
  if (members.length < 2) return 0;

  const usernames = members.map((m) => m.user.username.toLowerCase());
  let similarPairs = 0;
  let totalPairs = 0;

  outer: for (let i = 0; i < usernames.length; i++) {
    for (let j = i + 1; j < usernames.length; j++) {
      if (totalPairs >= MAX_PAIRS_FOR_SIMILARITY) break outer;
      totalPairs++;
      const dist = levenshtein(usernames[i]!, usernames[j]!);
      if (dist <= USERNAME_DISTANCE_THRESHOLD) {
        similarPairs++;
      }
    }
  }

  return totalPairs === 0 ? 0 : similarPairs / totalPairs;
}
