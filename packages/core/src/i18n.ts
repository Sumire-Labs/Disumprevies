import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

type TranslationParams = Record<string, string | number>;
type TranslationMap = Record<string, string>;
type LocaleMap = Record<string, TranslationMap>;

const locales: LocaleMap = {};
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../locales');
const DEFAULT_LOCALE = 'en';

function loadLocale(locale: string): TranslationMap {
  const cached = locales[locale];
  if (cached) {
    return cached;
  }
  try {
    const raw = readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid locale file format for: ${locale}`);
    }
    const map = parsed as TranslationMap;
    locales[locale] = map;
    return map;
  } catch {
    if (locale !== DEFAULT_LOCALE) {
      return loadLocale(DEFAULT_LOCALE);
    }
    return {};
  }
}

export function t(key: string, params?: TranslationParams, locale = DEFAULT_LOCALE): string {
  const map = loadLocale(locale);
  let value = map[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return value;
}
