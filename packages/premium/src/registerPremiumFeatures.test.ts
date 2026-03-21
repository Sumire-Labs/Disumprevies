/**
 * Tests for registerPremiumFeatures — the bridge function that eliminates the
 * pnpm virtual-store dual-module problem in Docker/dist environments.
 *
 * The fix: bot/index.ts imports each registry function from its LOCAL file path
 * (same module instance as the pipeline) and passes them to registerPremiumFeatures.
 * Premium uses those function references instead of importing @disumprevies/core
 * itself, so all writes go to the correct module instance.
 *
 * These tests verify that registerPremiumFeatures calls every registry once and
 * passes a function (not null), mirroring what bot/index.ts does at startup.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerPremiumFeatures } from './index.js';
import type { PremiumRegistries } from './index.js';

function makeMockRegistries(): PremiumRegistries {
  return {
    registerRaidAnalyzer: vi.fn(),
    registerChannelProtectorHandler: vi.fn(),
    registerModAbuseHandler: vi.fn(),
    registerChannelOverrideResolver: vi.fn(),
    registerAppealDmRowProvider: vi.fn(),
    registerAppealInteractionHandlers: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('registerPremiumFeatures', () => {
  it('calls every registry function exactly once', () => {
    const mocks = makeMockRegistries();
    registerPremiumFeatures(mocks);

    expect(mocks.registerRaidAnalyzer).toHaveBeenCalledOnce();
    expect(mocks.registerChannelProtectorHandler).toHaveBeenCalledOnce();
    expect(mocks.registerModAbuseHandler).toHaveBeenCalledOnce();
    expect(mocks.registerChannelOverrideResolver).toHaveBeenCalledOnce();
    expect(mocks.registerAppealDmRowProvider).toHaveBeenCalledOnce();
    expect(mocks.registerAppealInteractionHandlers).toHaveBeenCalledOnce();
  });

  it('passes a function to each registry (not null or undefined)', () => {
    const captured: Record<string, unknown> = {};
    const mocks: PremiumRegistries = {
      registerRaidAnalyzer: vi.fn((fn) => { captured['raidAnalyzer'] = fn; }),
      registerChannelProtectorHandler: vi.fn((fn) => { captured['channelProtector'] = fn; }),
      registerModAbuseHandler: vi.fn((fn) => { captured['modAbuse'] = fn; }),
      registerChannelOverrideResolver: vi.fn((fn) => { captured['channelOverride'] = fn; }),
      registerAppealDmRowProvider: vi.fn((fn) => { captured['appealDm'] = fn; }),
      registerAppealInteractionHandlers: vi.fn((btn, modal) => {
        captured['appealBtn'] = btn;
        captured['appealModal'] = modal;
      }),
    };

    registerPremiumFeatures(mocks);

    for (const [key, value] of Object.entries(captured)) {
      expect(typeof value, `${key} should be a function`).toBe('function');
    }
  });

  it('channelOverrideResolver delegates to resolveDetectorEnabled', () => {
    let capturedResolver: ((...args: unknown[]) => unknown) | null = null;
    const mocks = makeMockRegistries();
    mocks.registerChannelOverrideResolver = vi.fn((fn) => {
      capturedResolver = fn as (...args: unknown[]) => unknown;
    });

    registerPremiumFeatures(mocks);

    expect(capturedResolver).not.toBeNull();
    // Calling with a settings object that has no channel overrides should
    // fall through to the guild-level enabled flag (default: true for spam).
    const result = (capturedResolver as (s: object, c: string, d: string) => boolean)(
      {
        spam: { enabled: true, threshold: 5, windowSeconds: 5 },
        channelOverrides: {},
      },
      '123456789012345678',
      'spam',
    );
    expect(result).toBe(true);
  });

  it('can be called multiple times (idempotent registrations do not throw)', () => {
    const mocks = makeMockRegistries();
    expect(() => {
      registerPremiumFeatures(mocks);
      registerPremiumFeatures(mocks);
    }).not.toThrow();
    // Each call registers once more
    expect(mocks.registerChannelOverrideResolver).toHaveBeenCalledTimes(2);
  });
});
