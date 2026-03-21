# Disumprevies

Discord anti-raid/anti-spam public bot. Open-core model (core: MIT, premium: BSL).

## Tech Stack

- Language: TypeScript (strict mode)
- Runtime: Node.js 20+
- Discord library: discord.js v14+
- Database: PostgreSQL
- ORM: Prisma
- Package manager: pnpm
- Monorepo: pnpm workspaces
- Linter/Formatter: ESLint + Prettier (run automatically)

## Repository Layout

```
packages/
  core/       — MIT licensed bot (main entry point)
  premium/    — BSL licensed premium features
  dashboard/  — Next.js web dashboard (Phase 4)
locales/      — i18n translation JSON files
docs/         — documentation
```

## Architecture

Every detection module follows the shared pipeline:

```
Event → Exempt check (role) → Config fetch → Detect → Action → Log
```

Config fetch is abstracted so channel-level overrides can be added later without changing detectors.

Feature gating uses `checkFeatureAccess(guildId, feature)` — NEVER bypass this for premium features.

## Commands

```bash
pnpm install          # install all deps
pnpm dev              # start bot in dev mode (packages/core)
pnpm build            # build all packages
pnpm lint             # eslint
pnpm format           # prettier --write
pnpm test             # vitest
pnpm prisma:migrate   # run prisma migrations
pnpm prisma:generate  # generate prisma client
```

## Coding Rules

- NEVER use `any` type. Use `unknown` and narrow.
- NEVER hardcode Discord IDs or secrets. Use environment variables via `src/config.ts`.
- All user-facing strings MUST go through the i18n system (`t('key', { params })`). NEVER hardcode user-facing text.
- Each detector module is a single file in `src/detectors/` exporting a class that implements `Detector` interface.
- Slash commands go in `src/commands/`, one file per command, using discord.js `SlashCommandBuilder`.
- Use `async/await`, never raw `.then()` chains.
- Error handling: catch at event handler level, log with structured logger, never silently swallow errors.

## Testing

- Framework: Vitest
- Run single test: `pnpm test -- path/to/file.test.ts`
- Always write tests for detector logic and action logic.
- Use in-memory SQLite for test DB via Prisma.

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Branch naming: `feat/xxx`, `fix/xxx`, `refactor/xxx`

## Important Context

- @docs/SPEC.md for full requirements specification
- @docs/DATABASE.md for schema design details
- @docs/PREMIUM.md for free vs premium feature matrix