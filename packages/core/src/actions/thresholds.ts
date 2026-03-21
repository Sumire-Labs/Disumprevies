import type { InfractionType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export interface ThresholdEntry {
  /** Minimum accumulated points required to trigger this action. */
  minPoints: number;
  action: InfractionType;
  /** Mute duration in minutes (only relevant for MUTE). */
  muteDurationMinutes?: number;
}

/**
 * Ordered list of thresholds from least to most severe.
 * The pipeline picks the highest threshold that the user's points reach.
 */
export const THRESHOLDS: readonly ThresholdEntry[] = [
  { minPoints: 3, action: 'WARN' },
  { minPoints: 6, action: 'MUTE', muteDurationMinutes: 10 },
  { minPoints: 9, action: 'KICK' },
  { minPoints: 12, action: 'BAN' },
] as const;

/** Points decay rate: 1 point per 24 hours. */
export const DECAY_POINTS_PER_MS = 1 / (24 * 60 * 60 * 1000);

/**
 * Determine which action to take based on accumulated points.
 * Uses custom thresholds if provided; falls back to the hardcoded defaults.
 * Returns undefined if no threshold is reached.
 */
export function resolveAction(
  totalPoints: number,
  customThresholds?: readonly ThresholdEntry[],
): ThresholdEntry | undefined {
  const thresholds = customThresholds !== undefined && customThresholds.length > 0
    ? customThresholds
    : THRESHOLDS;
  let result: ThresholdEntry | undefined;
  for (const entry of thresholds) {
    if (totalPoints >= entry.minPoints) {
      result = entry;
    }
  }
  return result;
}
