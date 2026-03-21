import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../db.js';

type TranslationParams = Record<string, string | number>;
type TranslationMap = Record<string, string>;
type LocaleMap = Record<string, TranslationMap>;

const localeCache: LocaleMap = {};
const guildLocaleCache = new Map<string, string>();

const LOCALES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../locales',
);
const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'ja'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

function loadLocale(locale: string): TranslationMap {
  const cached = localeCache[locale];
  if (cached !== undefined) {
    return cached;
  }
  try {
    const raw = readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid locale file format for: ${locale}`);
    }
    const map = parsed as TranslationMap;
    localeCache[locale] = map;
    return map;
  } catch {
    if (locale !== DEFAULT_LOCALE) {
      return loadLocale(DEFAULT_LOCALE);
    }
    return {};
  }
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return Object.entries(params).reduce((acc, [k, v]) => {
    return acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }, template);
}

/** Resolve locale string for a guild, with in-process caching. */
async function resolveGuildLocale(guildId: string): Promise<SupportedLocale> {
  const cached = guildLocaleCache.get(guildId);
  if (cached !== undefined) {
    return isSupportedLocale(cached) ? cached : DEFAULT_LOCALE;
  }
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { locale: true },
    });
    const locale = guild?.locale ?? DEFAULT_LOCALE;
    guildLocaleCache.set(guildId, locale);
    return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Invalidate the cached locale for a guild (call after locale is updated). */
export function invalidateGuildLocaleCache(guildId: string): void {
  guildLocaleCache.delete(guildId);
}

/**
 * Look up a translation key for a specific guild.
 * Falls back to English if the guild locale doesn't have the key.
 */
export async function t(
  guildId: string,
  key: string,
  params?: TranslationParams,
): Promise<string> {
  const locale = await resolveGuildLocale(guildId);
  const map = loadLocale(locale);
  const fallback = locale !== DEFAULT_LOCALE ? loadLocale(DEFAULT_LOCALE) : map;

  const raw = map[key] ?? fallback[key] ?? key;
  const result = interpolate(raw, params);

  if (process.env['LOG_LEVEL'] === 'debug') {
    console.debug(JSON.stringify({ timestamp: new Date().toISOString(), level: 'debug', message: 'i18n resolve', guildId, locale, key, result }));
  }

  return result;
}

/**
 * Synchronous translation lookup with an explicit locale string.
 * Use this in contexts where a guild ID is not available (e.g. logger internals).
 */
export function tSync(key: string, params?: TranslationParams, locale = DEFAULT_LOCALE): string {
  const effectiveLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const map = loadLocale(effectiveLocale);
  const fallback =
    effectiveLocale !== DEFAULT_LOCALE ? loadLocale(DEFAULT_LOCALE) : map;
  const raw = map[key] ?? fallback[key] ?? key;
  return interpolate(raw, params);
}
