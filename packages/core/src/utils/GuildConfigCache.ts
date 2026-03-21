// ---------------------------------------------------------------------------
// GuildConfigCache
//
// Two caches, both with a configurable TTL (default 60 s):
//
//   1. configCache  — stores the full GuildConfig (guild settings JSON,
//                     exemptRoles, logChannel, modChannel) fetched via an
//                     upsert so missing guilds are auto-created.
//
//   2. wordFilterCache — stores per-guild WordFilter patterns with compiled
//                        RegExp objects so the detector avoids re-compiling
//                        on every message.
//
// Call invalidate(guildId) whenever guild settings or word-filter patterns
// change so the next request fetches fresh data from the database.
// ---------------------------------------------------------------------------

import { prisma } from '../db.js';
import { logger } from '../logger/index.js';
import { DEFAULT_SETTINGS } from '../settings/types.js';

// ---------------------------------------------------------------------------
// GuildConfig — the shape the pipeline and detectors consume
// ---------------------------------------------------------------------------

export interface GuildConfig {
  guildId: string;
  /** Raw guild settings JSON from the DB (merged with defaults at read time). */
  settings: Record<string, unknown>;
  /** Discord role IDs that bypass all detection. */
  exemptRoles: string[];
  /** Discord channel ID for infraction-log embeds (null = disabled). */
  logChannelId: string | null;
  /** Discord channel ID for mod-team notifications (null = disabled). */
  modChannelId: string | null;
}

// ---------------------------------------------------------------------------
// CompiledWordFilter — pattern entry with pre-compiled RegExp
// ---------------------------------------------------------------------------

export interface CompiledWordFilter {
  pattern: string;
  isRegex: boolean;
  /** Pre-compiled RegExp for regex patterns; null for plain-string patterns
   *  or if the stored pattern is an invalid regex. */
  compiled: RegExp | null;
}

// ---------------------------------------------------------------------------
// Internal cache entry shapes
// ---------------------------------------------------------------------------

interface ConfigEntry {
  config: GuildConfig;
  cachedAt: number;
}

interface WordFilterEntry {
  patterns: CompiledWordFilter[];
  cachedAt: number;
}

// ---------------------------------------------------------------------------
// TTL resolution
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 60_000;

function resolveTtlMs(): number {
  const raw = process.env['GUILD_CONFIG_TTL_MS'];
  if (raw === undefined) return DEFAULT_TTL_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

// ---------------------------------------------------------------------------
// GuildConfigCache class
// ---------------------------------------------------------------------------

export class GuildConfigCache {
  private readonly configCache = new Map<string, ConfigEntry>();
  private readonly wordFilterCache = new Map<string, WordFilterEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  // ---------------------------------------------------------------------------
  // GuildConfig
  // ---------------------------------------------------------------------------

  /**
   * Return the cached GuildConfig for a guild, fetching from the DB if the
   * cache is empty or expired.  Auto-creates the Guild row if it doesn't exist
   * (via upsert), matching the behaviour the pipeline had before.
   */
  async get(guildId: string): Promise<GuildConfig> {
    const entry = this.configCache.get(guildId);
    if (entry !== undefined && Date.now() - entry.cachedAt < this.ttlMs) {
      return entry.config;
    }
    return this.fetchAndCache(guildId);
  }

  /** Invalidate both the config and word-filter cache for a guild. */
  invalidate(guildId: string): void {
    this.configCache.delete(guildId);
    this.wordFilterCache.delete(guildId);
  }

  /** Invalidate all cached guild configs and word-filter patterns. */
  invalidateAll(): void {
    this.configCache.clear();
    this.wordFilterCache.clear();
  }

  /**
   * Warm the cache for multiple guilds in parallel.
   * Use this on bot startup to avoid a DB round-trip on the first message.
   */
  async preload(guildIds: readonly string[]): Promise<void> {
    await Promise.all(guildIds.map((id) => this.get(id)));
  }

  // ---------------------------------------------------------------------------
  // WordFilter patterns
  // ---------------------------------------------------------------------------

  /**
   * Return compiled word-filter patterns for a guild, fetching from the DB
   * if the cache is empty or expired.
   * Invalid regex patterns are skipped (logged as warnings).
   */
  async getWordFilters(guildId: string): Promise<CompiledWordFilter[]> {
    const entry = this.wordFilterCache.get(guildId);
    if (entry !== undefined && Date.now() - entry.cachedAt < this.ttlMs) {
      return entry.patterns;
    }
    return this.fetchAndCacheWordFilters(guildId);
  }

  /** Invalidate only the word-filter cache for a guild. */
  invalidateWordFilters(guildId: string): void {
    this.wordFilterCache.delete(guildId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchAndCache(guildId: string): Promise<GuildConfig> {
    const guild = await prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
      select: {
        id: true,
        settings: true,
        exemptRoles: true,
        logChannel: true,
        modChannel: true,
      },
    });

    const config: GuildConfig = {
      guildId: guild.id,
      settings:
        guild.settings !== null && typeof guild.settings === 'object'
          ? (guild.settings as Record<string, unknown>)
          : (DEFAULT_SETTINGS as unknown as Record<string, unknown>),
      exemptRoles: guild.exemptRoles,
      logChannelId: guild.logChannel,
      modChannelId: guild.modChannel,
    };

    this.configCache.set(guildId, { config, cachedAt: Date.now() });
    return config;
  }

  private async fetchAndCacheWordFilters(guildId: string): Promise<CompiledWordFilter[]> {
    const rows = await prisma.wordFilter.findMany({ where: { guildId } });

    const patterns: CompiledWordFilter[] = rows.map((row) => {
      if (!row.isRegex) {
        return { pattern: row.pattern, isRegex: false, compiled: null };
      }
      try {
        return { pattern: row.pattern, isRegex: true, compiled: new RegExp(row.pattern, 'i') };
      } catch (err) {
        logger.warn('WordFilter: invalid regex pattern in DB (skipping)', {
          guildId,
          pattern: row.pattern,
          error: err instanceof Error ? err.message : String(err),
        });
        return { pattern: row.pattern, isRegex: true, compiled: null };
      }
    });

    this.wordFilterCache.set(guildId, { patterns, cachedAt: Date.now() });
    return patterns;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

export const guildConfigCache = new GuildConfigCache(resolveTtlMs());
