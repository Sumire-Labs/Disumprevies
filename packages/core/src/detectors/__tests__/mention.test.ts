import { describe, it, expect, vi } from 'vitest';
import { MentionDetector } from '../mention.js';
import type { MessageDetectionContext } from '../base.js';

vi.mock('../../i18n/index.js', () => ({
  tSync: (key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

function makeContext(opts: {
  userMentions?: number;
  roleMentions?: number;
  everyone?: boolean;
  guildSettings?: Record<string, unknown>;
}): MessageDetectionContext {
  const users = new Map<string, unknown>();
  for (let i = 0; i < (opts.userMentions ?? 0); i++) {
    users.set(`user-${i}`, {});
  }
  const roles = new Map<string, unknown>();
  for (let i = 0; i < (opts.roleMentions ?? 0); i++) {
    roles.set(`role-${i}`, {});
  }

  return {
    guildId: 'guild-1',
    guild: {} as MessageDetectionContext['guild'],
    guildSettings: opts.guildSettings ?? {},
    exemptRoles: [],
    message: {
      content: 'test message',
      mentions: {
        users,
        roles,
        everyone: opts.everyone ?? false,
      },
    } as unknown as MessageDetectionContext['message'],
    member: {} as MessageDetectionContext['member'],
  };
}

describe('MentionDetector', () => {
  const detector = new MentionDetector();

  it('returns null when no mentions', async () => {
    const result = await detector.detect(makeContext({}));
    expect(result).toBeNull();
  });

  it('returns null below default threshold (4 mentions)', async () => {
    const result = await detector.detect(makeContext({ userMentions: 4 }));
    expect(result).toBeNull();
  });

  it('triggers at default threshold (5 user mentions)', async () => {
    const result = await detector.detect(makeContext({ userMentions: 5 }));
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('mention');
    expect(result?.action).toBe('delete');
    expect(result?.points).toBeGreaterThan(0);
  });

  it('counts user and role mentions together', async () => {
    // 3 users + 2 roles = 5 total → trigger
    const result = await detector.detect(
      makeContext({ userMentions: 3, roleMentions: 2 }),
    );
    expect(result).not.toBeNull();
  });

  it('triggers immediately on @everyone', async () => {
    const result = await detector.detect(makeContext({ everyone: true }));
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('mention');
  });

  it('triggers immediately on @here (everyone=true)', async () => {
    const result = await detector.detect(makeContext({ everyone: true }));
    expect(result).not.toBeNull();
    expect(result?.reason).toBe('detector.mention.everyoneReason');
  });

  it('respects custom threshold from guildSettings', async () => {
    const settings = { mention: { enabled: true, threshold: 3 } };
    expect(await detector.detect(makeContext({ userMentions: 2, guildSettings: settings }))).toBeNull();
    const result = await detector.detect(
      makeContext({ userMentions: 3, guildSettings: settings }),
    );
    expect(result).not.toBeNull();
  });

  it('returns null when mention detection is disabled', async () => {
    const settings = { mention: { enabled: false, threshold: 5 } };
    const result = await detector.detect(
      makeContext({ userMentions: 10, guildSettings: settings }),
    );
    expect(result).toBeNull();
  });

  it('returns null for @everyone when mention detection is disabled', async () => {
    const settings = { mention: { enabled: false, threshold: 5 } };
    const result = await detector.detect(makeContext({ everyone: true, guildSettings: settings }));
    expect(result).toBeNull();
  });
});
