import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpamDetector, clearSpamState } from '../spam.js';
import type { MessageDetectionContext } from '../base.js';

vi.mock('../../i18n/index.js', () => ({
  tSync: (key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

function makeContext(
  userId: string,
  guildId = 'guild-1',
  guildSettings: Record<string, unknown> = {},
): MessageDetectionContext {
  return {
    guildId,
    guild: {} as MessageDetectionContext['guild'],
    guildSettings,
    exemptRoles: [],
    message: { content: 'hello' } as MessageDetectionContext['message'],
    member: {
      user: { id: userId },
    } as MessageDetectionContext['member'],
  };
}

describe('SpamDetector', () => {
  const detector = new SpamDetector();

  beforeEach(() => {
    clearSpamState();
    vi.clearAllMocks();
  });

  it('returns null for single messages below threshold', async () => {
    const ctx = makeContext('user-1');
    const result = await detector.detect(ctx);
    expect(result).toBeNull();
  });

  it('returns null for messages below default threshold (4 messages)', async () => {
    const ctx = makeContext('user-1');
    for (let i = 0; i < 4; i++) {
      expect(await detector.detect(ctx)).toBeNull();
    }
  });

  it('triggers on 5th message within window (default 5/5s)', async () => {
    const ctx = makeContext('user-1');
    for (let i = 0; i < 4; i++) {
      await detector.detect(ctx);
    }
    const result = await detector.detect(ctx);
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('spam');
    expect(result?.action).toBe('delete');
    expect(result?.points).toBeGreaterThan(0);
  });

  it('does not cross-contaminate between different users', async () => {
    const ctx1 = makeContext('user-1');
    const ctx2 = makeContext('user-2');
    for (let i = 0; i < 4; i++) {
      await detector.detect(ctx1);
    }
    // user-2 is at count 0; should not trigger
    const result = await detector.detect(ctx2);
    expect(result).toBeNull();
  });

  it('does not cross-contaminate between guilds', async () => {
    const ctx1 = makeContext('user-1', 'guild-1');
    const ctx2 = makeContext('user-1', 'guild-2');
    for (let i = 0; i < 4; i++) {
      await detector.detect(ctx1);
    }
    const result = await detector.detect(ctx2);
    expect(result).toBeNull();
  });

  it('respects custom threshold from guildSettings', async () => {
    const ctx = makeContext('user-1', 'guild-1', {
      spam: { enabled: true, threshold: 3, windowSeconds: 5 },
    });
    for (let i = 0; i < 2; i++) {
      expect(await detector.detect(ctx)).toBeNull();
    }
    const result = await detector.detect(ctx);
    expect(result).not.toBeNull();
  });

  it('returns null when spam detection is disabled', async () => {
    const ctx = makeContext('user-1', 'guild-1', {
      spam: { enabled: false, threshold: 5, windowSeconds: 5 },
    });
    for (let i = 0; i < 10; i++) {
      const result = await detector.detect(ctx);
      expect(result).toBeNull();
    }
  });

  it('resets state after triggering', async () => {
    const ctx = makeContext('user-1');
    // Trigger once
    for (let i = 0; i < 5; i++) {
      await detector.detect(ctx);
    }
    // After trigger, one more message should not immediately trigger again
    const result = await detector.detect(ctx);
    expect(result).toBeNull();
  });
});
