import { tSync } from '../i18n/index.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './base.js';

export class MentionDetector implements Detector {
  readonly name = 'mention';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    const { message, guildSettings } = ctx;

    const mentionSettings = guildSettings['mention'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof mentionSettings?.['enabled'] === 'boolean' ? mentionSettings['enabled'] : true;
    if (!enabled) return null;

    const threshold: number =
      typeof mentionSettings?.['threshold'] === 'number'
        ? (mentionSettings['threshold'] as number)
        : 5;

    // @everyone / @here — immediate flag regardless of threshold
    if (message.mentions.everyone) {
      return {
        detectorName: this.name,
        points: 3,
        reason: tSync('detector.mention.everyoneReason'),
        action: 'delete',
      };
    }

    // Count unique user + role mentions
    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;

    if (mentionCount >= threshold) {
      return {
        detectorName: this.name,
        points: 3,
        reason: tSync('detector.mention.reason', { count: mentionCount }),
        action: 'delete',
      };
    }

    return null;
  }
}
