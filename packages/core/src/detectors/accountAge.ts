import type { Client, GuildMember, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../logger/index.js';
import { guildConfigCache } from '../utils/GuildConfigCache.js';
import { t } from '../i18n/index.js';
import type { AccountAgeAction, AccountAgeConfig } from '../settings/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Default mute duration in minutes when action = 'mute' */
const DEFAULT_MUTE_MINUTES = 60;

// ---------------------------------------------------------------------------
// Parse AccountAgeConfig from raw settings JSON (deep-merge with defaults)
// ---------------------------------------------------------------------------

function parseAccountAgeConfig(raw: unknown): AccountAgeConfig {
  const defaults: AccountAgeConfig = { enabled: true, minDays: 7, action: 'notify' };

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const enabled = typeof obj['enabled'] === 'boolean' ? obj['enabled'] : defaults.enabled;
  const minDays =
    typeof obj['minDays'] === 'number' && obj['minDays'] > 0 ? obj['minDays'] : defaults.minDays;

  const rawAction = obj['action'];
  const action: AccountAgeAction =
    rawAction === 'notify' ||
    rawAction === 'kick' ||
    rawAction === 'ban' ||
    rawAction === 'mute'
      ? rawAction
      : defaults.action;

  return { enabled, minDays, action };
}

// ---------------------------------------------------------------------------
// AccountAgeFilter
//
// Triggered from the guildMemberAdd event handler.
// Checks whether the new member's account is younger than the configured
// minimum age (in days). If so, the configured action is taken.
//
// Skip conditions:
//   - Bot accounts
//   - Member has an exempt role
//   - Raid mode is active (handled before this in the event pipeline)
//   - Feature disabled in guild settings
//   - createdAt unavailable
// ---------------------------------------------------------------------------

export class AccountAgeFilter {
  readonly name = 'account-age';

  async check(member: GuildMember, client: Client): Promise<void> {
    if (member.user.bot) return;

    const guildId = member.guild.id;

    let config: Awaited<ReturnType<typeof guildConfigCache.get>>;
    try {
      config = await guildConfigCache.get(guildId);
    } catch (err) {
      logger.error('AccountAgeFilter: failed to fetch guild config', {
        guildId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Exempt check
    const memberRoleIds = [...member.roles.cache.keys()];
    if (memberRoleIds.some((id) => config.exemptRoles.includes(id))) {
      return;
    }

    const cfg = parseAccountAgeConfig(config.settings['accountAge']);
    if (!cfg.enabled) return;

    const createdTimestamp = member.user.createdTimestamp;
    // createdTimestamp is always present for real users, but guard just in case
    if (!Number.isFinite(createdTimestamp) || createdTimestamp <= 0) {
      logger.debug('AccountAgeFilter: createdTimestamp unavailable, skipping', {
        guildId,
        userId: member.user.id,
      });
      return;
    }

    const ageDays = (Date.now() - createdTimestamp) / MS_PER_DAY;

    if (ageDays >= cfg.minDays) return; // Account is old enough

    const ageDaysRounded = Math.floor(ageDays);

    logger.info('AccountAgeFilter: new account detected', {
      guildId,
      userId: member.user.id,
      ageDays: ageDaysRounded,
      minDays: cfg.minDays,
      action: cfg.action,
    });

    await this.executeAction(member, client, cfg, ageDaysRounded, guildId, config.logChannelId, config.modChannelId);
  }

  private async executeAction(
    member: GuildMember,
    client: Client,
    cfg: AccountAgeConfig,
    ageDays: number,
    guildId: string,
    logChannelId: string | null,
    modChannelId: string | null,
  ): Promise<void> {
    const guildName = member.guild.name;

    switch (cfg.action) {
      case 'notify':
        break; // fall through to sendNotification below

      case 'kick': {
        const reason = await t(guildId, 'account_age.kick_reason', { minDays: cfg.minDays });
        const dmMsg = await t(guildId, 'account_age.kick_dm', { guildName, minDays: cfg.minDays });
        await this.dmUser(member, dmMsg);
        await this.tryKick(member, reason, guildId);
        break;
      }

      case 'ban': {
        const reason = await t(guildId, 'account_age.ban_reason', { minDays: cfg.minDays });
        const dmMsg = await t(guildId, 'account_age.ban_dm', { guildName, minDays: cfg.minDays });
        await this.dmUser(member, dmMsg);
        await this.tryBan(member, reason, guildId);
        break;
      }

      case 'mute': {
        const until = new Date(Date.now() + DEFAULT_MUTE_MINUTES * 60 * 1000);
        const reason = await t(guildId, 'account_age.mute_reason', { minDays: cfg.minDays });
        const dmMsg = await t(guildId, 'account_age.mute_dm', {
          guildName,
          minDays: cfg.minDays,
          duration: DEFAULT_MUTE_MINUTES,
        });
        await this.dmUser(member, dmMsg);
        await this.tryMute(member, until, reason, guildId);
        break;
      }
    }

    await this.sendNotification(
      client,
      guildId,
      member.user.id,
      ageDays,
      cfg.minDays,
      cfg.action,
      logChannelId,
      modChannelId,
    );
  }

  private async dmUser(member: GuildMember, message: string): Promise<void> {
    try {
      await member.user.send(message);
    } catch {
      // DMs disabled — not a fatal error
    }
  }

  private async tryKick(member: GuildMember, reason: string, guildId: string): Promise<void> {
    try {
      await member.kick(reason);
    } catch (err) {
      logger.warn('AccountAgeFilter: failed to kick member', {
        guildId,
        userId: member.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async tryBan(member: GuildMember, reason: string, guildId: string): Promise<void> {
    try {
      await member.ban({ reason });
    } catch (err) {
      logger.warn('AccountAgeFilter: failed to ban member', {
        guildId,
        userId: member.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async tryMute(member: GuildMember, until: Date, reason: string, guildId: string): Promise<void> {
    try {
      await member.disableCommunicationUntil(until, reason);
    } catch (err) {
      logger.warn('AccountAgeFilter: failed to mute member', {
        guildId,
        userId: member.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async sendNotification(
    client: Client,
    guildId: string,
    userId: string,
    ageDays: number,
    minDays: number,
    action: AccountAgeAction,
    logChannelId: string | null,
    modChannelId: string | null,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle('⚠️ New Account Detected')
      .addFields(
        { name: 'User', value: `<@${userId}> (\`${userId}\`)`, inline: true },
        { name: 'Account Age', value: `${ageDays} day(s)`, inline: true },
        { name: 'Minimum Required', value: `${minDays} day(s)`, inline: true },
        { name: 'Action Taken', value: action.toUpperCase(), inline: true },
      )
      .setTimestamp();

    if (logChannelId !== null) {
      const ch = client.channels.cache.get(logChannelId);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        try {
          await (ch as TextChannel).send({ embeds: [embed] });
        } catch (err) {
          logger.error('AccountAgeFilter: failed to send log embed', {
            channelId: logChannelId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (modChannelId !== null) {
      const ch = client.channels.cache.get(modChannelId);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        try {
          await (ch as TextChannel).send({
            content: `⚠️ New account <@${userId}> joined (${ageDays} day(s) old). Action: **${action.toUpperCase()}**.`,
            allowedMentions: { parse: [] },
          });
        } catch (err) {
          logger.error('AccountAgeFilter: failed to send mod notification', {
            channelId: modChannelId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

}
