import { tSync } from '../i18n/index.js';
import { guildConfigCache } from '../utils/GuildConfigCache.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './base.js';

export class WordFilterDetector implements Detector {
  readonly name = 'word-filter';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    const { message, guildId, guildSettings } = ctx;

    const wordFilterSettings = guildSettings['wordFilter'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof wordFilterSettings?.['enabled'] === 'boolean'
        ? wordFilterSettings['enabled']
        : true;
    if (!enabled) return null;

    // Patterns and compiled regexes come from the cache — no DB query per message.
    const filters = await guildConfigCache.getWordFilters(guildId);

    for (const filter of filters) {
      let matched = false;

      if (filter.isRegex) {
        if (filter.compiled !== null) {
          // Reset lastIndex since the regex has the 'g'-less 'i' flag, but
          // be defensive: creating with /i is fine; test() is stateless here.
          matched = filter.compiled.test(message.content);
        }
        // compiled === null means the stored pattern was invalid; skip it.
      } else {
        matched = message.content.toLowerCase().includes(filter.pattern.toLowerCase());
      }

      if (matched) {
        return {
          detectorName: this.name,
          action: 'delete',
          reason: tSync('detector.wordFilter.reason', { pattern: filter.pattern }),
          points: 1,
        };
      }
    }

    return null;
  }
}
