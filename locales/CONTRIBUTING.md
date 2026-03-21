# Translating Disumprevies

Disumprevies uses a simple JSON-based i18n system. All user-facing strings live in locale files. Adding a new language requires only a JSON file and a small code change — no build tooling is needed.

---

## File structure

```
locales/
  en/
    messages.json   ← English (reference locale, always complete)
  ja/
    messages.json   ← Japanese
  {locale}/
    messages.json   ← your new language here
```

Each `messages.json` is a flat JSON object. Keys are dot-separated identifiers; values are the translated strings. Placeholders use `{paramName}` syntax.

---

## Step-by-step: add a new language

### 1. Copy the English file

English is the reference locale and is always complete. Start from it:

```bash
# Example: adding French (fr)
cp locales/en/messages.json locales/fr/messages.json
```

### 2. Translate all values

Open `locales/fr/messages.json` and translate every **value**. Do not change the **keys**.

```jsonc
// Before (English)
"command.warn.success": "✅ **{tag}** has been warned.\n**Reason:** {reason}",

// After (French)
"command.warn.success": "✅ **{tag}** a été averti.\n**Raison :** {reason}",
```

Rules:
- Keep all `{placeholder}` tokens exactly as-is (spelling, braces, case).
- Preserve Markdown formatting (`**bold**`, `\n` newlines, Discord mentions like `<@{userId}>`).
- Do not add or remove keys — keep the same set as `locales/en/messages.json`.
- If you are unsure about a string, leave the English value for now and add a comment in your PR.

### 3. Register the locale in the i18n module

Edit `packages/core/src/i18n/index.ts` and add your locale code to the `SUPPORTED_LOCALES` set:

```typescript
// Before
const SUPPORTED_LOCALES = new Set(['en', 'ja']);

// After
const SUPPORTED_LOCALES = new Set(['en', 'ja', 'fr']);
```

### 4. Add the language option to the settings command

Edit `packages/core/src/commands/settings/language.ts` and add your language to the select-menu options list:

```typescript
{ label: 'Français', value: 'fr' },
```

### 5. Verify

Run the test suite to make sure nothing is broken:

```bash
pnpm test
```

Build the project:

```bash
pnpm build
```

### 6. Open a pull request

- **Title:** `i18n: add French (fr) locale`
- **Branch:** `feat/locale-fr`
- Include the new `locales/fr/messages.json` and the two code changes.
- If you are a native speaker, mark yourself as the translation reviewer.

---

## Translation file format

### Placeholder syntax

Placeholders are wrapped in curly braces: `{paramName}`.

| Placeholder | Appears in | Meaning |
|-------------|-----------|---------|
| `{guildName}` | DM messages | Name of the Discord server |
| `{reason}` | DM / log messages | Reason for the moderation action |
| `{duration}` | Mute DM | Mute duration string (e.g. `10min`) |
| `{tag}` | Command responses | Discord user tag (`Username#0000`) |
| `{userId}` | Log messages | Discord user snowflake ID |
| `{moderatorId}` | Log messages | Moderator's snowflake ID |
| `{count}` | Detection reasons | Number (messages, mentions, links) |
| `{window}` | Detection reasons | Time window in seconds |
| `{pattern}` | Word filter | Matched pattern string |
| `{latency}` | Ping command | API latency in milliseconds |
| `{page}` | Pagination | Current page number |
| `{total}` | Pagination | Total page count |

### Key naming conventions

Keys follow a dot-separated hierarchy:

| Prefix | Category |
|--------|----------|
| `detector.*` | Detection reason strings |
| `action.*` | Moderation action DMs |
| `command.*` | Slash command responses and logs |
| `settings.*` | Settings UI labels and messages |
| `error.*` | Error messages |
| `log.*` | Moderation log embed strings |

---

## Keeping translations up to date

When new keys are added to `locales/en/messages.json`, existing locale files will fall back to English for those keys until they are translated. Check for missing keys by comparing your locale file to English:

```bash
# On Linux/macOS
diff <(jq -r 'keys[]' locales/en/messages.json | sort) \
     <(jq -r 'keys[]' locales/fr/messages.json | sort)
```

On Windows (PowerShell):

```powershell
$en = (Get-Content locales/en/messages.json | ConvertFrom-Json).PSObject.Properties.Name | Sort-Object
$fr = (Get-Content locales/fr/messages.json | ConvertFrom-Json).PSObject.Properties.Name | Sort-Object
Compare-Object $en $fr
```

Entries shown with `<=` are in English but not yet in your locale.

---

## Questions?

Open a GitHub Discussion or ping `@maintainers` in the PR. Native-speaker review is not required to open a PR — partial translations are also welcome.
