import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Client } from 'discord.js';

const { mockUpdateGuildSettings, mockGetGuildSettings, mockPrismaFindUnique } = vi.hoisted(() => ({
  mockUpdateGuildSettings: vi.fn(),
  mockGetGuildSettings: vi.fn(),
  mockPrismaFindUnique: vi.fn(),
}));

vi.mock('../../settings/cache.js', () => ({
  updateGuildSettings: mockUpdateGuildSettings,
  getGuildSettings: mockGetGuildSettings,
}));

vi.mock('../../db.js', () => ({
  prisma: {
    guild: {
      findUnique: mockPrismaFindUnique,
    },
  },
}));

vi.mock('../../logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  activateRaidMode,
  deactivateRaidMode,
  isRaidModeActive,
  clearRaidModeStateForGuild,
} from '../raidMode.js';

function makeDefaultSettings(raidModeOverrides: Record<string, unknown> = {}) {
  return {
    raidMode: {
      active: false,
      activatedAt: null,
      activatedBy: null,
      autoDisableMinutes: 0,
      autoActivate: false,
      autoActivateSeverity: 'high',
      ...raidModeOverrides,
    },
  };
}

function makeClient(): Client {
  return {
    guilds: { cache: new Map([['guild-1', { id: 'guild-1' }]]) },
    channels: { cache: { get: () => undefined } },
  } as unknown as Client;
}

describe('isRaidModeActive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when raidMode.active is false', async () => {
    mockGetGuildSettings.mockResolvedValue(makeDefaultSettings({ active: false }));
    expect(await isRaidModeActive('guild-1')).toBe(false);
  });

  it('returns true when raidMode.active is true', async () => {
    mockGetGuildSettings.mockResolvedValue(makeDefaultSettings({ active: true }));
    expect(await isRaidModeActive('guild-1')).toBe(true);
  });
});

describe('activateRaidMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRaidModeStateForGuild('guild-1');
    mockPrismaFindUnique.mockResolvedValue(null);
  });

  afterEach(() => clearRaidModeStateForGuild('guild-1'));

  it('calls updateGuildSettings to set active=true', async () => {
    mockGetGuildSettings.mockResolvedValue(makeDefaultSettings({ active: false }));
    mockUpdateGuildSettings.mockImplementation(
      async (_id: string, updater: (s: unknown) => unknown) => updater(makeDefaultSettings()),
    );

    await activateRaidMode('guild-1', 'manual', makeClient());

    expect(mockUpdateGuildSettings).toHaveBeenCalledTimes(1);
    const updater = mockUpdateGuildSettings.mock.calls[0][1] as (s: ReturnType<typeof makeDefaultSettings>) => ReturnType<typeof makeDefaultSettings>;
    const updated = updater(makeDefaultSettings());
    expect(updated.raidMode.active).toBe(true);
    expect(updated.raidMode.activatedBy).toBe('manual');
  });

  it('does not activate when already active', async () => {
    mockGetGuildSettings.mockResolvedValue(makeDefaultSettings({ active: true }));
    await activateRaidMode('guild-1', 'manual', makeClient());
    expect(mockUpdateGuildSettings).not.toHaveBeenCalled();
  });
});

describe('deactivateRaidMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRaidModeStateForGuild('guild-1');
    mockPrismaFindUnique.mockResolvedValue(null);
  });

  afterEach(() => clearRaidModeStateForGuild('guild-1'));

  it('calls updateGuildSettings to set active=false', async () => {
    mockGetGuildSettings.mockResolvedValue(makeDefaultSettings({ active: true }));
    mockUpdateGuildSettings.mockImplementation(
      async (_id: string, updater: (s: unknown) => unknown) => updater(makeDefaultSettings({ active: true })),
    );

    await deactivateRaidMode('guild-1', makeClient());

    expect(mockUpdateGuildSettings).toHaveBeenCalledTimes(1);
    const updater = mockUpdateGuildSettings.mock.calls[0][1] as (s: ReturnType<typeof makeDefaultSettings>) => ReturnType<typeof makeDefaultSettings>;
    const updated = updater(makeDefaultSettings({ active: true }));
    expect(updated.raidMode.active).toBe(false);
    expect(updated.raidMode.activatedAt).toBeNull();
  });

  it('does not deactivate when already inactive', async () => {
    mockGetGuildSettings.mockResolvedValue(makeDefaultSettings({ active: false }));
    await deactivateRaidMode('guild-1', makeClient());
    expect(mockUpdateGuildSettings).not.toHaveBeenCalled();
  });
});

describe('clearRaidModeStateForGuild', () => {
  it('does not throw for unknown guild', () => {
    expect(() => clearRaidModeStateForGuild('unknown-guild')).not.toThrow();
  });
});
