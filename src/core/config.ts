import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { CONFIG_PATH } from './paths.js';
import type { Config } from './types.js';

const DEFAULT_CONFIG: Config = {
  tokens_per_xp: 10000,
  party: [],
  starter_chosen: false,
  volume: 0.5,
  sprite_enabled: true,
  cry_enabled: true,
  xp_formula: 'medium_fast',
  xp_bonus_multiplier: 1.0,
  max_party_size: 6,
  peon_ping_integration: false,
  peon_ping_port: 19998,
  current_region: '쌍둥이잎 마을',
  auto_retry_enabled: true,
  auto_retry_threshold: 0.60,
  default_dispatch: null,
  sprite_mode: 'all',
  info_mode: 'ace_full',
};

export function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, party: [] };
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<Config>;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    party: parsed.party ?? [],
  };
}

export function writeConfig(config: Config): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = CONFIG_PATH + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, CONFIG_PATH);
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG, party: [] };
}
