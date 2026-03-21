import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuplicateDetector, clearDuplicateState } from '../duplicate.js';
import type { MessageDetectionContext } from '../base.js';

vi.mock('../../i18n/index.js', () => ({
  tSync: (key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

function makeContext(
  content: string,
  userId = 'user-1',
  guildId = 'guild-1',
  guildSettings: Record<string, unknown> = {},
): MessageDetectionContext {
  return {
    guildId,
    guild: {} as MessageDetectionContext['guild'],
    guildSettings,
    exemptRoles: [],
    message: { content } as MessageDetectionContext['message'],
    member: {
      user: { id: userId },
    } as MessageDetectionContext['member'],
  };
}

describe('DuplicateDetector', () => {
  const detector = new DuplicateDetector();

  beforeEach(() => {
    clearDuplicateState();
    vi.clearAllMocks();
  });

  it('returns null for a single unique message', async () => {
    const result = await detector.detect(makeContext('hello'));
    expect(result).toBeNull();
  });

  it('returns null for 2 identical messages (below default threshold of 3)', async () => {
    expect(await detector.detect(makeContext('hello'))).toBeNull();
    expect(await detector.detect(makeContext('hello'))).toBeNull();
  });

  it('triggers on 3rd identical message', async () => {
    await detector.detect(makeContext('hello'));
    await detector.detect(makeContext('hello'));
    const result = await detector.detect(makeContext('hello'));
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('duplicate');
    expect(result?.action).toBe('delete');
    expect(result?.points).toBeGreaterThan(0);
  });

  it('resets counter when a different message is sent', async () => {
    await detector.detect(makeContext('hello'));
    await detector.detect(makeContext('hello'));
    // Different message resets
    await detector.detect(makeContext('world'));
    // Back to hello — counter should restart
    expect(await detector.detect(makeContext('hello'))).toBeNull();
    expect(await detector.detect(makeContext('hello'))).toBeNull();
    const result = await detector.detect(makeContext('hello'));
    expect(result).not.toBeNull();
  });

  it('returns null for empty messages', async () => {
    const result = await detector.detect(makeContext('   '));
    expect(result).toBeNull();
  });

  it('is case-insensitive and trims whitespace', async () => {
    await detector.detect(makeContext('Hello World'));
    await detector.detect(makeContext('  hello world  '));
    const result = await detector.detect(makeContext('HELLO WORLD'));
    expect(result).not.toBeNull();
  });

  it('does not cross-contaminate between users', async () => {
    const msg = 'spam';
    await detector.detect(makeContext(msg, 'user-1'));
    await detector.detect(makeContext(msg, 'user-1'));
    // user-2 sees it once — should not trigger
    const result = await detector.detect(makeContext(msg, 'user-2'));
    expect(result).toBeNull();
  });

  it('respects custom threshold from guildSettings', async () => {
    const settings = { duplicate: { enabled: true, threshold: 2 } };
    expect(await detector.detect(makeContext('hi', 'user-1', 'guild-1', settings))).toBeNull();
    const result = await detector.detect(makeContext('hi', 'user-1', 'guild-1', settings));
    expect(result).not.toBeNull();
  });

  it('returns null when duplicate detection is disabled', async () => {
    const settings = { duplicate: { enabled: false, threshold: 3 } };
    for (let i = 0; i < 5; i++) {
      const result = await detector.detect(makeContext('hello', 'user-1', 'guild-1', settings));
      expect(result).toBeNull();
    }
  });

  it('resets after triggering', async () => {
    for (let i = 0; i < 3; i++) {
      await detector.detect(makeContext('hello'));
    }
    // After trigger, next message should not immediately re-trigger
    const result = await detector.detect(makeContext('hello'));
    expect(result).toBeNull();
  });
});
