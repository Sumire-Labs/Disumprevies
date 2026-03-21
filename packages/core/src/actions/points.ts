import { prisma } from '../db.js';
import { withDbRetry } from '../utils/database.js';
import { DECAY_POINTS_PER_MS } from './thresholds.js';

// ---------------------------------------------------------------------------
// Point accumulation with decay
// ---------------------------------------------------------------------------

/**
 * Calculate the effective (decayed) points for a single infraction.
 * Points decay linearly at 1 pt / 24 h from the time the infraction was created.
 */
function decayedPoints(rawPoints: number, createdAt: Date, now: Date): number {
  const ageMs = now.getTime() - createdAt.getTime();
  const decayed = rawPoints - ageMs * DECAY_POINTS_PER_MS;
  return Math.max(0, decayed);
}

/**
 * Return the current effective point total for a user in a guild,
 * accounting for 24h linear decay on each past infraction.
 */
export async function getUserPoints(guildId: string, userId: string): Promise<number> {
  const now = new Date();
  const infractions = await withDbRetry(
    () =>
      prisma.infraction.findMany({
        where: { guildId, userId },
        select: { points: true, createdAt: true },
      }),
    { guildId, userId, operation: 'getUserPoints' },
  );

  return infractions.reduce((sum, inf) => {
    return sum + decayedPoints(inf.points, inf.createdAt, now);
  }, 0);
}

/**
 * Record an infraction and return the new effective total points.
 */
export async function addPoints(
  guildId: string,
  userId: string,
  points: number,
  reason: string,
  moderatorId?: string,
): Promise<number> {
  await withDbRetry(
    () =>
      prisma.infraction.create({
        data: {
          guildId,
          userId,
          type: 'WARN', // type will be updated by ActionExecutor after resolveAction
          reason,
          points,
          ...(moderatorId !== undefined ? { moderator: moderatorId } : {}),
          auto: true,
        },
      }),
    { guildId, userId, operation: 'addPoints' },
  );

  return getUserPoints(guildId, userId);
}
