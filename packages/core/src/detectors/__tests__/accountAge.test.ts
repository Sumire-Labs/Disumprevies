import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client, GuildMember } from 'discord.js';
import { AccountAgeFilter } from '../accountAge.js';
import { guildConfigCache } from '../../utils/GuildConfigCache.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../utils/GuildConfigCache.js', () => ({
  guildConfigCache: { get: vi.fn() },
}));

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn().mockResolvedValue('i18n-string'),
}));

vi.mock('../../logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();
/** 30 days old — above any realistic threshold */
const OLD_TS = NOW - 30 * 24 * 60 * 60 * 1000;
/** 3 days old — below the default 7-day threshold */
const NEW_TS = NOW - 3 * 24 * 60 * 60 * 1000;

interface ConfigOpts {
  accountAge?: Record<string, unknown>;
  exemptRoles?: string[];
  logChannelId?: string | null;
  modChannelId?: string | null;
}

function makeConfig(opts: ConfigOpts = {}) {
  const settings: Record<string, unknown> = {};
  if (opts.accountAge !== undefined) settings['accountAge'] = opts.accountAge;
  return {
    guildId: 'guild-1',
    settings,
    exemptRoles: opts.exemptRoles ?? [],
    logChannelId: opts.logChannelId ?? null,
    modChannelId: opts.modChannelId ?? null,
  };
}

function makeMember(opts: {
  userId?: string;
  bot?: boolean;
  createdTimestamp?: number;
  roleIds?: string[];
  kick?: ReturnType<typeof vi.fn>;
  ban?: ReturnType<typeof vi.fn>;
  mute?: ReturnType<typeof vi.fn>;
  send?: ReturnType<typeof vi.fn>;
} = {}): GuildMember {
  return {
    user: {
      id: opts.userId ?? 'user-1',
      bot: opts.bot ?? false,
      createdTimestamp: opts.createdTimestamp ?? OLD_TS,
      send: opts.send ?? vi.fn().mockResolvedValue(undefined),
    },
    guild: { id: 'guild-1', name: 'Test Guild' },
    roles: { cache: new Map((opts.roleIds ?? []).map((id) => [id, { id }])) },
    kick: opts.kick ?? vi.fn().mockResolvedValue(undefined),
    ban: opts.ban ?? vi.fn().mockResolvedValue(undefined),
    disableCommunicationUntil: opts.mute ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as GuildMember;
}

function makeClient(): Client {
  return { channels: { cache: new Map() } } as unknown as Client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountAgeFilter', () => {
  let filter: AccountAgeFilter;
  const mockGet = vi.mocked(guildConfigCache.get);

  beforeEach(() => {
    filter = new AccountAgeFilter();
    vi.clearAllMocks();
    mockGet.mockResolvedValue(makeConfig());
  });

  it('skips bot accounts without fetching config', async () => {
    const member = makeMember({ bot: true, createdTimestamp: NEW_TS });
    await filter.check(member, makeClient());
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does nothing for an account old enough (above threshold)', async () => {
    const kick = vi.fn();
    const member = makeMember({ createdTimestamp: OLD_TS, kick });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
  });

  it('does not trigger when account age is exactly at minDays', async () => {
    // Use minDays=3 and account age = 3 days + 1 second → >= threshold → no action
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 3, action: 'kick' } }));
    const kick = vi.fn();
    const ts = NOW - (3 * 24 * 60 * 60 * 1000 + 1000);
    const member = makeMember({ createdTimestamp: ts, kick });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
  });

  it('skips when enabled is false', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: false, minDays: 7, action: 'kick' } }));
    const kick = vi.fn();
    const member = makeMember({ createdTimestamp: NEW_TS, kick });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
  });

  it('skips member with an exempt role', async () => {
    mockGet.mockResolvedValue(makeConfig({
      exemptRoles: ['role-exempt'],
      accountAge: { enabled: true, minDays: 7, action: 'kick' },
    }));
    const kick = vi.fn();
    const member = makeMember({ createdTimestamp: NEW_TS, roleIds: ['role-exempt'], kick });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
  });

  it('action=notify: sends no kick/ban/mute for new account', async () => {
    const kick = vi.fn();
    const ban = vi.fn();
    const mute = vi.fn();
    const member = makeMember({ createdTimestamp: NEW_TS, kick, ban, mute });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
    expect(ban).not.toHaveBeenCalled();
    expect(mute).not.toHaveBeenCalled();
  });

  it('action=kick: kicks the member and sends a DM', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 7, action: 'kick' } }));
    const kick = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const member = makeMember({ createdTimestamp: NEW_TS, kick, send });
    await filter.check(member, makeClient());
    expect(kick).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it('action=ban: bans the member and sends a DM', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 7, action: 'ban' } }));
    const ban = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const member = makeMember({ createdTimestamp: NEW_TS, ban, send });
    await filter.check(member, makeClient());
    expect(ban).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it('action=mute: times out the member and sends a DM', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 7, action: 'mute' } }));
    const mute = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const member = makeMember({ createdTimestamp: NEW_TS, mute, send });
    await filter.check(member, makeClient());
    expect(mute).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it('still kicks even if DM send fails', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 7, action: 'kick' } }));
    const kick = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockRejectedValue(new Error('DMs disabled'));
    const member = makeMember({ createdTimestamp: NEW_TS, kick, send });
    await filter.check(member, makeClient());
    expect(kick).toHaveBeenCalledOnce();
  });

  it('swallows kick failure and does not throw', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 7, action: 'kick' } }));
    const kick = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
    const member = makeMember({ createdTimestamp: NEW_TS, kick });
    await expect(filter.check(member, makeClient())).resolves.toBeUndefined();
  });

  it('uses custom minDays from settings', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 30, action: 'kick' } }));
    const kick = vi.fn().mockResolvedValue(undefined);
    // Account is 25 days old — below the 30-day threshold
    const member = makeMember({ createdTimestamp: NOW - 25 * 24 * 60 * 60 * 1000, kick });
    await filter.check(member, makeClient());
    expect(kick).toHaveBeenCalledOnce();
  });

  it('does not trigger when account is just above custom minDays', async () => {
    mockGet.mockResolvedValue(makeConfig({ accountAge: { enabled: true, minDays: 30, action: 'kick' } }));
    const kick = vi.fn();
    // Account is 35 days old — above the 30-day threshold
    const member = makeMember({ createdTimestamp: NOW - 35 * 24 * 60 * 60 * 1000, kick });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
  });

  it('handles guildConfigCache error gracefully without throwing', async () => {
    mockGet.mockRejectedValue(new Error('DB connection error'));
    const member = makeMember({ createdTimestamp: NEW_TS });
    await expect(filter.check(member, makeClient())).resolves.toBeUndefined();
  });

  it('skips when createdTimestamp is invalid', async () => {
    const kick = vi.fn();
    const member = makeMember({ createdTimestamp: NaN, kick });
    await filter.check(member, makeClient());
    expect(kick).not.toHaveBeenCalled();
  });
});
