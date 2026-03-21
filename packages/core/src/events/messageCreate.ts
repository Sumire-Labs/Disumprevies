import type { Message } from 'discord.js';
import { logger } from '../logger/index.js';
import { DetectionPipeline } from '../pipeline.js';
import { WordFilterDetector } from '../detectors/wordFilter.js';
import { SpamDetector } from '../detectors/spam.js';
import { DuplicateDetector } from '../detectors/duplicate.js';
import { MentionDetector } from '../detectors/mention.js';
import { LinkDetector } from '../detectors/link.js';
import { InviteDetector } from '../detectors/invite.js';

// ---------------------------------------------------------------------------
// Detector order determines priority (first match wins).
// Higher-severity checks (mention abuse, invite) run before rate-limit checks
// so a single bad message is flagged by the most relevant detector.
// ---------------------------------------------------------------------------

export const pipeline = new DetectionPipeline({
  detectors: [
    new MentionDetector(),
    new InviteDetector(),
    new WordFilterDetector(),
    new SpamDetector(),
    new DuplicateDetector(),
    new LinkDetector(),
  ],
});

export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot || !message.inGuild()) return;

  try {
    await pipeline.run(message);
  } catch (err) {
    logger.error('Unhandled error in message pipeline', {
      guildId: message.guildId,
      messageId: message.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
