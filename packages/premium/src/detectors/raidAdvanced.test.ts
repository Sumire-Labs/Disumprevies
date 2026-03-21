import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GuildMember } from 'discord.js';
import {
  AdvancedRaidDetector,
  analyzeAccountAge,
  analyzeDefaultAvatars,
  analyzeSimilarUsernames,
} from './raidAdvanced.js';
import type { RaidResult } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Mock feature gate
// ---------------------------------------------------------------------------

vi.mock('@disumprevies/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@disumprevies/core')>();
  return {
    ...actual,
    checkFeatureAccess: vi.fn().mockResolvedValue(true),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();
const OLD_ACCOUNT_TS = NOW - 90 * 24 * 60 * 60 * 1000; // 90 days old → NOT suspicious
const NEW_ACCOUNT_TS = NOW - 5 * 24 * 60 * 60 * 1000;  // 5 days old → suspicious

function makeMember(opts: {
  id?: string;
  username?: string;
  avatar?: string | null;
  createdTimestamp?: number;
}): GuildMember {
  return {
    user: {
      id: opts.id ?? 'user-1',
      username: opts.username ?? 'user',
      avatar: opts.avatar !== undefined ? opts.avatar : 'hash123',
      createdTimestamp: opts.createdTimestamp ?? OLD_ACCOUNT_TS,
    },
    roles: { cache: new Map() },
  } as unknown as GuildMember;
}

function makeBaseResult(members: GuildMember[], severity: RaidResult['severity'] = 'low'): RaidResult {
  return {
    detectorName: 'basic-raid',
    severity,
    joinCount: members.length,
    windowSeconds: 10,
    members,
  };
}

// ---------------------------------------------------------------------------
// analyzeAccountAge
// ---------------------------------------------------------------------------

describe('analyzeAccountAge', () => {
  it('returns 0 for empty members', () => {
    expect(analyzeAccountAge([], NOW)).toBe(0);
  });

  it('returns 1.0 when all accounts are new', () => {
    const members = [
      makeMember({ createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ createdTimestamp: NEW_ACCOUNT_TS }),
    ];
    expect(analyzeAccountAge(members, NOW)).toBe(1.0);
  });

  it('returns 0 when all accounts are old', () => {
    const members = [
      makeMember({ createdTimestamp: OLD_ACCOUNT_TS }),
      makeMember({ createdTimestamp: OLD_ACCOUNT_TS }),
    ];
    expect(analyzeAccountAge(members, NOW)).toBe(0);
  });

  it('returns partial ratio for mixed accounts', () => {
    const members = [
      makeMember({ createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ createdTimestamp: OLD_ACCOUNT_TS }),
      makeMember({ createdTimestamp: OLD_ACCOUNT_TS }),
      makeMember({ createdTimestamp: OLD_ACCOUNT_TS }),
    ];
    expect(analyzeAccountAge(members, NOW)).toBeCloseTo(0.25);
  });
});

// ---------------------------------------------------------------------------
// analyzeDefaultAvatars
// ---------------------------------------------------------------------------

describe('analyzeDefaultAvatars', () => {
  it('returns 0 for empty members', () => {
    expect(analyzeDefaultAvatars([])).toBe(0);
  });

  it('returns 1.0 when all members have default avatars', () => {
    const members = [
      makeMember({ avatar: null }),
      makeMember({ avatar: null }),
      makeMember({ avatar: null }),
    ];
    expect(analyzeDefaultAvatars(members)).toBe(1.0);
  });

  it('returns 0 when no members have default avatars', () => {
    const members = [
      makeMember({ avatar: 'hash1' }),
      makeMember({ avatar: 'hash2' }),
    ];
    expect(analyzeDefaultAvatars(members)).toBe(0);
  });

  it('returns partial ratio', () => {
    const members = [
      makeMember({ avatar: null }),
      makeMember({ avatar: null }),
      makeMember({ avatar: 'hash1' }),
      makeMember({ avatar: 'hash2' }),
    ];
    expect(analyzeDefaultAvatars(members)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// analyzeSimilarUsernames
// ---------------------------------------------------------------------------

describe('analyzeSimilarUsernames', () => {
  it('returns 0 for fewer than 2 members', () => {
    expect(analyzeSimilarUsernames([makeMember({ username: 'alice' })])).toBe(0);
    expect(analyzeSimilarUsernames([])).toBe(0);
  });

  it('returns 1.0 when all pairs are very similar', () => {
    // "raider1" vs "raider2" → distance 1; all pairs within threshold
    const members = [
      makeMember({ username: 'raider1' }),
      makeMember({ username: 'raider2' }),
      makeMember({ username: 'raider3' }),
    ];
    expect(analyzeSimilarUsernames(members)).toBe(1.0);
  });

  it('returns 0 when names are very different', () => {
    const members = [
      makeMember({ username: 'alice' }),
      makeMember({ username: 'zxqvwmont' }),
      makeMember({ username: 'klypborsf' }),
    ];
    const ratio = analyzeSimilarUsernames(members);
    expect(ratio).toBeLessThan(0.4);
  });
});

// ---------------------------------------------------------------------------
// AdvancedRaidDetector.analyzeRaid
// ---------------------------------------------------------------------------

describe('AdvancedRaidDetector.analyzeRaid', () => {
  let detector: AdvancedRaidDetector;

  beforeEach(() => {
    detector = new AdvancedRaidDetector();
    vi.clearAllMocks();
  });

  it('returns null when feature access is denied', async () => {
    const { checkFeatureAccess } = await import('@disumprevies/core');
    vi.mocked(checkFeatureAccess).mockResolvedValueOnce(false);

    const members = [makeMember({}), makeMember({})];
    const base = makeBaseResult(members, 'low');
    const result = await detector.analyzeRaid(base, 'guild-free');
    expect(result).toBeNull();
  });

  it('returns base unchanged when no suspicion indicators fire', async () => {
    // All old accounts, all with avatars, all distinct names
    const members = [
      makeMember({ username: 'alice', avatar: 'h1', createdTimestamp: OLD_ACCOUNT_TS }),
      makeMember({ username: 'zxqvwmontx', avatar: 'h2', createdTimestamp: OLD_ACCOUNT_TS }),
      makeMember({ username: 'klypborsfy', avatar: 'h3', createdTimestamp: OLD_ACCOUNT_TS }),
    ];
    const base = makeBaseResult(members, 'low');
    const result = await detector.analyzeRaid(base, 'guild-premium');
    expect(result?.severity).toBe('low');
    expect(result?.detectorName).toBe('basic-raid'); // unchanged
  });

  it('bumps severity by 1 when one indicator fires', async () => {
    // All new accounts → new account ratio = 1.0 ≥ 0.5 → suspicion=1 → bump+1
    const members = [
      makeMember({ username: 'alice', avatar: 'h1', createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ username: 'zxqvwmontx', avatar: 'h2', createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ username: 'klypborsfy', avatar: 'h3', createdTimestamp: NEW_ACCOUNT_TS }),
    ];
    const base = makeBaseResult(members, 'low');
    const result = await detector.analyzeRaid(base, 'guild-premium');
    expect(result?.severity).toBe('medium');
    expect(result?.detectorName).toBe('advanced-raid');
  });

  it('bumps severity by 2 when two indicators fire', async () => {
    // New accounts + default avatars
    const members = [
      makeMember({ username: 'alice', avatar: null, createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ username: 'zxqvwmontx', avatar: null, createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ username: 'klypborsfy', avatar: null, createdTimestamp: NEW_ACCOUNT_TS }),
    ];
    const base = makeBaseResult(members, 'low');
    const result = await detector.analyzeRaid(base, 'guild-premium');
    expect(result?.severity).toBe('high');
  });

  it('forces high severity when all three indicators fire', async () => {
    // New accounts + default avatars + similar names
    const members = [
      makeMember({ username: 'raider1', avatar: null, createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ username: 'raider2', avatar: null, createdTimestamp: NEW_ACCOUNT_TS }),
      makeMember({ username: 'raider3', avatar: null, createdTimestamp: NEW_ACCOUNT_TS }),
    ];
    const base = makeBaseResult(members, 'low');
    const result = await detector.analyzeRaid(base, 'guild-premium');
    expect(result?.severity).toBe('high');
    expect(result?.detectorName).toBe('advanced-raid');
  });

  it('does not downgrade severity', async () => {
    // No indicators fire; base is already 'high' — should stay 'high'
    const members = [
      makeMember({ username: 'alice', avatar: 'h1', createdTimestamp: OLD_ACCOUNT_TS }),
      makeMember({ username: 'zxqvwmontx', avatar: 'h2', createdTimestamp: OLD_ACCOUNT_TS }),
    ];
    const base = makeBaseResult(members, 'high');
    const result = await detector.analyzeRaid(base, 'guild-premium');
    expect(result?.severity).toBe('high');
  });

  it('returns base unchanged for empty member list', async () => {
    const base = makeBaseResult([]);
    const result = await detector.analyzeRaid(base, 'guild-premium');
    expect(result).toBe(base);
  });
});
