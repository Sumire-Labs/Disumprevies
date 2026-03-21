import { tSync } from '../i18n/index.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './base.js';

/** Matches discord.gg/CODE and discordapp.com/invite/CODE */
const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/([A-Za-z0-9-]+)/gi;

export class InviteDetector implements Detector {
  readonly name = 'invite';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    const { message, guildSettings } = ctx;

    const inviteSettings = guildSettings['invite'] as Record<string, unknown> | undefined;

    const enabled: boolean =
      typeof inviteSettings?.['enabled'] === 'boolean' ? inviteSettings['enabled'] : true;
    if (!enabled) return null;

    // Whitelist: array of invite codes (e.g. ["abc123"]) or full URLs to ignore
    const whitelist: string[] = Array.isArray(inviteSettings?.['whitelist'])
      ? (inviteSettings['whitelist'] as string[])
      : [];

    // Reset regex lastIndex before each use (global flag)
    INVITE_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = INVITE_REGEX.exec(message.content)) !== null) {
      const code = match[1];
      if (code === undefined) continue;
      if (whitelist.some((w) => w === code || message.content.includes(w))) {
        continue;
      }
      return {
        detectorName: this.name,
        points: 2,
        reason: tSync('detector.invite.reason'),
        action: 'delete',
      };
    }

    return null;
  }
}
