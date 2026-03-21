# Disumprevies — Database Schema Design

## Provider

PostgreSQL 15+ via Prisma ORM v5.

Migration files are managed with `prisma migrate dev` (development) and `prisma migrate deploy` (production).

---

## Schema Overview

```
Guild ──< Infraction
Guild ──< WordFilter
```

---

## Models

### Guild

Central configuration record created when the bot first encounters a server (upserted on settings write).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `String` (PK) | Discord guild (server) snowflake ID |
| `plan` | `Plan` | Subscription tier: `FREE` or `PREMIUM` (default: `FREE`) |
| `locale` | `String` | UI language code (default: `"en"`) |
| `settings` | `Json` | Serialised `GuildSettings` object (see below) |
| `exemptRoles` | `String[]` | Discord role IDs excluded from all detection |
| `logChannel` | `String?` | Discord channel ID for infraction log embeds |
| `modChannel` | `String?` | Discord channel ID for mod-team notifications |
| `createdAt` | `DateTime` | Row creation timestamp |
| `updatedAt` | `DateTime` | Auto-updated on every write |

#### `settings` JSON Structure

The `settings` JSON column holds a `GuildSettings` object with the following shape:

```jsonc
{
  "spam":      { "enabled": true, "threshold": 5, "windowSeconds": 5 },
  "duplicate": { "enabled": true, "threshold": 3 },
  "mention":   { "enabled": true, "threshold": 5 },
  "link":      { "enabled": true, "threshold": 3, "windowSeconds": 10 },
  "invite":    { "enabled": true, "threshold": 1, "whitelist": [] },
  "wordFilter":{ "enabled": true },
  "punishments": {
    "thresholds": [
      { "minPoints": 3,  "action": "WARN" },
      { "minPoints": 6,  "action": "MUTE", "muteDurationMinutes": 10 },
      { "minPoints": 9,  "action": "KICK" },
      { "minPoints": 12, "action": "BAN"  }
    ],
    "decayPerHour": 1
  }
}
```

Missing keys fall back to `DEFAULT_SETTINGS` at read time — forward-compatible with future detector additions.

---

### Infraction

Audit trail for every moderation action, both automatic (from the detection pipeline) and manual (from slash commands).

| Column | Type | Description |
|--------|------|-------------|
| `id` | `Int` (PK, auto-increment) | Surrogate primary key |
| `guildId` | `String` (FK → Guild) | Owning guild |
| `userId` | `String` | Discord user snowflake (target of the action) |
| `type` | `InfractionType` | `WARN`, `MUTE`, `KICK`, or `BAN` |
| `reason` | `String?` | Human-readable reason string |
| `points` | `Int` | Points added by this event (default: 1) |
| `moderator` | `String?` | Moderator's Discord user ID (`null` for auto-actions) |
| `auto` | `Boolean` | `true` if created by the pipeline; `false` for manual commands |
| `expiresAt` | `DateTime?` | Reserved for future temporary-infraction logic |
| `createdAt` | `DateTime` | Timestamp used for point decay calculations |

#### Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| Primary | `id` | Row lookup |
| Composite | `(guildId, userId)` | Fast per-user infraction history; used by `getUserPoints()` and `/history` |
| Composite | `(guildId, createdAt)` | Timeline queries for analytics and pruning |

#### Point Decay

Effective points for a user are calculated at query time:

```
effectivePoints = Σ max(0, infraction.points − floor(ageMs / MS_PER_DAY))
```

where `ageMs = now − infraction.createdAt`.

This avoids a background job while keeping decay logic simple and testable.

---

### WordFilter

Per-guild word and regex patterns used by `WordFilterDetector`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `Int` (PK, auto-increment) | Surrogate primary key |
| `guildId` | `String` (FK → Guild) | Owning guild |
| `pattern` | `String` | Plain string or regex source |
| `isRegex` | `Boolean` | `true` → compile as `RegExp`; `false` → substring match |
| `createdAt` | `DateTime` | Row creation timestamp |

#### Index

| Index | Columns | Purpose |
|-------|---------|---------|
| Composite | `(guildId)` | Bulk-fetch all patterns for a guild on each message |

#### Free Plan Limit

Free guilds may store up to **50 patterns**. Enforced at the settings UI level; `FREE_LIMITS.wordFilterPatterns = 50`.

---

## Enums

### Plan

```prisma
enum Plan {
  FREE
  PREMIUM
}
```

Stored on `Guild.plan`. Premium guilds unlock additional features via `checkFeatureAccess()`.

### InfractionType

```prisma
enum InfractionType {
  WARN   // Warning DM only
  MUTE   // Discord communication timeout
  KICK   // Server kick
  BAN    // Server ban
}
```

Severity increases left-to-right. Thresholds are configurable per guild.

---

## Migration Strategy

1. **Development:** `pnpm prisma:migrate` — creates a new migration file and applies it.
2. **Production:** `prisma migrate deploy` — applies pending migrations without prompting.
3. **Seeding:** Not required. Guild records are created on-demand via `upsert`.

### Adding a New Column

1. Edit `packages/core/prisma/schema.prisma`.
2. Run `pnpm prisma:migrate` with a descriptive name.
3. Update `GuildSettings` type and `DEFAULT_SETTINGS` in `src/settings/types.ts` if the column is settings-related.
4. The `parseSettings()` function in `src/settings/cache.ts` deep-merges with defaults, so existing DB rows remain forward-compatible without a data migration.

---

## Settings Cache

Guild settings are cached in-memory for **60 seconds** to avoid a DB round-trip on every message.

| Function | Description |
|----------|-------------|
| `getGuildSettings(guildId)` | Read from cache or DB; auto-creates defaults |
| `saveGuildSettings(guildId, settings)` | Persist to DB and refresh cache |
| `updateGuildSettings(guildId, updater)` | Merge-update helper |
| `invalidateSettingsCache(guildId)` | Force cache eviction (e.g. after premium upgrade) |
