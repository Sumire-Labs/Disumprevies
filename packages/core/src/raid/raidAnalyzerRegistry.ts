import type { RaidResult } from '../detectors/raidBasic.js';

// ---------------------------------------------------------------------------
// Raid analyzer registry
//
// Allows premium (or other packages) to register additional raid analyzers
// without creating a circular dependency.
//
// Usage (from premium package):
//   import { registerRaidAnalyzer } from '@disumprevies/core';
//   registerRaidAnalyzer(async (result, guildId) => advancedDetector.analyzeRaid(result, guildId));
//
// Call site (in guildMemberAdd handler):
//   result = await runAdditionalRaidAnalyzers(result, guildId);
// ---------------------------------------------------------------------------

export type RaidAnalyzerFn = (
  result: RaidResult,
  guildId: string,
) => Promise<RaidResult | null>;

const analyzers: RaidAnalyzerFn[] = [];

/** Register an additional raid analyzer. Called at premium package load time. */
export function registerRaidAnalyzer(fn: RaidAnalyzerFn): void {
  analyzers.push(fn);
}

/**
 * Run all registered additional raid analyzers sequentially.
 * Each analyzer may upgrade the result (e.g. enhanced severity).
 * Errors in individual analyzers are swallowed — the last successful result is returned.
 */
export async function runAdditionalRaidAnalyzers(
  initial: RaidResult,
  guildId: string,
): Promise<RaidResult> {
  let current = initial;
  for (const fn of analyzers) {
    try {
      const enhanced = await fn(current, guildId);
      if (enhanced !== null) {
        current = enhanced;
      }
    } catch {
      // Swallow errors from individual analyzers; basic detection result stands.
    }
  }
  return current;
}

/** Clear all registered analyzers (for testing). */
export function clearRaidAnalyzers(): void {
  analyzers.length = 0;
}
