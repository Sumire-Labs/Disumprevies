import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserPoints } from './points.js';
import { DECAY_POINTS_PER_MS } from './thresholds.js';

vi.mock('../db.js', () => ({
  prisma: {
    infraction: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../db.js';

describe('getUserPoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when there are no infractions', async () => {
    vi.mocked(prisma.infraction.findMany).mockResolvedValue([]);
    const total = await getUserPoints('guild-1', 'user-1');
    expect(total).toBe(0);
  });

  it('returns full points for a very recent infraction (< 1ms old)', async () => {
    const now = new Date();
    vi.mocked(prisma.infraction.findMany).mockResolvedValue([
      {
        id: 1,
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'WARN' as const,
        reason: 'test',
        points: 3,
        moderator: null,
        auto: true,
        expiresAt: null,
        createdAt: now,
      },
    ]);
    const total = await getUserPoints('guild-1', 'user-1');
    // Decay is negligible for a just-created infraction
    expect(total).toBeCloseTo(3, 1);
  });

  it('decays points by 1 after 24 hours', async () => {
    const msIn24h = 24 * 60 * 60 * 1000;
    const createdAt = new Date(Date.now() - msIn24h);
    vi.mocked(prisma.infraction.findMany).mockResolvedValue([
      {
        id: 1,
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'WARN' as const,
        reason: 'test',
        points: 3,
        moderator: null,
        auto: true,
        expiresAt: null,
        createdAt,
      },
    ]);
    const total = await getUserPoints('guild-1', 'user-1');
    expect(total).toBeCloseTo(2, 1); // 3 - 1 decay
  });

  it('clamps decayed points to 0 (never negative)', async () => {
    // 10 days old with only 1 point — should fully decay
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const createdAt = new Date(Date.now() - tenDaysMs);
    vi.mocked(prisma.infraction.findMany).mockResolvedValue([
      {
        id: 1,
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'WARN' as const,
        reason: 'test',
        points: 1,
        moderator: null,
        auto: true,
        expiresAt: null,
        createdAt,
      },
    ]);
    const total = await getUserPoints('guild-1', 'user-1');
    expect(total).toBe(0);
  });

  it('sums multiple infractions with independent decay', async () => {
    const msIn12h = 12 * 60 * 60 * 1000;
    const halfDecay = DECAY_POINTS_PER_MS * msIn12h; // 0.5 points decayed

    const createdAt = new Date(Date.now() - msIn12h);
    vi.mocked(prisma.infraction.findMany).mockResolvedValue([
      {
        id: 1,
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'WARN' as const,
        reason: 'a',
        points: 2,
        moderator: null,
        auto: true,
        expiresAt: null,
        createdAt,
      },
      {
        id: 2,
        guildId: 'guild-1',
        userId: 'user-1',
        type: 'WARN' as const,
        reason: 'b',
        points: 2,
        moderator: null,
        auto: true,
        expiresAt: null,
        createdAt,
      },
    ]);
    const total = await getUserPoints('guild-1', 'user-1');
    // Each 2pt infraction loses 0.5pt after 12h → 1.5pt each → total 3pt
    expect(total).toBeCloseTo((2 - halfDecay) * 2, 2);
  });
});
