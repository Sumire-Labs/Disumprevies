# Disumprevies — Requirements Specification

## Overview

Disumprevies is a Discord anti-raid and anti-spam public bot built on an open-core model.

| Layer | License | Purpose |
|-------|---------|---------|
| `packages/core` | MIT | Basic moderation: spam/duplicate/mention/link/invite/word-filter, infraction tracking, slash commands, i18n |
| `packages/premium` | BSL 1.1 | Advanced raid detection, appeal system, analytics, multi-server sync |

The bot is self-hostable. A managed hosted service will be offered as SaaS.

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript (strict mode, ES2022, NodeNext modules) |
| Runtime | Node.js ≥ 20 |
| Discord library | discord.js v14 |
| Database | PostgreSQL 15+ |
| ORM | Prisma v5 |
| Package manager | pnpm (workspaces monorepo) |
| Linter / Formatter | ESLint + Prettier |
| Test framework | Vitest |

---

## Architecture

### Detection Pipeline

Every moderation action follows this invariant pipeline:

```
Discord Event
      │
      ▼
 Exempt check ──── is member exempt? ──► skip (return)
      │ no
      ▼
 Config fetch   (Guild.settings + exemptRoles from DB, cached 60s)
      │
      ▼
 Detector loop  (ordered, first match wins)
   ├─ MentionDetector
   ├─ InviteDetector
   ├─ WordFilterDetector
   ├─ SpamDetector
   ├─ DuplicateDetector
   └─ LinkDetector
      │ triggered
      ▼
 ActionExecutor
   ├─ Delete triggering message (if deletable)
   ├─ addPoints() → accumulate with decay (1pt/24h default)
   ├─ resolveAction() → threshold lookup
   ├─ DM user (localised)
   ├─ Apply Discord moderation (timeout / kick / ban)
   └─ Record Infraction in DB
      │
      ▼
 Log to Discord channel (optional, embed)
```

Channel-level config overrides are reserved for future implementation without requiring changes to individual detectors.

### Point System

- Each detection event adds N points to the user's running total.
- Points decay linearly: 1 pt per 24 hours by default (configurable per guild).
- Effective points = Σ(infraction.points) − elapsed_days_since_each_infraction.
- When total effective points reach a threshold, the corresponding action fires.

### Feature Gating

All premium feature access is controlled through a single function:

```typescript
checkFeatureAccess(guildId: string, feature: Feature): Promise<boolean>
```

This is the **single source of truth** and must never be bypassed.

---

## Modules

### Phase 1 — Core (Complete)

| Module | Status | Description |
|--------|--------|-------------|
| Word Filter | ✅ Done | Per-guild plain-string and regex patterns stored in DB |
| Spam Detection | ✅ Done | N messages in T seconds per user (sliding window) |
| Duplicate Detection | ✅ Done | N identical messages per user (content hash) |
| Mention Abuse | ✅ Done | @everyone/@here or ≥ N mentions in one message |
| Link Spam | ✅ Done | N URLs in T seconds per user |
| Invite Detection | ✅ Done | Discord invite links with per-guild whitelist |
| Infraction Tracking | ✅ Done | DB-backed WARN/MUTE/KICK/BAN with auto flag |
| Action Executor | ✅ Done | Point accumulation, decay, threshold resolution |
| Moderation Commands | ✅ Done | /warn /mute /unmute /kick /ban /unban /history |
| Settings UI | ✅ Done | Interactive slash-command settings menu per guild |
| i18n | ✅ Done | English + Japanese, guild-selectable locale |
| Structured Logging | ✅ Done | Console + Discord embed channel logger |
| Feature Gate | ✅ Done | `checkFeatureAccess()` with FREE/PREMIUM plan enum |

### Phase 2 — Premium (Planned)

| Module | Status | Description |
|--------|--------|-------------|
| Advanced Raid Detection | 🚧 Skeleton | ML-assisted join surge + coordinated message detection |
| Appeal System | 📋 Planned | Users submit ban/mute appeals; mods approve/reject via bot |
| Analytics Dashboard | 📋 Planned | Per-guild infraction trends, detector hit rates |
| Multi-server Sync | 📋 Planned | Share blocklists and ban lists across owned servers |

