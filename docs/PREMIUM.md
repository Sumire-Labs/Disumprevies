# Disumprevies — Free vs Premium Feature Matrix

## Feature Access

All premium feature access is gated via a single function. **Never bypass this check.**

```typescript
// packages/core/src/gates/index.ts
checkFeatureAccess(guildId: string, feature: Feature): Promise<boolean>
```

---

## Feature Comparison

| Feature | Free | Premium | Notes |
|---------|------|---------|-------|
| **Detection** | | | |
| Spam detection | ✓ | ✓ | 5 msg / 5s default, configurable |
| Duplicate detection | ✓ | ✓ | 3 identical messages, configurable |
| Mention abuse detection | ✓ | ✓ | @everyone / ≥5 user mentions |
| Link spam detection | ✓ | ✓ | 3 links / 10s default, configurable |
| Discord invite detection | ✓ | ✓ | Per-guild whitelist |
| Word filter (basic) | ✓ | ✓ | Up to 50 patterns |
| Word filter (unlimited) | | ✓ | No pattern limit |
| Advanced raid detection | | ✓ | Join surge + coordinated message burst |
| **Moderation** | | | |
| Warn / Mute / Kick / Ban commands | ✓ | ✓ | |
| Infraction history (`/history`) | ✓ | ✓ | |
| Auto point-based actions | ✓ | ✓ | |
| Custom punishment thresholds | ✓ (3 max) | ✓ (unlimited) | |
| Custom point decay rate | ✓ | ✓ | |
| **Configuration** | | | |
| Exempt roles | ✓ (3 max) | ✓ (unlimited) | |
| Log channel + mod channel | ✓ | ✓ | |
| Language selection (EN / JA) | ✓ | ✓ | |
| Settings UI (slash command) | ✓ | ✓ | |
| **Premium-only** | | | |
| Appeal system | | ✓ | Users appeal bans/mutes via bot |
| Analytics dashboard | | ✓ | Infraction trends, hit rates |
| Multi-server sync | | ✓ | Share banlists across owned servers |

---

## Pricing Strategy

### Launch (2 tiers)

| Tier | Price | Target |
|------|-------|--------|
| **Free** | $0/month | Small servers, testing |
| **Premium** | $5/month per server | Active communities needing advanced protection |

Premium is billed per Discord server (guild), not per user account.

### Scale (3 tiers — post-launch)

Once the hosted service reaches sufficient adoption, a third tier will be added:

| Tier | Price | Target |
|------|-------|--------|
| **Free** | $0/month | Small servers |
| **Pro** | $5/month per server | Single active server, full feature set |
| **Business** | $15/month per account | Up to 10 servers, multi-server sync, priority support |

> Pricing is subject to change before the hosted service launches.

---

## Licensing

| Package | License | Notes |
|---------|---------|-------|
| `packages/core` | MIT | Free for any use, including commercial self-hosting |
| `packages/premium` | Business Source License 1.1 (BSL 1.1) | See below |

### BSL 1.1 Terms (Premium)

- **Additional Use Grant:** You may use the premium package for personal, non-commercial self-hosting.
- **Change Date:** 4 years from the date of each release.
- **Change License:** MIT — after the Change Date, the release becomes MIT.
- **Commercial use** of the premium package requires a separate commercial license (contact the maintainers).

---

## How to Add a New Premium Feature

### 1. Add the Feature enum value

In `packages/core/src/gates/index.ts`:

```typescript
export enum Feature {
  // ...existing values...
  MyNewFeature = 'my-new-feature',  // add here
}
```

Then add it to `PREMIUM_ONLY_FEATURES` if it is premium-only:

```typescript
const PREMIUM_ONLY_FEATURES: ReadonlySet<Feature> = new Set([
  // ...existing values...
  Feature.MyNewFeature,
]);
```

### 2. Gate the feature at the call site

Wherever the feature is used (typically in a command handler or detector):

```typescript
import { checkFeatureAccess, Feature } from '@disumprevies/core';

const hasAccess = await checkFeatureAccess(guildId, Feature.MyNewFeature);
if (!hasAccess) {
  // Reply with upgrade prompt using i18n key 'settings.premium.description'
  return;
}
// ... feature logic ...
```

### 3. Implement in the premium package

Create a new file under `packages/premium/src/`:

```
packages/premium/src/
  detectors/
    myNewFeature.ts   ← implements Detector interface
  index.ts            ← re-export from here
```

The detector must implement the `Detector` interface from `@disumprevies/core`:

```typescript
import type { Detector, MessageDetectionContext, DetectionResult } from '@disumprevies/core';

export class MyNewFeatureDetector implements Detector {
  readonly name = 'my-new-feature';

  async detect(ctx: MessageDetectionContext): Promise<DetectionResult | null> {
    // Check feature access first
    const hasAccess = await checkFeatureAccess(ctx.guildId, Feature.MyNewFeature);
    if (!hasAccess) return null;
    // ... detection logic ...
  }
}
```

### 4. Update the feature matrix

Add a row to this document (`docs/PREMIUM.md`) and update `docs/SPEC.md`.

### 5. Add i18n keys

Add any new user-facing strings to `locales/en/messages.json` and `locales/ja/messages.json`. See `locales/CONTRIBUTING.md` for the full translation workflow.

### 6. Write tests

- Unit tests for the detector in `packages/premium/src/detectors/myNewFeature.test.ts`.
- Gate tests verifying that `checkFeatureAccess` returns false for FREE guilds.

---

## Free Plan Limits (Enforced in Settings UI)

| Resource | Free limit | Premium limit |
|----------|-----------|---------------|
| Word filter patterns | 50 | Unlimited |
| Custom punishment thresholds | 3 | Unlimited |
| Exempt roles | 3 | Unlimited |

Limits are defined in `packages/core/src/settings/types.ts` as `FREE_LIMITS`.
