import { describe, it, expect, beforeEach } from 'vitest';
import { BasicRaidDetector, clearRaidState } from '../raidBasic.js';
import type { RaidContext } from '../raidBasic.js';
import type { GuildMember } from 'discord.js';

function makeMember(userId: string, createdAt = Date.now() - 365 * 86_400_000): GuildMember {
  return {
    user: {
      id: userId,
      bot: false,
      createdTimestamp: createdAt,
      username: `user_${userId}`,
      avatar: null,
    },
    roles: { cache: new Map() },
  } as unknown as GuildMember;
}

function makeContext(
  guildId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): RaidContext {
  return {
    guildId,
    member: makeMember(userId),
    guildSettings: overrides,
    exemptRoles: [],
  };
}

describe('BasicRaidDetector', () => {
  const detector = new BasicRaidDetector();

  beforeEach(() => {
    clearRaidState();
  });

  it('returns null below the threshold', async () => {
    for (let i = 0; i < 4; i++) {
      const ctx = makeContext('guild-1', `user-${i}`);
      expect(await detector.detectRaid(ctx)).toBeNull();
    }
  });

  it('triggers on reaching the default threshold (5 members in 10s)', async () => {
    let result = null;
    for (let i = 0; i < 5; i++) {
      result = await detector.detectRaid(makeContext('guild-1', `user-${i}`));
    }
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('basic-raid');
    expect(result?.joinCount).toBe(5);
  });

  it('returns the correct members in the result', async () => {
    let result = null;
    for (let i = 0; i < 5; i++) {
      result = await detector.detectRaid(makeContext('guild-1', `user-${i}`));
    }
    expect(result?.members).toHaveLength(5);
  });

  it('assigns low severity for 5–9 members', async () => {
    let result = null;
    for (let i = 0; i < 5; i++) {
      result = await detector.detectRaid(makeContext('guild-1', `user-${i}`));
    }
    expect(result?.severity).toBe('low');
  });

  it('assigns medium severity for 10–19 members', async () => {
    let result = null;
    for (let i = 0; i < 12; i++) {
      result = await detector.detectRaid(makeContext('guild-1', `user-${i}`));
    }
    expect(result?.severity).toBe('medium');
  });

  it('assigns high severity for 20+ members', async () => {
    let result = null;
    for (let i = 0; i < 21; i++) {
      result = await detector.detectRaid(makeContext('guild-1', `user-${i}`));
    }
    expect(result?.severity).toBe('high');
  });

  it('returns null when raid detection is disabled', async () => {
    for (let i = 0; i < 10; i++) {
      const ctx = makeContext('guild-1', `user-${i}`, {
        raid: { enabled: false, threshold: 5, windowSeconds: 10 },
      });
      expect(await detector.detectRaid(ctx)).toBeNull();
    }
  });

  it('respects custom threshold from guildSettings', async () => {
    // threshold=3: first 2 joins return null, 3rd triggers
    let result = null;
    for (let i = 0; i < 3; i++) {
      result = await detector.detectRaid(
        makeContext('guild-1', `user-${i}`, { raid: { enabled: true, threshold: 3, windowSeconds: 10 } }),
      );
    }
    expect(result).not.toBeNull();
    expect(result?.joinCount).toBe(3);
  });

  it('does not cross-contaminate between guilds', async () => {
    for (let i = 0; i < 4; i++) {
      await detector.detectRaid(makeContext('guild-1', `user-${i}`));
    }
    // guild-2 starts fresh, first join in guild-2 should not trigger
    const result = await detector.detectRaid(makeContext('guild-2', 'user-x'));
    expect(result).toBeNull();
  });

  it('reports windowSeconds in the result', async () => {
    let result = null;
    for (let i = 0; i < 5; i++) {
      result = await detector.detectRaid(
        makeContext('guild-1', `user-${i}`, { raid: { enabled: true, threshold: 5, windowSeconds: 30 } }),
      );
    }
    expect(result?.windowSeconds).toBe(30);
  });
});
