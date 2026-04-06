import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { configPath, i18nDataDir, GLOBAL_CONFIG_PATH, DATA_DIR, I18N_DATA_DIR } from './paths.js';
import type { Config, GlobalConfig } from './types.js';

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  active_generation: 'gen4',
  language: 'en',
  voice_tone: 'claude',
};

const DEFAULT_CONFIG: Config = {
  tokens_per_xp: 10000,
  party: [],
  starter_chosen: false,
  volume: 0.5,
  sprite_enabled: true,
  cry_enabled: true,
  xp_formula: 'medium_fast',
  xp_bonus_multiplier: 1.0,
  max_party_size: 3,
  peon_ping_integration: false,
  peon_ping_port: 19998,
  relay_audio: false,
  relay_host: 'localhost',
  relay_sound_root: '',
  current_region: '1',
  default_dispatch: null,
  sprite_mode: 'all',
  renderer: 'braille',
  info_mode: 'ace_full',
  tips_enabled: true,
  notifications_enabled: true,
  language: 'en' as const,
};

// ── Global config (shared across generations) ──

export function readGlobalConfig(): GlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    // If legacy config exists at root, read language from it
    const legacyConfigPath = join(DATA_DIR, 'config.json');
    if (existsSync(legacyConfigPath)) {
      try {
        const legacy = JSON.parse(readFileSync(legacyConfigPath, 'utf-8'));
        return {
          ...DEFAULT_GLOBAL_CONFIG,
          language: legacy.language ?? 'en',
        };
      } catch { /* fall through */ }
    }
    return { ...DEFAULT_GLOBAL_CONFIG };
  }
  const raw = readFileSync(GLOBAL_CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<GlobalConfig>;
  return {
    ...DEFAULT_GLOBAL_CONFIG,
    ...parsed,
  };
}

export function writeGlobalConfig(config: GlobalConfig): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = GLOBAL_CONFIG_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, GLOBAL_CONFIG_PATH);
}

// ── Per-generation config ──

function migrateConfig(config: Config, i18nDir: string): Config {
  // Quick check: does any party member or region look like a Korean name?
  const hasKorean = (s: string) => /[\uac00-\ud7a3]/.test(s);
  const needsMigration =
    config.party.some(hasKorean) ||
    hasKorean(config.current_region) ||
    (config.default_dispatch != null && hasKorean(config.default_dispatch));

  if (!needsMigration) return config;

  // Build Korean name -> ID maps from i18n/ko.json
  const koI18nPath = join(i18nDir, 'ko.json');
  // Also check legacy path as fallback
  const koPath = existsSync(koI18nPath) ? koI18nPath : join(I18N_DATA_DIR, 'ko.json');
  if (!existsSync(koPath)) return config;

  let koData: { pokemon: Record<string, string>; regions: Record<string, { name: string }> };
  try {
    koData = JSON.parse(readFileSync(koPath, 'utf-8'));
  } catch {
    return config;
  }

  const nameToId: Record<string, string> = {};
  for (const [id, name] of Object.entries(koData.pokemon)) {
    nameToId[name] = id;
  }

  const regionNameToId: Record<string, string> = {};
  for (const [id, region] of Object.entries(koData.regions)) {
    regionNameToId[region.name] = id;
  }

  // Migrate config.party (Korean names -> IDs)
  if (config.party.length > 0) {
    config.party = config.party.map(name => nameToId[name] ?? name);
  }

  // Migrate config.current_region (Korean name -> ID)
  if (regionNameToId[config.current_region]) {
    config.current_region = regionNameToId[config.current_region];
  }

  // Migrate config.default_dispatch
  if (config.default_dispatch && nameToId[config.default_dispatch]) {
    config.default_dispatch = nameToId[config.default_dispatch];
  }

  return config;
}

export function readConfig(gen?: string): Config {
  const path = configPath(gen);
  let result: Config;
  let hasExplicitPartySize = false;
  if (!existsSync(path)) {
    result = { ...DEFAULT_CONFIG, party: [] };
  } else {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    hasExplicitPartySize = parsed.max_party_size !== undefined;
    result = {
      ...DEFAULT_CONFIG,
      ...parsed,
      party: parsed.party ?? [],
    };
  }
  // Sync language from global config
  const globalConfig = readGlobalConfig();
  result.language = globalConfig.language;

  // For pre-migration configs that don't have max_party_size persisted:
  // if party is already larger than the new default (3), preserve their earned capacity
  if (!hasExplicitPartySize && result.party.length > result.max_party_size) {
    result.max_party_size = Math.min(6, result.party.length);
  }
  // Hard cap at 6 (original games)
  if (result.max_party_size > 6) {
    result.max_party_size = 6;
  }
  // Trim party to match cap (migration for users who had 7-8)
  if (result.party.length > result.max_party_size) {
    result.party = result.party.slice(0, result.max_party_size);
  }

  return migrateConfig(result, i18nDataDir(gen));
}

/**
 * Write per-gen config and sync language to global config.
 * @sideeffect Reads and writes global-config.json if language changed.
 *             Must be called under the global lock when used in hooks.
 */
export function writeConfig(config: Config, gen?: string): void {
  const path = configPath(gen);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = path + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, path);

  // Sync language to global config (single source of truth)
  const gc = readGlobalConfig();
  if (gc.language !== config.language) {
    gc.language = config.language;
    writeGlobalConfig(gc);
  }
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG, party: [] };
}
