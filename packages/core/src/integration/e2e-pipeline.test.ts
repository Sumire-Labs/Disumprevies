/**
 * Integration test: E2E detection pipeline flow
 *
 * Tests the full flow: message event → detector → action → log
 * All Discord API calls and DB queries are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, Guild, GuildMember, TextChannel } from 'discord.js';
import type { DetectionResult, Detector } from '../detectors/base.js';
import type { ActionResult } from '../actions/index.js';
import type { ActionExecutor } from '../actions/index.js';
import { DetectionPipeline } from '../pipeline.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../db.js', () => ({
  prisma: {
    guild: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ plan: 'FREE' }),
    },
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
import { logger, logInfractionToChannel } from '../logger/index.js';
import { guildConfigCache } from '../utils/GuildConfigCache.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeGuild(id = 'guild-e2e'): Guild {
  return {
    id,
    name: 'E2E Test Guild',
    channels: {
      cache: {
        get: (channelId: string): TextChannel | undefined => {
          if (channelId === 'log-channel-id') {
            return {
              id: channelId,
              isTextBased: () => true,
              isDMBased: () => false,
              send: vi.fn(),
            } as unknown as TextChannel;
          }
          return undefined;
        },
      },
    },
  } as unknown as Guild;
}

function makeMember(
  userId = 'user-e2e',
  roleIds: string[] = [],
  guild?: Guild,
): GuildMember {
  return {
    user: { id: userId, bot: false, tag: `testuser#0001` },
    roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
    guild: guild ?? makeGuild(),
    send: vi.fn().mockResolvedValue(undefined),
    disableCommunicationUntil: vi.fn().mockResolvedValue(undefined),
    kick: vi.fn().mockResolvedValue(undefined),
    ban: vi.fn().mockResolvedValue(undefined),
  } as unknown as GuildMember;
}

function makeMessage(
  content = 'test message',
  guild?: Guild,
  member?: GuildMember,
): Message<true> {
  const g = guild ?? makeGuild();
  const m = member ?? makeMember('user-e2e', [], g);
  return {
    content,
    id: 'msg-e2e-1',
    guildId: g.id,
    author: { bot: false, tag: 'testuser#0001' },
    guild: g,
    member: m,
    inGuild: () => true,
    deletable: true,
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as Message<true>;
}

function mockGuildInDb(options: {
  guildId?: string;
  exemptRoles?: string[];
  logChannelId?: string | null;
  modChannelId?: string | null;
} = {}): void {
  vi.mocked(prisma.guild.upsert).mockResolvedValue({
    id: options.guildId ?? 'guild-e2e',
    plan: 'FREE' as const,
    locale: 'en',
    settings: {},
    exemptRoles: options.exemptRoles ?? [],
    logChannel: options.logChannelId ?? null,
    modChannel: options.modChannelId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeSpamDetector(result: DetectionResult | null): Detector {
  return {
    name: 'spam',
    detect: vi.fn().mockResolvedValue(result),
  };
}

function makeExecutor(result: ActionResult): ActionExecutor {
  return {
    execute: vi.fn().mockResolvedValue(result),
  } as unknown as ActionExecutor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E pipeline flow: detect → action → log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guildConfigCache.invalidateAll();
  });

  it('full flow: message triggers detector, executor runs, info is logged', async () => {
    mockGuildInDb();

    const detectionResult: DetectionResult = {
      detectorName: 'spam',
      points: 3,
      reason: 'Sending messages too fast',
      action: 'delete',
    };
    const actionResult: ActionResult = { action: 'WARN', totalPoints: 3 };

    const detector = makeSpamDetector(detectionResult);
    const executor = makeExecutor(actionResult);
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    const message = makeMessage();
    await pipeline.run(message);

    // Detector was invoked
    expect(detector.detect).toHaveBeenCalledOnce();

    // Executor received correct params
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-e2e',
        reason: 'Sending messages too fast',
        eventPoints: 3,
      }),
    );

    // Pipeline logged the outcome
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      'Detection triggered',
      expect.objectContaining({
        guildId: 'guild-e2e',
        detector: 'spam',
        action: 'WARN',
      }),
    );
  });

  it('posts to log channel when logChannel is configured and action is not none', async () => {
    mockGuildInDb({ logChannelId: 'log-channel-id' });

    const detectionResult: DetectionResult = {
      detectorName: 'invite',
      points: 2,
      reason: 'Posted a Discord invite link',
      action: 'delete',
    };
    const actionResult: ActionResult = { action: 'WARN', totalPoints: 6 };

    const detector = makeSpamDetector(detectionResult);
    const executor = makeExecutor(actionResult);
    const guild = makeGuild();
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    await pipeline.run(makeMessage('discord.gg/xyz', guild));

    expect(vi.mocked(logInfractionToChannel)).toHaveBeenCalledOnce();
    expect(vi.mocked(logInfractionToChannel)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WARN',
        reason: 'Posted a Discord invite link',
        totalPoints: 6,
      }),
    );
  });

  it('does NOT post to log channel when action is none', async () => {
    mockGuildInDb({ logChannelId: 'log-channel-id' });

    const detectionResult: DetectionResult = {
      detectorName: 'wordFilter',
      points: 1,
      reason: 'Matched word filter',
      action: 'delete',
    };
    const actionResult: ActionResult = { action: 'none', totalPoints: 1 };

    const detector = makeSpamDetector(detectionResult);
    const executor = makeExecutor(actionResult);
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    await pipeline.run(makeMessage('bad word here'));

    expect(vi.mocked(logInfractionToChannel)).not.toHaveBeenCalled();
  });

  it('does NOT post to log channel when no logChannel is configured', async () => {
    mockGuildInDb({ logChannelId: null });

    const detectionResult: DetectionResult = {
      detectorName: 'spam',
      points: 3,
      reason: 'Spam',
      action: 'delete',
    };
    const actionResult: ActionResult = { action: 'WARN', totalPoints: 3 };

    const detector = makeSpamDetector(detectionResult);
    const executor = makeExecutor(actionResult);
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    await pipeline.run(makeMessage());

    expect(vi.mocked(logInfractionToChannel)).not.toHaveBeenCalled();
  });

  it('skips exempt members and does not call executor', async () => {
    mockGuildInDb({ exemptRoles: ['mod-role'] });

    const detector = makeSpamDetector({
      detectorName: 'spam',
      points: 3,
      reason: 'Spam',
      action: 'delete',
    });
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    const guild = makeGuild();
    const member = makeMember('mod-user', ['mod-role'], guild);
    const message = makeMessage('hello', guild, member);

    await pipeline.run(message);

    expect(detector.detect).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('runs multiple detectors until one triggers', async () => {
    mockGuildInDb();

    const nullDetector: Detector = {
      name: 'word-filter',
      detect: vi.fn().mockResolvedValue(null),
    };
    const triggeringDetector: Detector = {
      name: 'spam',
      detect: vi.fn().mockResolvedValue({
        detectorName: 'spam',
        points: 3,
        reason: 'Too fast',
        action: 'delete',
      } satisfies DetectionResult),
    };
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({
      detectors: [nullDetector, triggeringDetector],
      executor,
    });

    await pipeline.run(makeMessage());

    expect(nullDetector.detect).toHaveBeenCalledOnce();
    expect(triggeringDetector.detect).toHaveBeenCalledOnce();
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it('handles bot messages being ignored at the event handler level', async () => {
    // This tests the handleMessageCreate guard (bot.author.bot === true)
    const botMessage = {
      author: { bot: true },
      inGuild: () => true,
    } as unknown as Message;

    // The event handler should return early — no pipeline interaction
    const { handleMessageCreate } = await import('../events/messageCreate.js');
    await handleMessageCreate(botMessage);

    // No guild DB query should have been triggered
    expect(vi.mocked(prisma.guild.upsert)).not.toHaveBeenCalled();
  });

  it('handles DM messages being ignored at the event handler level', async () => {
    const dmMessage = {
      author: { bot: false },
      inGuild: () => false,
    } as unknown as Message;

    const { handleMessageCreate } = await import('../events/messageCreate.js');
    await handleMessageCreate(dmMessage);

    expect(vi.mocked(prisma.guild.upsert)).not.toHaveBeenCalled();
  });
});
