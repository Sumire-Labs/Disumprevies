import { DiscordAPIError, EmbedBuilder } from 'discord.js';
import type { GuildMember, Message, TextChannel } from 'discord.js';
import type { InfractionType } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger/index.js';
import { t } from '../i18n/index.js';
import { getUserPoints, addPoints } from './points.js';
import { resolveAction } from './thresholds.js';
import type { ThresholdEntry } from './thresholds.js';
import { actionQueue } from '../utils/ActionQueue.js';
import { getAppealDmRowProvider } from './appealDmRegistry.js';

// ---------------------------------------------------------------------------
// Discord API error codes
// ---------------------------------------------------------------------------

const DISCORD_MISSING_PERMISSIONS = 50_013;
const DISCORD_CANNOT_DM = 50_007;

// How long (ms) before re-issuing the same punishment type is allowed.
// Prevents double-punishing the same user if the bot restarts mid-event.
const DOUBLE_PUNISHMENT_WINDOW_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionContext {
  guildId: string;
  member: GuildMember;
  reason: string;
  /** Points from the current detection event. */
  eventPoints: number;
  /** The message that triggered the detection (may be deleted). */
  message?: Message<true>;
  /** Discord channel to use for logging moderation actions. */
  logChannel?: TextChannel;
  /** Guild-configured punishment thresholds (falls back to hardcoded defaults if absent). */
  thresholds?: readonly ThresholdEntry[];
}

export interface ActionResult {
  action: InfractionType | 'none';
  totalPoints: number;
  muteDurationMinutes?: number;
}

// ---------------------------------------------------------------------------
// ActionExecutor
// ---------------------------------------------------------------------------

