import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppealStatus, AppealType } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@disumprevies/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@disumprevies/core')>();
  return {
    ...actual,
    t: vi.fn((guildId: string, key: string) => Promise.resolve(`${key}[${guildId}]`)),
    tSync: vi.fn((key: string) => key),
    prisma: {
      guild: { findUnique: vi.fn() },
      appeal: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('./appealManager.js', () => ({
  createAppeal: vi.fn(),
  approveAppeal: vi.fn(),
  rejectAppeal: vi.fn(),
}));

vi.mock('./appealEmbed.js', () => ({
  buildAppealEmbed: vi.fn().mockResolvedValue({ embeds: [], components: [] }),
  makeAppealModalId: vi.fn((guildId: string, type: string) => `appeal_modal_${guildId}_${type}`),
  makeRejectModalId: vi.fn((appealId: number) => `appeal_reject_modal_${appealId}`),
}));

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  const ModalBuilder = vi.fn(() => ({
    setCustomId: vi.fn().mockReturnThis(),
    setTitle: vi.fn().mockReturnThis(),
    addComponents: vi.fn().mockReturnThis(),
  }));
  const TextInputBuilder = vi.fn(() => ({
    setCustomId: vi.fn().mockReturnThis(),
    setLabel: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    setMaxLength: vi.fn().mockReturnThis(),
    setRequired: vi.fn().mockReturnThis(),
  }));
  const ActionRowBuilder = vi.fn(() => ({
    addComponents: vi.fn().mockReturnThis(),
  }));
  return { ...actual, ModalBuilder, TextInputBuilder, ActionRowBuilder };
});

import {
  handleAppealSubmitButton,
  handleAppealModalSubmit,
  handleAppealApproveButton,
  handleAppealRejectButton,
  handleAppealRejectModalSubmit,
} from './appealButtons.js';
import { createAppeal, approveAppeal, rejectAppeal } from './appealManager.js';
import { t } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUILD_ID = '111111111111111111';

function makeButtonInteraction(customId: string, guildId: string | null = GUILD_ID) {
  return {
    customId,
    guildId,
    user: { id: 'mod_user_id' },
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
}

function makeModalInteraction(customId: string, fields: Record<string, string>, guildId: string | null = GUILD_ID) {
  return {
    customId,
    guildId,
    user: { id: 'user_id' },
    fields: { getTextInputValue: vi.fn((key: string) => fields[key] ?? '') },
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
  };
}

const mockClient = {} as never;

// ---------------------------------------------------------------------------
// handleAppealSubmitButton
// ---------------------------------------------------------------------------

describe('handleAppealSubmitButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(t).mockImplementation((guildId: string, key: string) =>
      Promise.resolve(`${key}[${guildId}]`),
    );
  });

  it('calls t(guildId) for modal title', async () => {
    const interaction = makeButtonInteraction(`appeal_submit_${GUILD_ID}_BAN`);
    await handleAppealSubmitButton(interaction as never);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_modal_title');
  });

  it('calls t(guildId) for reason label', async () => {
    const interaction = makeButtonInteraction(`appeal_submit_${GUILD_ID}_BAN`);
    await handleAppealSubmitButton(interaction as never);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_modal_reason_label');
  });

  it('shows modal after awaiting translations', async () => {
    const interaction = makeButtonInteraction(`appeal_submit_${GUILD_ID}_MUTE`);
    await handleAppealSubmitButton(interaction as never);
    expect(interaction.showModal).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// handleAppealModalSubmit
// ---------------------------------------------------------------------------

describe('handleAppealModalSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(t).mockImplementation((guildId: string, key: string) =>
      Promise.resolve(`${key}[${guildId}]`),
    );
  });

  it('calls t(guildId) for submitted confirmation message', async () => {
    vi.mocked(createAppeal).mockResolvedValue({ ok: true, appealId: 1 });
    const interaction = makeModalInteraction(
      `appeal_modal_${GUILD_ID}_BAN`,
      { reason: 'I was wrongly banned' },
    );
    await handleAppealModalSubmit(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_submitted');
  });

  it('calls t(guildId) for error message on already_pending', async () => {
    vi.mocked(createAppeal).mockResolvedValue({ ok: false, error: 'already_pending' });
    const interaction = makeModalInteraction(
      `appeal_modal_${GUILD_ID}_BAN`,
      { reason: 'test' },
    );
    await handleAppealModalSubmit(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_already_pending');
  });

  it('calls t(guildId) for error message on cooldown', async () => {
    vi.mocked(createAppeal).mockResolvedValue({ ok: false, error: 'cooldown' });
    const interaction = makeModalInteraction(
      `appeal_modal_${GUILD_ID}_BAN`,
      { reason: 'test' },
    );
    await handleAppealModalSubmit(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_cooldown');
  });
});

// ---------------------------------------------------------------------------
// handleAppealApproveButton
// ---------------------------------------------------------------------------

describe('handleAppealApproveButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(t).mockImplementation((guildId: string, key: string) =>
      Promise.resolve(`${key}[${guildId}]`),
    );
  });

  it('calls t(guildId) for success message', async () => {
    vi.mocked(approveAppeal).mockResolvedValue({ ok: true });
    const interaction = makeButtonInteraction('appeal_approve_1', GUILD_ID);
    await handleAppealApproveButton(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_approved_mod', expect.any(Object));
  });

  it('calls t(guildId) for not_found error', async () => {
    vi.mocked(approveAppeal).mockResolvedValue({ ok: false, error: 'not_found' });
    const interaction = makeButtonInteraction('appeal_approve_1', GUILD_ID);
    await handleAppealApproveButton(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.error.not_found');
  });
});

// ---------------------------------------------------------------------------
// handleAppealRejectButton
// ---------------------------------------------------------------------------

describe('handleAppealRejectButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(t).mockImplementation((guildId: string, key: string) =>
      Promise.resolve(`${key}[${guildId}]`),
    );
  });

  it('calls t(guildId) for reject modal title', async () => {
    const interaction = makeButtonInteraction('appeal_reject_1', GUILD_ID);
    await handleAppealRejectButton(interaction as never);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.modal.reject.title');
  });

  it('calls t(guildId) for reject modal label', async () => {
    const interaction = makeButtonInteraction('appeal_reject_1', GUILD_ID);
    await handleAppealRejectButton(interaction as never);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.modal.reject.label');
  });
});

// ---------------------------------------------------------------------------
// handleAppealRejectModalSubmit
// ---------------------------------------------------------------------------

describe('handleAppealRejectModalSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(t).mockImplementation((guildId: string, key: string) =>
      Promise.resolve(`${key}[${guildId}]`),
    );
  });

  it('calls t(guildId) for success message', async () => {
    vi.mocked(rejectAppeal).mockResolvedValue({ ok: true });
    const interaction = makeModalInteraction(
      'appeal_reject_modal_1',
      { note: 'Not valid' },
      GUILD_ID,
    );
    await handleAppealRejectModalSubmit(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal_rejected_mod', expect.any(Object));
  });

  it('calls t(guildId) for already_resolved error', async () => {
    vi.mocked(rejectAppeal).mockResolvedValue({ ok: false, error: 'not_pending' });
    const interaction = makeModalInteraction(
      'appeal_reject_modal_1',
      { note: 'reason' },
      GUILD_ID,
    );
    await handleAppealRejectModalSubmit(interaction as never, mockClient);
    expect(vi.mocked(t)).toHaveBeenCalledWith(GUILD_ID, 'appeal.error.already_resolved');
  });
});
