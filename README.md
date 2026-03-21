# Disumprevies

Discord anti-raid and anti-spam bot — open-core model.

| Package | License | Description |
|---------|---------|-------------|
| `packages/core` | MIT | Core bot: detection pipeline, moderation commands, i18n |
| `packages/premium` | BSL 1.1 | Advanced raid detection, appeal system, analytics |

---

## Features

### Free (MIT)

- **Spam Detection** — blocks message floods (configurable rate/window per guild)
- **Duplicate Detection** — catches repeated identical messages
- **Mention Abuse** — flags @everyone/@here and mass-mention messages
- **Link Spam** — rate-limits URL posting
- **Invite Detection** — blocks Discord invite links (per-guild whitelist)
- **Word Filter** — plain-string and regex patterns (up to 50 per guild)
- **Point-based Actions** — automatic WARN → MUTE → KICK → BAN escalation with decay
- **Moderation Commands** — `/warn` `/mute` `/unmute` `/kick` `/ban` `/unban` `/history`
- **Interactive Settings UI** — configure everything via `/settings`
- **Infraction History** — paginated per-user audit log
- **i18n** — English and Japanese; more languages via PRs
- **Exempt Roles** — exclude moderator roles from detection

### Premium (BSL 1.1)

- **Advanced Raid Detection** — coordinated join surge detection
- **Appeal System** — user-facing ban/mute appeal workflow
- **Analytics** — infraction trends and detector hit-rate charts
- **Multi-server Sync** — shared blocklists and banlists across owned servers
- **Unlimited** word filter patterns, punishment thresholds, and exempt roles

---

## Self-hosting

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| PostgreSQL | ≥ 15 |

### 1. Clone the repository

```bash
git clone https://github.com/your-org/disumprevies.git
cd disumprevies
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Discord application credentials (from https://discord.com/developers/applications)
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here

# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/disumprevies

# Optional
LOG_LEVEL=info           # debug | info | warn | error  (default: info)
NODE_ENV=production      # development | production       (default: development)
```

### 4. Set up the database

```bash
# Generate the Prisma client
pnpm prisma:generate

# Run database migrations
pnpm prisma:migrate
```

### 5. Build the project

```bash
pnpm build
```

### 6. Deploy slash commands

Register commands with Discord (required once, and again after adding new commands):

```bash
# Deploy to a specific guild (instant, for testing)
GUILD_ID=your_guild_id node packages/core/dist/commands/deploy.js

# Deploy globally (up to 1 hour propagation)
node packages/core/dist/commands/deploy.js --global
```

### 7. Start the bot

```bash
node packages/core/dist/bot/index.js
```

For development with hot-reload:

```bash
pnpm dev
```

---

## Docker

### Quick start with Docker Compose

```bash
cp .env.example .env
# Edit .env with your Discord credentials

docker compose up -d
```

This starts:
- `bot` — the Disumprevies bot container
- `db` — PostgreSQL 16

Migrations run automatically on startup.

### Manual Docker build

```bash
docker build -t disumprevies .
docker run --env-file .env disumprevies
```

---

## Bot Invite Link

Generate an invite URL from the [Discord Developer Portal](https://discord.com/developers/applications):

1. Open your application → **OAuth2 → URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions:
   - Manage Messages
   - Moderate Members (timeout)
   - Kick Members
   - Ban Members
   - View Channels
   - Send Messages
   - Read Message History
   - Embed Links
4. Copy the generated URL and share it with server administrators

Required permission integer: `1099511696384`

---

## Contributing

Contributions are welcome. Please follow the guidelines below.

### Development setup

```bash
pnpm install
pnpm build
pnpm test
```

### Running tests

```bash
# All tests
pnpm test

# Single file
pnpm --filter @disumprevies/core test -- src/detectors/__tests__/spam.test.ts

# With coverage
pnpm --filter @disumprevies/core exec vitest run --coverage
```

### Coding conventions

- **No `any` type** — use `unknown` and narrow with type guards
- **No hardcoded IDs or secrets** — use `src/config.ts` and environment variables
- **All user-facing strings through i18n** — use `t(guildId, key)` or `tSync(key)`
- **Each detector is a single file** in `src/detectors/` implementing the `Detector` interface
- **Each slash command is a single file** in `src/commands/`
- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- **Branch naming**: `feat/xxx`, `fix/xxx`, `refactor/xxx`

### Adding a new detector

1. Create `packages/core/src/detectors/myDetector.ts` implementing `Detector`
2. Write unit tests in `packages/core/src/detectors/__tests__/myDetector.test.ts`
3. Register the detector in `packages/core/src/events/messageCreate.ts`
4. Add settings keys to `GuildSettings` in `src/settings/types.ts`
5. Add i18n keys to `locales/en/messages.json` and `locales/ja/messages.json`
6. Update `docs/SPEC.md`

### Adding a new locale (translation)

See **[locales/CONTRIBUTING.md](locales/CONTRIBUTING.md)** for the full guide.

### Pull request checklist

- [ ] `pnpm build` passes
- [ ] `pnpm test` passes (no regressions)
- [ ] New i18n keys added for all user-facing strings
- [ ] Docs updated if behaviour changed

---

## Project structure

```
packages/
  core/       — MIT-licensed bot (main entry point)
  premium/    — BSL-licensed premium features
locales/
  en/messages.json   — English translations
  ja/messages.json   — Japanese translations
docs/
  SPEC.md      — Full requirements specification
  DATABASE.md  — Schema design and index strategy
  PREMIUM.md   — Free vs premium matrix and pricing
```

---

## License

| Component | License |
|-----------|---------|
| `packages/core` | [MIT](packages/core/LICENSE) |
| `packages/premium` | [Business Source License 1.1](packages/premium/LICENSE) |

**Open-core model:** The core bot is fully MIT — free to use, modify, and self-host without restriction. The premium package is BSL 1.1; it converts to MIT 4 years after each release. Commercial use of the premium package requires a separate license.