### Phase 3 — Slash Command Extensions (Planned)

| Module | Status | Description |
|--------|--------|-------------|
| Raid Lock | 📋 Planned | One-command server lockdown (prevent joins, slow-mode all) |
| Auto-prune | 📋 Planned | Scheduled removal of expired infractions |
| Leaderboard | 📋 Planned | Top-N infractions per user for admin dashboards |

### Phase 4 — Web Dashboard (Planned)

| Module | Status | Description |
|--------|--------|-------------|
| Next.js Dashboard | 📋 Planned | `packages/dashboard` — guild settings UI in browser |
| OAuth2 Login | 📋 Planned | Discord OAuth2 for server admins |
| Real-time Log Feed | 📋 Planned | WebSocket-pushed live infraction feed |

---

## Detector Specifications

### SpamDetector
- **Trigger:** ≥ N messages from the same user within T seconds (default: 5 msg / 5s)
- **Points:** 3
- **State:** Per-user timestamp ring buffer (in-memory, cleared on process restart)
- **Config keys:** `spam.enabled`, `spam.threshold`, `spam.windowSeconds`

### DuplicateDetector
- **Trigger:** ≥ N identical messages (same content hash) from the same user (default: 3)
- **Points:** 2
- **State:** Per-user content hash history (in-memory)
- **Config keys:** `duplicate.enabled`, `duplicate.threshold`

### MentionDetector
- **Trigger (a):** `@everyone` or `@here` → 3 pts
- **Trigger (b):** ≥ N unique user mentions in one message (default: 5) → 3 pts
- **Config keys:** `mention.enabled`, `mention.threshold`

### InviteDetector
- **Trigger:** Discord invite link (`discord.gg/...`) that is not on the guild whitelist
- **Points:** 2
- **Config keys:** `invite.enabled`, `invite.whitelist[]`

### WordFilterDetector
- **Trigger:** Message content matches any stored pattern (plain string or regex)
- **Points:** 1
- **Storage:** `WordFilter` table (per guild)
- **Config keys:** `wordFilter.enabled`
- **Free limit:** 50 patterns per guild

### LinkDetector
- **Trigger:** ≥ N URLs in T seconds from the same user (default: 3 links / 10s)
- **Points:** 2
- **Config keys:** `link.enabled`, `link.threshold`, `link.windowSeconds`

---

## Moderation Commands

All commands require `ManageGuild` or `ModerateMembers` permission depending on action.

| Command | Permission | Description |
|---------|-----------|-------------|
| `/warn <user> [reason]` | ModerateMembers | Issue manual warning + DM |
| `/mute <user> <duration> [reason]` | ModerateMembers | Discord timeout |
| `/unmute <user>` | ModerateMembers | Remove timeout |
| `/kick <user> [reason]` | KickMembers | Kick from server |
| `/ban <user> [days] [reason]` | BanMembers | Ban from server |
| `/unban <user-id>` | BanMembers | Revoke ban |
| `/history <user>` | ModerateMembers | Paginated infraction log |
| `/settings` | ManageGuild | Interactive settings menu |

---

## i18n

- Locale files: `locales/{locale}/messages.json`
- Supported at launch: `en` (English), `ja` (Japanese)
- Guild admins select locale via `/settings → Language`
- Fallback: English for any missing key
- All user-facing strings must use `t(guildId, key, params)` — no hardcoded text

---

## Constraints & Invariants

1. **No `any` type** — Use `unknown` and narrow.
2. **No hardcoded Discord IDs or secrets** — All via environment variables.
3. **All user-facing strings through i18n** — `t()` or `tSync()`.
4. **Single pipeline** — Every message event goes through `DetectionPipeline.run()`.
5. **Feature gate must not be bypassed** — `checkFeatureAccess()` for all premium features.
6. **Catch at event handler level** — Errors logged with structured logger; never silently swallowed.
7. **Exact optional property types** — TypeScript `exactOptionalPropertyTypes: true`; use spread pattern.
