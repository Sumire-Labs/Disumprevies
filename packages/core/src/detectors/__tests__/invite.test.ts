import { describe, it, expect, vi } from 'vitest';
import { InviteDetector } from '../invite.js';
import type { MessageDetectionContext } from '../base.js';

vi.mock('../../i18n/index.js', () => ({
  tSync: (key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

function makeContext(
  content: string,
  guildSettings: Record<string, unknown> = {},
): MessageDetectionContext {
  return {
    guildId: 'guild-1',
    guild: {} as MessageDetectionContext['guild'],
    guildSettings,
    exemptRoles: [],
    message: { content } as MessageDetectionContext['message'],
    member: {} as MessageDetectionContext['member'],
  };
}

describe('InviteDetector', () => {
  const detector = new InviteDetector();

  it('returns null for normal messages', async () => {
    const result = await detector.detect(makeContext('hello there'));
    expect(result).toBeNull();
  });

  it('detects discord.gg invite', async () => {
    const result = await detector.detect(makeContext('join us at discord.gg/abc123'));
    expect(result).not.toBeNull();
    expect(result?.detectorName).toBe('invite');
    expect(result?.action).toBe('delete');
    expect(result?.points).toBeGreaterThan(0);
  });

  it('detects https://discord.gg/ invite', async () => {
    const result = await detector.detect(makeContext('https://discord.gg/xyz789'));
    expect(result).not.toBeNull();
  });

  it('detects discordapp.com/invite/', async () => {
    const result = await detector.detect(
      makeContext('https://discordapp.com/invite/myserver'),
    );
    expect(result).not.toBeNull();
  });

  it('detects discord.com/invite/', async () => {
    const result = await detector.detect(
      makeContext('https://discord.com/invite/coolserver'),
    );
    expect(result).not.toBeNull();
  });

  it('allows whitelisted invite code', async () => {
    const result = await detector.detect(
      makeContext('join us: discord.gg/myown', {
        invite: { enabled: true, threshold: 1, whitelist: ['myown'] },
      }),
    );
    expect(result).toBeNull();
  });

  it('blocks non-whitelisted invite even when whitelist is set', async () => {
    const result = await detector.detect(
      makeContext('come join discord.gg/evil', {
        invite: { enabled: true, threshold: 1, whitelist: ['myown'] },
      }),
    );
    expect(result).not.toBeNull();
  });

  it('returns null for empty whitelist and no invite in message', async () => {
    const result = await detector.detect(makeContext('check out https://example.com'));
    expect(result).toBeNull();
  });

  it('returns null when invite detection is disabled', async () => {
    const result = await detector.detect(
      makeContext('discord.gg/badserver', {
        invite: { enabled: false, threshold: 1, whitelist: [] },
      }),
    );
    expect(result).toBeNull();
  });
});
