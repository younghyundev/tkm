import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_PATH = join(__dirname, '../../data/region-drop-messages.json');

type RegionMessages = Record<string, Record<string, Record<string, Record<string, string[]>>>>;

let cached: RegionMessages | null = null;

function load(): RegionMessages {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(MESSAGES_PATH, 'utf-8')) as RegionMessages;
  } catch {
    cached = {};
  }
  return cached;
}

/**
 * Get a random region-specific ball drop message.
 * Returns null if no message found for this gen/region/tone/locale combo.
 */
export function getRegionDropMessage(
  gen: string,
  region: string | number,
  voiceTone: 'claude' | 'pokemon',
  locale: 'ko' | 'en',
): string | null {
  const msgs = load();
  const variations = msgs[gen]?.[String(region)]?.[voiceTone]?.[locale];
  if (!variations || variations.length === 0) return null;
  return variations[Math.floor(Math.random() * variations.length)];
}
