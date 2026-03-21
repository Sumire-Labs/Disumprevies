import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppealType } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@disumprevies/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@disumprevies/core')>();
  return {
    ...actual,
    t: vi.fn((guildId: string, key: string) => Promise.resolve(`${key}[${guildId}]`)),
    tSync: vi.fn((key: string) => key),
  };
});

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  const EmbedBuilder = vi.fn(() => ({
    setTitle: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    addFields: vi.fn().mockReturnThis(),
    setTimestamp: vi.fn().mockReturnThis(),
  }));
  const ButtonBuilder = vi.fn(() => ({
    setCustomId: vi.fn().mockReturnThis(),
    setLabel: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
  }));
  const ActionRowBuilder = vi.fn(() => ({
    addComponents: vi.fn().mockReturnThis(),
  }));
  return { ...actual, EmbedBuilder, ButtonBuilder, ActionRowBuilder };
});

import { buildAppealEmbed } from './appealEmbed.js';
import { t } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const GUILD_ID = '111111111111111111';

describe('buildAppealEmbed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(t).mockImplementation((guildId: string, key: string) =>
      Promise.resolve(`${key}[${guildId}]`),
    );
  });

  it('calls t(guildId) for embed title', async () => {
    await buildAppealEmbed({
      guildId: GUILD_ID,
      appealId: 1,
      userId: '999',
      type: AppealType.BAN,
      reason: 'test reason',
      createdAt: new Date(),
    });

    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_embed_title');
  });

  it('calls t(guildId) for all embed field labels', async () => {
    await buildAppealEmbed({
      guildId: GUILD_ID,
      appealId: 2,
      userId: '999',
      type: AppealType.MUTE,
      reason: 'test reason',
      createdAt: new Date(),
    });

    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.embed.field.user');
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.embed.field.type');
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.embed.field.id');
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.embed.field.reason');
  });

  it('calls t(guildId) for approve and reject button labels', async () => {
    await buildAppealEmbed({
      guildId: GUILD_ID,
      appealId: 3,
      userId: '999',
      type: AppealType.BAN,
      reason: 'test reason',
      createdAt: new Date(),
    });

    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.button.approve');
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.button.reject');
  });

  it('does not call tSync for any user-facing string', async () => {
    const { tSync } = await import('@disumprevies/core');
    vi.clearAllMocks();

    await buildAppealEmbed({
      guildId: GUILD_ID,
      appealId: 4,
      userId: '999',
      type: AppealType.BAN,
      reason: 'test reason',
      createdAt: new Date(),
    });

    expect(vi.mocked(tSync)).not.toHaveBeenCalled();
  });
});
