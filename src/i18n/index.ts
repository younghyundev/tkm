import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

type Locale = 'ko' | 'en';

const __dirname = dirname(fileURLToPath(import.meta.url));

let currentLocale: Locale = 'en';
let messages: Record<string, Record<string, string>> = {};
let loaded = false;

function loadMessages(): void {
  if (loaded) return;
  loaded = true;

  for (const locale of ['ko', 'en'] as Locale[]) {
    const filePath = join(__dirname, `${locale}.json`);
    try {
      messages[locale] = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, string>;
    } catch {
      // File doesn't exist yet — start with empty catalog
      messages[locale] = {};
    }
  }
}

export function initLocale(locale: Locale): void {
  currentLocale = locale;
  // Reset so next t() call reloads catalogs
  loaded = false;
  messages = {};
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Check whether a character (Korean syllable) has a final consonant (받침/batchim).
 * Returns false for non-Hangul characters (English names → treated as no batchim).
 */
function hasBatchim(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * Interpolate variables into a message template.
 *
 * Supports two syntaxes:
 *   {varName}            → simple substitution
 *   {varName:p1/p2}      → Korean particle: p1 with batchim, p2 without
 */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)(?::([^/}]+)\/([^}]+))?\}/g, (_match, key, p1, p2) => {
    const value = vars[key];
    const str = value !== undefined ? String(value) : `{${key}}`;

    if (p1 !== undefined && p2 !== undefined) {
      // Korean particle selection
      const lastChar = str.charAt(str.length - 1);
      const particle = hasBatchim(lastChar) ? p1 : p2;
      return str + particle;
    }

    return str;
  });
}

export function t(key: string, vars?: Record<string, string | number>): string {
  loadMessages();

  // 1. Try current locale
  let template = messages[currentLocale]?.[key];

  // 2. Fallback to English
  if (template === undefined && currentLocale !== 'en') {
    template = messages['en']?.[key];
  }

  // 3. Fallback to key itself
  if (template === undefined) {
    return key;
  }

  // 4. Interpolate variables (including Korean particle syntax)
  if (vars && Object.keys(vars).length > 0) {
    return interpolate(template, vars);
  }

  return template;
}

/** Reset internal state — for use in tests only. */
export function _resetForTesting(): void {
  messages = {};
  loaded = false;
  currentLocale = 'en';
}