export class ActionExecutor {
  /**
   * Execute the full action lifecycle:
   * 1. Optionally delete the triggering message.
   * 2. Accumulate points.
   * 3. Resolve which action to take.
   * 4. Check for recent duplicate punishment (double-punishment prevention).
   * 5. DM the user.
   * 6. Execute the moderation action (warn / mute / kick / ban) via ActionQueue.
   * 7. Update the infraction type in the database.
   */
  async execute(ctx: ActionContext): Promise<ActionResult> {
    const { guildId, member, reason, eventPoints, message } = ctx;
    const userId = member.user.id;
    const guildName = member.guild.name;

    // Step 1 – delete triggering message
    if (message?.deletable) {
      await actionQueue.enqueue(async () => {
        try {
          await message.delete();
        } catch (err) {
          await this.handleDiscordError(err, 'deleteMessage', userId, guildId, ctx.logChannel);
        }
      });
    }

    // Step 2 – accumulate points
    const totalPoints = await addPoints(guildId, userId, eventPoints, reason);

    // Step 3 – resolve action (uses guild-configured thresholds if provided)
    const threshold = resolveAction(totalPoints, ctx.thresholds);
    if (threshold === undefined) {
      return { action: 'none', totalPoints };
    }

    const { action, muteDurationMinutes } = threshold;

    // Step 4 – double-punishment prevention
    // Skip the Discord moderation action if an identical punishment was
    // already issued within the last 30 seconds (e.g. after bot restart).
    const isDuplicate = await this.hasRecentPunishment(guildId, userId, action);
    if (isDuplicate) {
      logger.info('Skipping duplicate punishment', {
        guildId,
        userId,
        action,
        windowMs: DOUBLE_PUNISHMENT_WINDOW_MS,
      });
      return { action: 'none', totalPoints };
    }

    // Step 5 – DM the user
    await this.sendDm(guildId, member, action, reason, guildName, muteDurationMinutes, ctx.logChannel);

    // Step 6 – execute moderation action (queued to avoid rate-limit storms)
    await actionQueue.enqueue(async () => {
      await this.applyAction(member, action, reason, muteDurationMinutes, userId, guildId, ctx.logChannel);
    });

    // Step 7 – update the most recent auto-infraction type in DB
    await this.updateLastInfractionType(guildId, userId, action);

    logger.info('Action executed', { guildId, userId, action, totalPoints, reason });

    return { action, totalPoints, ...(muteDurationMinutes !== undefined ? { muteDurationMinutes } : {}) };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Returns true if the same type of automatic punishment was issued for this
   * user within the double-punishment window.  Protects against re-punishing
   * after a bot restart that resets in-memory detector state.
   */
  private async hasRecentPunishment(
    guildId: string,
    userId: string,
    action: InfractionType,
  ): Promise<boolean> {
    if (action === 'WARN') return false; // Duplicate warnings are fine.

    const since = new Date(Date.now() - DOUBLE_PUNISHMENT_WINDOW_MS);
    const recent = await prisma.infraction.findFirst({
      where: { guildId, userId, type: action, auto: true, createdAt: { gte: since } },
      select: { id: true },
    });
    return recent !== null;
  }

  private async sendDm(
    guildId: string,
    member: GuildMember,
    action: InfractionType,
    reason: string,
    guildName: string,
    muteDurationMinutes?: number,
    logChannel?: TextChannel,
  ): Promise<void> {
    const dmKeyMap: Record<InfractionType, string> = {
      WARN: 'warn_dm',
      MUTE: 'mute_dm',
      KICK: 'kick_dm',
      BAN: 'ban_dm',
    };
    const key = dmKeyMap[action];
    const duration =
      muteDurationMinutes !== undefined ? `${muteDurationMinutes}min` : undefined;

    // Build DM text using the guild's configured locale.
    const text = await t(guildId, key, {
      guildName,
      reason,
      ...(duration !== undefined ? { duration } : {}),
    });

    // Optionally attach an appeal button for BAN/MUTE (injected by Premium)
    const appealDmRow =
      action === 'BAN' || action === 'MUTE'
        ? (await getAppealDmRowProvider()?.(guildId, action)) ?? null
        : null;

    try {
      if (appealDmRow !== null) {
        await member.send({ content: text, components: [appealDmRow] });
      } else {
        await member.send(text);
      }
    } catch (err) {
      if (err instanceof DiscordAPIError && err.code === DISCORD_CANNOT_DM) {
        // DM disabled — log warning to Discord channel but continue punishment.
        logger.info('DM delivery failed: user has DMs disabled', {
          guildId,
          userId: member.user.id,
        });
        if (logChannel !== undefined) {
          const msg = await t(guildId, 'error.bot.dmDisabled', { userId: member.user.id });
          const embed = new EmbedBuilder().setColor(0xffa500).setDescription(msg).setTimestamp();
          void logChannel.send({ embeds: [embed] }).catch(() => undefined);
        }
      } else {
        logger.warn('Failed to send DM', {
          guildId,
          userId: member.user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async applyAction(
    member: GuildMember,
    action: InfractionType,
    reason: string,
    muteDurationMinutes?: number,
    userId?: string,
    guildId?: string,
    logChannel?: TextChannel,
  ): Promise<void> {
    try {
      switch (action) {
        case 'WARN':
          // No Discord API action for warn — DM is sufficient.
          break;
        case 'MUTE': {
          const durationMs = (muteDurationMinutes ?? 10) * 60 * 1000;
          await member.disableCommunicationUntil(Date.now() + durationMs, reason);
          break;
        }
        case 'KICK':
          await member.kick(reason);
          break;
        case 'BAN':
          await member.ban({ reason });
          break;
      }
    } catch (err) {
      await this.handleDiscordError(err, action, userId ?? member.user.id, guildId ?? member.guild.id, logChannel);
    }
  }

  /**
   * Classify a Discord API error and send an appropriate warning to the log
   * channel (if available).  The error is always logged to the console.
   */
  private async handleDiscordError(
    err: unknown,
    action: string,
    userId: string,
    guildId: string,
    logChannel?: TextChannel,
  ): Promise<void> {
    if (!(err instanceof DiscordAPIError)) {
      logger.error('Unexpected error during Discord action', {
        guildId,
        userId,
        action,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let i18nKey: string;
    let logContext: Record<string, unknown>;

    if (err.code === DISCORD_MISSING_PERMISSIONS) {
      // Determine if this is a role-hierarchy failure or a plain perms failure.
      const isHierarchy = err.message.toLowerCase().includes('hierarchy');

      if (isHierarchy) {
        i18nKey = 'error.bot.higherRole';
        logContext = { guildId, userId, action, code: err.code };
        logger.warn('Cannot moderate user: role hierarchy', logContext);
      } else {
        const permKeyMap: Record<string, string> = {
          MUTE: 'error.bot.missingPermissions.mute',
          deleteMessage: 'error.bot.missingPermissions.deleteMessage',
          KICK: 'error.bot.missingPermissions.kick',
          BAN: 'error.bot.missingPermissions.ban',
        };
        i18nKey = permKeyMap[action] ?? 'error.bot.action.generic';
        logContext = { guildId, userId, action, code: err.code };
        logger.warn('Bot missing permissions for action', logContext);
      }

      if (logChannel !== undefined) {
        const msg =
          i18nKey === 'error.bot.action.generic'
            ? await t(guildId, 'error.bot.action.generic', { action, userId, error: err.message })
            : await t(guildId, i18nKey, { userId });
        const embed = new EmbedBuilder().setColor(0xff0000).setDescription(msg).setTimestamp();
        void logChannel.send({ embeds: [embed] }).catch(() => undefined);
      }
    } else {
      // Any other Discord API error.
      const msg = await t(guildId, 'error.bot.action.generic', {
        action,
        userId,
        error: err.message,
      });
      logger.error('Discord API error during action', {
        guildId,
        userId,
        action,
        code: err.code,
        error: err.message,
      });
      if (logChannel !== undefined) {
        const embed = new EmbedBuilder().setColor(0xff0000).setDescription(msg).setTimestamp();
        void logChannel.send({ embeds: [embed] }).catch(() => undefined);
      }
    }
  }

  private async updateLastInfractionType(
    guildId: string,
    userId: string,
    type: InfractionType,
  ): Promise<void> {
    // Find the latest auto-infraction for this user and update its type
    const latest = await prisma.infraction.findFirst({
      where: { guildId, userId, auto: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latest !== null) {
      await prisma.infraction.update({
        where: { id: latest.id },
        data: { type },
      });
    }
  }
}
