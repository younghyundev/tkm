import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

type Locale = 'ko' | 'en';
type VoiceTone = 'claude' | 'pokemon';

const __dirname = dirname(fileURLToPath(import.meta.url));

let currentLocale: Locale = 'en';
let currentVoiceTone: VoiceTone = 'claude';
let messages: Record<string, Record<string, string>> = {};
let overlayMessages: Record<string, Record<string, string>> = {};
let loaded = false;

function loadMessages(): void {
  if (loaded) return;
  loaded = true;

  for (const locale of ['ko', 'en'] as Locale[]) {
    // Base messages (classic mode)
    const filePath = join(__dirname, `${locale}.json`);
    try {
      messages[locale] = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, string>;
    } catch {
      messages[locale] = {};
    }

    // Overlay messages (voice tone mode)
    if (currentVoiceTone !== 'claude') {
      const overlayPath = join(__dirname, `${locale}.${currentVoiceTone}.json`);
      if (existsSync(overlayPath)) {
        try {
          overlayMessages[locale] = JSON.parse(readFileSync(overlayPath, 'utf-8')) as Record<string, string>;
        } catch {
          overlayMessages[locale] = {};
        }
      } else {
        overlayMessages[locale] = {};
      }
    }
  }
}

export function initLocale(locale: Locale, voiceTone?: VoiceTone): void {
  currentLocale = locale;
  currentVoiceTone = voiceTone ?? 'claude';
  // Reset so next t() call reloads catalogs
  loaded = false;
  messages = {};
  overlayMessages = {};
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

  // 1. Try overlay (voice tone mode) for current locale
  let template = overlayMessages[currentLocale]?.[key];

  // 2. Try overlay for English fallback
  if (template === undefined && currentLocale !== 'en') {
    template = overlayMessages['en']?.[key];
  }

  // 3. Try base messages for current locale
  if (template === undefined) {
    template = messages[currentLocale]?.[key];
  }

  // 4. Fallback to English base
  if (template === undefined && currentLocale !== 'en') {
    template = messages['en']?.[key];
  }

  // 5. Fallback to key itself
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
  overlayMessages = {};
  loaded = false;
  currentLocale = 'en';
  currentVoiceTone = 'claude';
}
