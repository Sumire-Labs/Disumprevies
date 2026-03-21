import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordFilterDetector } from './wordFilter.js';
import type { MessageDetectionContext } from './base.js';

vi.mock('../db.js', () => ({
  prisma: {
    wordFilter: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../i18n/index.js', () => ({
  tSync: (key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

vi.mock('../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logInfractionToChannel: vi.fn(),
}));

import { prisma } from '../db.js';
import { guildConfigCache } from '../utils/GuildConfigCache.js';

function makeContext(
  content: string,
  guildId = 'guild-1',
  guildSettings: Record<string, unknown> = {},
): MessageDetectionContext {
  return {
    guildId,
    guild: {} as MessageDetectionContext['guild'],
    guildSettings,
    exemptRoles: [],
    message: { content } as MessageDetectionContext['message'],
    member: {} as MessageDetectionContext['member'],
  };
}

describe('WordFilterDetector', () => {
  const detector = new WordFilterDetector();

  beforeEach(() => {
    vi.clearAllMocks();
    // The WordFilterDetector now uses guildConfigCache — invalidate between
    // tests so each test's mock return value is actually fetched.
    guildConfigCache.invalidateAll();
  });

  it('returns null when no filters exist', async () => {
    vi.mocked(prisma.wordFilter.findMany).mockResolvedValue([]);
    const result = await detector.detect(makeContext('hello world'));
    expect(result).toBeNull();
  });

  it('detects plain text match (case-insensitive)', async () => {
    vi.mocked(prisma.wordFilter.findMany).mockResolvedValue([
      { id: 1, guildId: 'guild-1', pattern: 'badword', isRegex: false, createdAt: new Date() },
    ]);
    const result = await detector.detect(makeContext('Hello BADWORD world'));
    expect(result).not.toBeNull();
    expect(result?.action).toBe('delete');
    expect(result?.detectorName).toBe('word-filter');
  });

  it('returns null when no text matches', async () => {
    vi.mocked(prisma.wordFilter.findMany).mockResolvedValue([
      { id: 1, guildId: 'guild-1', pattern: 'badword', isRegex: false, createdAt: new Date() },
    ]);
    const result = await detector.detect(makeContext('Hello world'));
    expect(result).toBeNull();
  });

  it('detects regex match', async () => {
    vi.mocked(prisma.wordFilter.findMany).mockResolvedValue([
      { id: 1, guildId: 'guild-1', pattern: 'ba+dword', isRegex: true, createdAt: new Date() },
    ]);
    const result = await detector.detect(makeContext('this is a baaaadword'));
    expect(result).not.toBeNull();
    expect(result?.action).toBe('delete');
  });

  it('skips invalid regex without crashing and returns null', async () => {
    vi.mocked(prisma.wordFilter.findMany).mockResolvedValue([
      { id: 1, guildId: 'guild-1', pattern: '[invalid', isRegex: true, createdAt: new Date() },
    ]);
    const result = await detector.detect(makeContext('hello world'));
    expect(result).toBeNull();
  });

  it('returns null when word filter is disabled via settings', async () => {
    vi.mocked(prisma.wordFilter.findMany).mockResolvedValue([
      { id: 1, guildId: 'guild-1', pattern: 'badword', isRegex: false, createdAt: new Date() },
    ]);
    const result = await detector.detect(
      makeContext('badword', 'guild-1', { wordFilter: { enabled: false } }),
    );
    expect(result).toBeNull();
    // Should not even query the DB when disabled
    expect(vi.mocked(prisma.wordFilter.findMany)).not.toHaveBeenCalled();
  });
});
