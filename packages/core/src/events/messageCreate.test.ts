import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from 'discord.js';

// ---------------------------------------------------------------------------
// Hoist the mock run function so vi.mock factories can reference it.
// ---------------------------------------------------------------------------

const mockRun = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// ---------------------------------------------------------------------------
// Mocks — must appear before any imports from the module under test.
// ---------------------------------------------------------------------------

vi.mock('../pipeline.js', () => ({
  DetectionPipeline: vi.fn().mockImplementation(() => ({ run: mockRun })),
}));

vi.mock('../detectors/mention.js', () => ({
  MentionDetector: vi.fn().mockImplementation(() => ({ name: 'mention', detect: vi.fn() })),
}));
vi.mock('../detectors/invite.js', () => ({
  InviteDetector: vi.fn().mockImplementation(() => ({ name: 'invite', detect: vi.fn() })),
}));
vi.mock('../detectors/wordFilter.js', () => ({
  WordFilterDetector: vi.fn().mockImplementation(() => ({
    name: 'word-filter',
    detect: vi.fn(),
  })),
}));
vi.mock('../detectors/spam.js', () => ({
  SpamDetector: vi.fn().mockImplementation(() => ({ name: 'spam', detect: vi.fn() })),
  clearSpamStateForGuild: vi.fn(),
}));
vi.mock('../detectors/duplicate.js', () => ({
  DuplicateDetector: vi.fn().mockImplementation(() => ({ name: 'duplicate', detect: vi.fn() })),
  clearDuplicateStateForGuild: vi.fn(),
}));
vi.mock('../detectors/link.js', () => ({
  LinkDetector: vi.fn().mockImplementation(() => ({ name: 'link', detect: vi.fn() })),
  clearLinkStateForGuild: vi.fn(),
}));

vi.mock('../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { handleMessageCreate } from './messageCreate.js';
import { logger } from '../logger/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(opts: {
  isBot?: boolean;
  inGuild?: boolean;
  content?: string;
}): Message {
  return {
    author: { bot: opts.isBot ?? false },
    inGuild: () => opts.inGuild ?? true,
    guildId: 'guild-1',
    id: 'msg-1',
    content: opts.content ?? 'hello',
  } as unknown as Message;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleMessageCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Gate: ignore bots and DMs
  // -------------------------------------------------------------------------

  it('ignores messages from bots', async () => {
    await handleMessageCreate(makeMessage({ isBot: true }));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('ignores DM messages (not in a guild)', async () => {
    await handleMessageCreate(makeMessage({ inGuild: false }));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('processes guild messages from non-bot users', async () => {
    await handleMessageCreate(makeMessage({}));
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('passes the message object to pipeline.run', async () => {
    const msg = makeMessage({});
    await handleMessageCreate(msg);
    expect(mockRun).toHaveBeenCalledWith(msg);
  });

  // -------------------------------------------------------------------------
  // Content edge cases — pipeline should still be called
  // -------------------------------------------------------------------------

  it('processes a message with empty string content', async () => {
    await handleMessageCreate(makeMessage({ content: '' }));
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('processes a message with only whitespace', async () => {
    await handleMessageCreate(makeMessage({ content: '   ' }));
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('processes a message with 4000 characters (Discord max)', async () => {
    await handleMessageCreate(makeMessage({ content: 'a'.repeat(4000) }));
    expect(mockRun).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Error handling — must not propagate errors to the caller
  // -------------------------------------------------------------------------

  it('catches pipeline errors and logs them without rethrowing', async () => {
    mockRun.mockRejectedValueOnce(new Error('pipeline exploded'));
    await expect(handleMessageCreate(makeMessage({}))).resolves.toBeUndefined();
  });

  it('logs the error message when the pipeline throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('boom'));
    await handleMessageCreate(makeMessage({}));
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      'Unhandled error in message pipeline',
      expect.objectContaining({ error: 'boom' }),
    );
  });

  it('logs error with guildId context when pipeline throws', async () => {
    mockRun.mockRejectedValueOnce(new Error('fail'));
    await handleMessageCreate(makeMessage({}));
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ guildId: 'guild-1' }),
    );
  });

  // -------------------------------------------------------------------------
  // Bot + DM combined
  // -------------------------------------------------------------------------

  it('ignores a bot message even if it is in a guild', async () => {
    await handleMessageCreate(makeMessage({ isBot: true, inGuild: true }));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('ignores a non-bot DM message', async () => {
    await handleMessageCreate(makeMessage({ isBot: false, inGuild: false }));
    expect(mockRun).not.toHaveBeenCalled();
  });
});
