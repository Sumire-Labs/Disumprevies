import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkDetector, clearLinkState } from '../link.js';
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

describe('LinkDetector', () => {
  const detector = new LinkDetector();

  beforeEach(() => {
    clearLinkState();
    vi.clearAllMocks();
  });

  it('returns null for messages with no URLs', async () => {
    const result = await detector.detect(makeContext('hello world'));
    expect(result).toBeNull();
  });

  it('returns null for a single link (below default threshold of 3)', async () => {
    const result = await detector.detect(makeContext('check https://example.com out'));
    expect(result).toBeNull();
  });

  it('accumulates links across messages and triggers at threshold', async () => {
    await detector.detect(makeContext('https://example.com'));
    await detector.detect(makeContext('https://example.org'));
    const result = await detector.detect(makeContext('https://example.net'));
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('link');
    expect(result?.action).toBe('delete');
    expect(result?.points).toBeGreaterThan(0);
  });

  it('counts multiple links in one message', async () => {
    // 3 links in one message should trigger immediately
    const result = await detector.detect(
      makeContext('https://a.com https://b.com https://c.com'),
    );
    expect(result).not.toBeNull();
  });

  it('does not cross-contaminate between users', async () => {
    await detector.detect(makeContext('https://a.com', 'user-1'));
    await detector.detect(makeContext('https://b.com', 'user-1'));
    const result = await detector.detect(makeContext('https://c.com', 'user-2'));
    expect(result).toBeNull();
  });

  it('does not cross-contaminate between guilds', async () => {
    await detector.detect(makeContext('https://a.com', 'user-1', 'guild-1'));
    await detector.detect(makeContext('https://b.com', 'user-1', 'guild-1'));
    const result = await detector.detect(makeContext('https://c.com', 'user-1', 'guild-2'));
    expect(result).toBeNull();
  });

  it('respects custom threshold', async () => {
    const settings = { link: { enabled: true, threshold: 2, windowSeconds: 10 } };
    await detector.detect(makeContext('https://a.com', 'user-1', 'guild-1', settings));
    const result = await detector.detect(
      makeContext('https://b.com', 'user-1', 'guild-1', settings),
    );
    expect(result).not.toBeNull();
  });

  it('returns null when link detection is disabled', async () => {
    const settings = { link: { enabled: false, threshold: 3, windowSeconds: 10 } };
    const result = await detector.detect(
      makeContext('https://a.com https://b.com https://c.com', 'user-1', 'guild-1', settings),
    );
    expect(result).toBeNull();
  });

  it('detects both http and https', async () => {
    await detector.detect(makeContext('http://insecure.com'));
    await detector.detect(makeContext('https://secure.com'));
    const result = await detector.detect(makeContext('http://another.com'));
    expect(result).not.toBeNull();
  });
});
