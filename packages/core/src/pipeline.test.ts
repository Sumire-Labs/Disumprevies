import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, Guild, GuildMember } from 'discord.js';
import { DetectionPipeline, DETECTOR_NAME_TO_OVERRIDE_KEY } from './pipeline.js';
import type { Detector, DetectionResult, MessageDetectionContext } from './detectors/base.js';
import type { ActionExecutor, ActionResult } from './actions/index.js';
import {
  registerChannelOverrideResolver,
  clearChannelOverrideResolver,
} from './channel/channelOverrideRegistry.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./db.js', () => ({
  prisma: {
    guild: {
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ plan: 'FREE' }),
    },
  },
}));

vi.mock('./logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logInfractionToChannel: vi.fn(),
}));

import { prisma } from './db.js';
import { logger } from './logger/index.js';
import { guildConfigCache } from './utils/GuildConfigCache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGuild(id = 'guild-1', channels: Record<string, unknown> = {}): Guild {
  return {
    id,
    name: 'Test Guild',
    channels: {
      cache: {
        get: (channelId: string) => channels[channelId] ?? undefined,
      },
    },
  } as unknown as Guild;
}

function makeMember(
  userId = 'user-1',
  roleIds: string[] = [],
  guild?: Guild,
): GuildMember {
  return {
    user: { id: userId, bot: false },
    roles: { cache: new Map(roleIds.map((id) => [id, { id }])) },
    guild: guild ?? makeGuild(),
    send: vi.fn(),
    disableCommunicationUntil: vi.fn(),
    kick: vi.fn(),
    ban: vi.fn(),
  } as unknown as GuildMember;
}

function makeMessage(
  content = 'hello',
  guild?: Guild,
  member?: GuildMember,
  channelId = 'channel-1',
): Message<true> {
  const g = guild ?? makeGuild();
  const m = member ?? makeMember('user-1', [], g);
  return {
    content,
    id: 'msg-1',
    channelId,
    guildId: g.id,
    author: { bot: false },
    guild: g,
    member: m,
    inGuild: () => true,
    deletable: false,
    delete: vi.fn(),
  } as unknown as Message<true>;
}

function makeDetector(result: DetectionResult | null): Detector {
  return {
    name: 'test-detector',
    detect: vi.fn().mockResolvedValue(result),
  };
}

function makeExecutor(result: ActionResult): ActionExecutor {
  return { execute: vi.fn().mockResolvedValue(result) } as unknown as ActionExecutor;
}

