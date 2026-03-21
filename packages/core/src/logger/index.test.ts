import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../i18n/index.js', () => ({
  t: vi.fn().mockImplementation((_guildId: string, key: string) => Promise.resolve(key)),
}));

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  return { ...actual };
});

import { logInfractionToChannel } from './index.js';
import type { TextChannel } from 'discord.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChannel(id: string): TextChannel {
  return {
    id,
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as TextChannel;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logInfractionToChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends exactly one embed to the log channel', async () => {
    const logChannel = makeChannel('log-1');

    await logInfractionToChannel({
      guildId: 'guild-1',
      channel: logChannel,
      type: 'WARN',
      userId: 'user-1',
      reason: 'test',
      points: 3,
      totalPoints: 3,
    });

    expect(logChannel.send).toHaveBeenCalledTimes(1);
    const call = vi.mocked(logChannel.send).mock.calls[0][0] as Record<string, unknown>;
    expect(call).toHaveProperty('embeds');
    expect(Array.isArray(call['embeds'])).toBe(true);
  });

  it('sends to modChannel when it is a different channel', async () => {
    const logChannel = makeChannel('log-1');
    const modChannel = makeChannel('mod-1');

    await logInfractionToChannel({
      guildId: 'guild-1',
      channel: logChannel,
      type: 'BAN',
      userId: 'user-1',
      reason: 'test',
      points: 4,
      totalPoints: 12,
      modChannel,
    });

    expect(logChannel.send).toHaveBeenCalledTimes(1);
    expect(modChannel.send).toHaveBeenCalledTimes(1);

    // logChannel receives an embed, modChannel receives plain text content
    const logCall = vi.mocked(logChannel.send).mock.calls[0][0] as Record<string, unknown>;
    expect(logCall).toHaveProperty('embeds');

    const modCall = vi.mocked(modChannel.send).mock.calls[0][0] as Record<string, unknown>;
    expect(modCall).toHaveProperty('content');
    expect(modCall).not.toHaveProperty('embeds');
  });

  it('does NOT send to modChannel when it is the same channel as logChannel (double-log prevention)', async () => {
    const sharedChannel = makeChannel('shared-1');

    await logInfractionToChannel({
      guildId: 'guild-1',
      channel: sharedChannel,
      type: 'MUTE',
      userId: 'user-1',
      reason: 'test',
      points: 2,
      totalPoints: 6,
      modChannel: sharedChannel, // same channel object → same id
    });

    // Only one send call (the embed), no extra plain-text notification
    expect(sharedChannel.send).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sharedChannel.send).mock.calls[0][0] as Record<string, unknown>;
    expect(call).toHaveProperty('embeds');
  });

  it('still sends modChannel notification when logChannel send fails', async () => {
    const logChannel = makeChannel('log-1');
    const modChannel = makeChannel('mod-1');
    vi.mocked(logChannel.send).mockRejectedValueOnce(new Error('Missing Access'));

    // Should not throw even if log channel send fails
    await expect(
      logInfractionToChannel({
        guildId: 'guild-1',
        channel: logChannel,
        type: 'KICK',
        userId: 'user-1',
        reason: 'test',
        points: 3,
        totalPoints: 9,
        modChannel,
      }),
    ).resolves.toBeUndefined();

    expect(modChannel.send).toHaveBeenCalledTimes(1);
  });
});
