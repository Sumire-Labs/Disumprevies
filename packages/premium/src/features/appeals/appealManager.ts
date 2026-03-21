/**
 * Appeal business logic (Premium).
 *
 * Handles:
 * - Creating a new appeal (with duplicate/cooldown checks)
 * - Approving an appeal (unmute / unban + DM user)
 * - Rejecting an appeal (update status + DM user)
 */

import { prisma, checkFeatureAccess, Feature, t } from '@disumprevies/core';
import type { Client } from 'discord.js';
import { AppealStatus, AppealType } from '@disumprevies/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_REASON_LENGTH = 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateAppealParams {
  guildId: string;
  userId: string;
  type: AppealType;
  reason: string;
  infractionId?: number;
}

export type CreateAppealResult =
  | { ok: true; appealId: number }
  | { ok: false; error: 'no_access' | 'already_pending' | 'cooldown' | 'reason_too_long' | 'guild_not_found' };

export type ApproveAppealResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'not_pending' };

export type RejectAppealResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'not_pending' };

// ---------------------------------------------------------------------------
// Create appeal
// ---------------------------------------------------------------------------

export async function createAppeal(params: CreateAppealParams): Promise<CreateAppealResult> {
  const { guildId, userId, type, reason, infractionId } = params;

  // Feature gate
  const hasAccess = await checkFeatureAccess(guildId, Feature.AppealSystem);
  if (!hasAccess) {
    return { ok: false, error: 'no_access' };
  }

  // Ensure guild exists
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { settings: true } });
  if (guild === null) {
    return { ok: false, error: 'guild_not_found' };
  }

  // Reason length check
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: 'reason_too_long' };
  }

  // Check for existing PENDING appeal
  const pending = await prisma.appeal.findFirst({
    where: { guildId, userId, status: AppealStatus.PENDING },
    select: { id: true },
  });
  if (pending !== null) {
    return { ok: false, error: 'already_pending' };
  }

  // Check cooldown — last REJECTED appeal must be > cooldownHours ago
  const cooldownHours = resolveCooldownHours(guild.settings);
  if (cooldownHours > 0) {
    const since = new Date(Date.now() - cooldownHours * 3_600_000);
    const recentRejection = await prisma.appeal.findFirst({
      where: { guildId, userId, status: AppealStatus.REJECTED, updatedAt: { gte: since } },
      select: { id: true },
    });
    if (recentRejection !== null) {
      return { ok: false, error: 'cooldown' };
    }
  }

  // Create the appeal
  const appeal = await prisma.appeal.create({
    data: {
      guildId,
      userId,
      type,
      reason,
      status: AppealStatus.PENDING,
      ...(infractionId !== undefined ? { infractionId } : {}),
    },
    select: { id: true },
  });

  return { ok: true, appealId: appeal.id };
}

// ---------------------------------------------------------------------------
// Approve appeal
// ---------------------------------------------------------------------------

export async function approveAppeal(
  appealId: number,
  reviewerId: string,
  client: Client,
): Promise<ApproveAppealResult> {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (appeal === null) return { ok: false, error: 'not_found' };
  if (appeal.status !== AppealStatus.PENDING) return { ok: false, error: 'not_pending' };

  // Update status first (optimistic)
  await prisma.appeal.update({
    where: { id: appealId },
    data: { status: AppealStatus.APPROVED, reviewerId },
  });

  // Try to lift the punishment via Discord API
  const guild = await client.guilds.fetch(appeal.guildId).catch(() => null);
  if (guild !== null) {
    if (appeal.type === AppealType.BAN) {
      await guild.bans.remove(appeal.userId, 'Appeal approved').catch(() => undefined);
    } else {
      const member = await guild.members.fetch(appeal.userId).catch(() => null);
      if (member !== null) {
        await member.disableCommunicationUntil(null, 'Appeal approved').catch(() => undefined);
      }
    }
  }

  // DM the user
  const user = await client.users.fetch(appeal.userId).catch(() => null);
  if (user !== null) {
    const guildName = guild?.name ?? appeal.guildId;
    const msg = await t(appeal.guildId, 'appeal_approved_user', { guildName });
    await user.send(msg).catch(() => undefined);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reject appeal
// ---------------------------------------------------------------------------

export async function rejectAppeal(
  appealId: number,
  reviewerId: string,
  reviewNote: string,
  client: Client,
): Promise<RejectAppealResult> {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (appeal === null) return { ok: false, error: 'not_found' };
  if (appeal.status !== AppealStatus.PENDING) return { ok: false, error: 'not_pending' };

  await prisma.appeal.update({
    where: { id: appealId },
    data: { status: AppealStatus.REJECTED, reviewerId, reviewNote },
  });

  // DM the user
  const user = await client.users.fetch(appeal.userId).catch(() => null);
  if (user !== null) {
    const guild = await client.guilds.fetch(appeal.guildId).catch(() => null);
    const guildName = guild?.name ?? appeal.guildId;
    const msg = await t(appeal.guildId, 'appeal_rejected_user', { guildName, reason: reviewNote });
    await user.send(msg).catch(() => undefined);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCooldownHours(rawSettings: unknown): number {
  if (rawSettings === null || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    return 72;
  }
  const settings = rawSettings as Record<string, unknown>;
  const appeals = settings['appeals'];
  if (appeals === null || typeof appeals !== 'object' || Array.isArray(appeals)) {
    return 72;
  }
  const cooldownHours = (appeals as Record<string, unknown>)['cooldownHours'];
  return typeof cooldownHours === 'number' && cooldownHours >= 0 ? cooldownHours : 72;
}