function mockGuildConfig(
  guildId = 'guild-1',
  override: Partial<{
    settings: unknown;
    exemptRoles: string[];
    logChannel: string | null;
    modChannel: string | null;
  }> = {},
) {
  vi.mocked(prisma.guild.upsert).mockResolvedValue({
    id: guildId,
    settings: override.settings ?? {},
    exemptRoles: override.exemptRoles ?? [],
    logChannel: override.logChannel ?? null,
    modChannel: override.modChannel ?? null,
    plan: 'FREE' as const,
    locale: 'en',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DetectionPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guildConfigCache.invalidateAll();
  });

  it('auto-creates guild record and runs detectors when guild is not in DB', async () => {
    // upsert returns the newly created record with empty settings
    vi.mocked(prisma.guild.upsert).mockResolvedValue({
      id: 'guild-1',
      settings: {},
      exemptRoles: [],
      logChannel: null,
      modChannel: null,
      plan: 'FREE' as const,
      locale: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const detector = makeDetector(null); // returns null = no violation
    const pipeline = new DetectionPipeline({ detectors: [detector] });

    await pipeline.run(makeMessage());

    // Detector should be called even for new guilds (with default settings)
    expect(detector.detect).toHaveBeenCalledOnce();
    // upsert should have been called to create/update the guild record
    expect(vi.mocked(prisma.guild.upsert)).toHaveBeenCalledOnce();
  });

  it('skips when member is exempt', async () => {
    mockGuildConfig('guild-1', { exemptRoles: ['exempt-role'] });
    const detector = makeDetector({ detectorName: 'test', points: 1, reason: 'r', action: 'delete' });
    const pipeline = new DetectionPipeline({ detectors: [detector] });
    const member = makeMember('user-1', ['exempt-role']);
    const message = makeMessage('hello', makeGuild(), member);

    await pipeline.run(message);

    expect(detector.detect).not.toHaveBeenCalled();
  });

  it('calls executor when a detector triggers', async () => {
    mockGuildConfig();
    const detectionResult: DetectionResult = {
      detectorName: 'test',
      points: 1,
      reason: 'test reason',
      action: 'delete',
    };
    const detector = makeDetector(detectionResult);
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    await pipeline.run(makeMessage());

    expect(executor.execute).toHaveBeenCalledOnce();
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'test reason', eventPoints: 1 }),
    );
  });

  it('stops at the first triggered detector', async () => {
    mockGuildConfig();
    const first = makeDetector({ detectorName: 'd1', points: 1, reason: 'first', action: 'delete' });
    const second = makeDetector({ detectorName: 'd2', points: 1, reason: 'second', action: 'delete' });
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({ detectors: [first, second], executor });

    await pipeline.run(makeMessage());

    expect(first.detect).toHaveBeenCalledOnce();
    expect(second.detect).not.toHaveBeenCalled();
  });

  it('runs next detector if first returns null', async () => {
    mockGuildConfig();
    const first = makeDetector(null);
    const second = makeDetector({ detectorName: 'd2', points: 1, reason: 'second', action: 'delete' });
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({ detectors: [first, second], executor });

    await pipeline.run(makeMessage());

    expect(first.detect).toHaveBeenCalledOnce();
    expect(second.detect).toHaveBeenCalledOnce();
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it('logs a debug message when no detectors trigger', async () => {
    mockGuildConfig();
    const detector = makeDetector(null);
    const pipeline = new DetectionPipeline({ detectors: [detector] });

    await pipeline.run(makeMessage());

    expect(vi.mocked(logger.debug)).toHaveBeenCalledWith(
      'No detectors triggered',
      expect.any(Object),
    );
  });

  it('passes member roles to exempt check', async () => {
    mockGuildConfig('guild-1', { exemptRoles: ['mod-role'] });
    const detector = makeDetector({ detectorName: 'test', points: 1, reason: 'r', action: 'delete' });
    const pipeline = new DetectionPipeline({ detectors: [detector] });
    // member does NOT have the exempt role
    const member = makeMember('user-1', ['some-other-role']);
    const message = makeMessage('hello', makeGuild(), member);

    await pipeline.run(message);

    expect(detector.detect).toHaveBeenCalledOnce();
  });

  it('handles a detector throwing without crashing the pipeline', async () => {
    mockGuildConfig();
    const throwing: Detector = {
      name: 'bad-detector',
      detect: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const pipeline = new DetectionPipeline({ detectors: [throwing] });

    await expect(pipeline.run(makeMessage())).resolves.toBeUndefined();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      'Detector threw an error',
      expect.objectContaining({ detector: 'bad-detector' }),
    );
  });

  // -------------------------------------------------------------------------
  // Content edge cases
  // -------------------------------------------------------------------------

  it('runs detectors for a message with empty string content', async () => {
    mockGuildConfig();
    const detector = makeDetector(null);
    const pipeline = new DetectionPipeline({ detectors: [detector] });

    await pipeline.run(makeMessage(''));

    expect(detector.detect).toHaveBeenCalledOnce();
  });

  it('runs detectors for a message with only whitespace', async () => {
    mockGuildConfig();
    const detector = makeDetector(null);
    const pipeline = new DetectionPipeline({ detectors: [detector] });

    await pipeline.run(makeMessage('   '));

    expect(detector.detect).toHaveBeenCalledOnce();
  });

  it('runs detectors for a message with 4000 characters (Discord max)', async () => {
    mockGuildConfig();
    const detector = makeDetector(null);
    const pipeline = new DetectionPipeline({ detectors: [detector] });

    await pipeline.run(makeMessage('a'.repeat(4000)));

    expect(detector.detect).toHaveBeenCalledOnce();
  });

  it('skips when member is null (DM or webhook)', async () => {
    mockGuildConfig();
    const detector = makeDetector({ detectorName: 'test', points: 1, reason: 'r', action: 'delete' });
    const pipeline = new DetectionPipeline({ detectors: [detector] });

    const guild = makeGuild();
    const message = {
      content: 'hello',
      id: 'msg-dm',
      guildId: guild.id,
      author: { bot: false },
      guild,
      member: null,
      inGuild: () => true,
      deletable: false,
      delete: vi.fn(),
    } as unknown as Message<true>;

    await pipeline.run(message);

    expect(detector.detect).not.toHaveBeenCalled();
  });

  it('continues to next detector when first errors and second triggers', async () => {
    mockGuildConfig();
    const throwing: Detector = {
      name: 'error-detector',
      detect: vi.fn().mockRejectedValue(new Error('crash')),
    };
    const working = makeDetector({ detectorName: 'd2', points: 2, reason: 'caught', action: 'delete' });
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({ detectors: [throwing, working], executor });

    await pipeline.run(makeMessage());

    expect(vi.mocked(logger.error)).toHaveBeenCalled();
    expect(working.detect).toHaveBeenCalledOnce();
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it('logs info with guildId and detector name when detection is triggered', async () => {
    mockGuildConfig();
    const detector = makeDetector({ detectorName: 'spam', points: 3, reason: 'fast', action: 'delete' });
    const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
    const pipeline = new DetectionPipeline({ detectors: [detector], executor });

    await pipeline.run(makeMessage());

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      'Detection triggered',
      expect.objectContaining({ guildId: 'guild-1', detector: 'spam' }),
    );
  });

  // -------------------------------------------------------------------------
  // Channel overrides (Premium)
  // -------------------------------------------------------------------------

  describe('channel overrides', () => {
    beforeEach(() => {
      clearChannelOverrideResolver();
    });

    it('runs detector when no override resolver is registered (Free plan)', async () => {
      // No resolver registered — should behave as if all detectors are enabled
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'FREE' } as never);
      mockGuildConfig();

      const detector = makeDetector({ detectorName: 'spam', points: 1, reason: 'r', action: 'delete' });
      const executor = makeExecutor({ action: 'WARN', totalPoints: 3 });
      const pipeline = new DetectionPipeline({ detectors: [detector], executor });

      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-99'));

      expect(detector.detect).toHaveBeenCalledOnce();
    });

    it('skips detector when channel override returns false (Premium)', async () => {
      // Register a resolver that disables 'spam' for channel-99
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'PREMIUM' } as never);
      registerChannelOverrideResolver((_settings, channelId, detectorName) => {
        if (channelId === 'channel-99' && detectorName === 'spam') return false;
        return true;
      });
      mockGuildConfig();

      const spamDetector: Detector = { name: 'spam', detect: vi.fn().mockResolvedValue(null) };
      const pipeline = new DetectionPipeline({ detectors: [spamDetector] });

      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-99'));

      // Detector skipped due to channel override
      expect(spamDetector.detect).not.toHaveBeenCalled();
    });

    it('runs detector on another channel when override only disables one channel', async () => {
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'PREMIUM' } as never);
      registerChannelOverrideResolver((_settings, channelId, detectorName) => {
        if (channelId === 'channel-99' && detectorName === 'spam') return false;
        return true;
      });
      mockGuildConfig();

      const spamDetector: Detector = { name: 'spam', detect: vi.fn().mockResolvedValue(null) };
      const pipeline = new DetectionPipeline({ detectors: [spamDetector] });

      // Different channel — override does not apply
      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-50'));

      expect(spamDetector.detect).toHaveBeenCalledOnce();
    });

    it('does not apply channel overrides for Free plan (no feature access)', async () => {
      // Even with a resolver registered, Free plan gets no override access
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'FREE' } as never);
      // This resolver would disable spam, but plan is FREE so it should be ignored
      registerChannelOverrideResolver(() => false);
      mockGuildConfig();

      const spamDetector: Detector = { name: 'spam', detect: vi.fn().mockResolvedValue(null) };
      const pipeline = new DetectionPipeline({ detectors: [spamDetector] });

      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-99'));

      // Free plan: override ignored, detector runs
      expect(spamDetector.detect).toHaveBeenCalledOnce();
    });

    // -----------------------------------------------------------------------
    // DETECTOR_NAME_TO_OVERRIDE_KEY mapping tests
    // -----------------------------------------------------------------------

    it('DETECTOR_NAME_TO_OVERRIDE_KEY maps all detector names to the correct override keys', () => {
      // Verify the mapping covers all expected detectors and keys match
      // what is stored in Guild.settings.channelOverrides.
      expect(DETECTOR_NAME_TO_OVERRIDE_KEY['spam']).toBe('spam');
      expect(DETECTOR_NAME_TO_OVERRIDE_KEY['duplicate']).toBe('duplicate');
      expect(DETECTOR_NAME_TO_OVERRIDE_KEY['mention']).toBe('mention');
      expect(DETECTOR_NAME_TO_OVERRIDE_KEY['link']).toBe('link');
      expect(DETECTOR_NAME_TO_OVERRIDE_KEY['invite']).toBe('invite');
      // Critical: the word-filter detector uses name 'word-filter' but the
      // channelOverrides key is 'wordFilter' (camelCase). This mapping is
      // non-obvious and was a potential source of bugs.
      expect(DETECTOR_NAME_TO_OVERRIDE_KEY['word-filter']).toBe('wordFilter');
    });

    it('skips word-filter detector when channelOverrides.wordFilter is false (Premium)', async () => {
      // Verifies that the 'word-filter' → 'wordFilter' mapping is applied correctly
      // in the pipeline: the resolver receives 'wordFilter', not 'word-filter'.
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'PREMIUM' } as never);
      registerChannelOverrideResolver((_settings, channelId, detectorName) => {
        if (channelId === 'channel-99' && detectorName === 'wordFilter') return false;
        return true;
      });
      mockGuildConfig();

      // WordFilterDetector has name 'word-filter'
      const wordFilterDetector: Detector = {
        name: 'word-filter',
        detect: vi.fn().mockResolvedValue(null),
      };
      const pipeline = new DetectionPipeline({ detectors: [wordFilterDetector] });

      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-99'));

      // Detector skipped: 'word-filter' maps to 'wordFilter' in the resolver call
      expect(wordFilterDetector.detect).not.toHaveBeenCalled();
    });

    it('runs word-filter detector in a different channel when override targets only channel-99', async () => {
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'PREMIUM' } as never);
      registerChannelOverrideResolver((_settings, channelId, detectorName) => {
        if (channelId === 'channel-99' && detectorName === 'wordFilter') return false;
        return true;
      });
      mockGuildConfig();

      const wordFilterDetector: Detector = {
        name: 'word-filter',
        detect: vi.fn().mockResolvedValue(null),
      };
      const pipeline = new DetectionPipeline({ detectors: [wordFilterDetector] });

      // channel-50 is NOT in the override → detector should run
      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-50'));

      expect(wordFilterDetector.detect).toHaveBeenCalledOnce();
    });

    it('detectors not in the override map are always enabled regardless of resolver', async () => {
      vi.mocked(prisma.guild.findUnique).mockResolvedValue({ plan: 'PREMIUM' } as never);
      // Resolver returns false for everything — but 'basic-raid' is not in the map
      registerChannelOverrideResolver(() => false);
      mockGuildConfig();

      const raidDetector: Detector = {
        name: 'basic-raid', // not in DETECTOR_NAME_TO_OVERRIDE_KEY
        detect: vi.fn().mockResolvedValue(null),
      };
      const pipeline = new DetectionPipeline({ detectors: [raidDetector] });

      await pipeline.run(makeMessage('hello', undefined, undefined, 'channel-99'));

      // Not in the map → override not applied → detector runs
      expect(raidDetector.detect).toHaveBeenCalledOnce();
    });
  });
});
