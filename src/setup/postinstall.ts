import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { DATA_DIR, STATE_PATH, CONFIG_PATH, SESSION_PATH, CLAUDE_DIR } from '../core/paths.js';
import { t, initLocale } from '../i18n/index.js';
import { readConfig } from '../core/config.js';

const DEFAULT_STATE = JSON.stringify({
  pokemon: {},
  unlocked: [],
  achievements: {},
  total_tokens_consumed: 0,
  session_count: 0,
  error_count: 0,
  permission_count: 0,
  evolution_count: 0,
  last_session_id: null,
  xp_bonus_multiplier: 1.0,
  last_session_tokens: {},
}, null, 2);

const DEFAULT_CONFIG = JSON.stringify({
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
}, null, 2);

const DEFAULT_SESSION = JSON.stringify({
  session_id: null,
  agent_assignments: [],
  evolution_events: [],
  achievement_events: [],
}, null, 2);

function migrateFile(srcPath: string, destPath: string, defaultContent: string): void {
  if (existsSync(destPath)) {
    console.log(t('setup.postinstall.already_exists', { path: destPath }));
    return;
  }

  if (existsSync(srcPath)) {
    // Backup source before migration
    const backupPath = srcPath + '.bak';
    if (!existsSync(backupPath)) {
      copyFileSync(srcPath, backupPath);
      console.log(t('setup.postinstall.backup_created', { path: backupPath }));
    }

    // Copy source to destination
    const content = readFileSync(srcPath, 'utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.log(t('setup.postinstall.parse_failed', { path: srcPath }));
      writeFileSync(destPath, defaultContent, 'utf-8');
      return;
    }

    // Fill missing fields from defaults
    const defaults = JSON.parse(defaultContent);
    const merged = { ...defaults, ...parsed };

    // Ensure arrays/objects are properly merged
    if (Array.isArray(defaults.party) && !Array.isArray(merged.party)) {
      merged.party = [];
    }
    if (Array.isArray(defaults.unlocked) && !Array.isArray(merged.unlocked)) {
      merged.unlocked = [];
    }

    writeFileSync(destPath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(t('setup.postinstall.migration_done', { src: srcPath, dest: destPath }));
  } else {
    writeFileSync(destPath, defaultContent, 'utf-8');
    console.log(t('setup.postinstall.created_default', { path: destPath }));
  }
}

function main(): void {
  initLocale(readConfig().language ?? 'ko');
  console.log('');
  console.log(t('setup.postinstall.title'));
  console.log('');

  // Ensure data directory exists
  mkdirSync(DATA_DIR, { recursive: true });

  // Legacy bash data path
  const legacyDir = join(CLAUDE_DIR, 'hooks', 'tokenmon');

  // Migrate or create data files
  migrateFile(join(legacyDir, 'state.json'), STATE_PATH, DEFAULT_STATE);
  migrateFile(join(legacyDir, 'config.json'), CONFIG_PATH, DEFAULT_CONFIG);
  migrateFile(join(legacyDir, 'session.json'), SESSION_PATH, DEFAULT_SESSION);

  // Migrate tokens_per_xp from old defaults to new default (10000)
  if (existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.tokens_per_xp === 10 || config.tokens_per_xp === 100) {
        const oldValue = config.tokens_per_xp;
        config.tokens_per_xp = 10000;
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        console.log(t('setup.postinstall.tokens_per_xp_updated', { old: oldValue }));
      }
    } catch {
      // Ignore
    }
  }

  console.log('');
  console.log(t('setup.postinstall.done'));
  console.log('');

  if (existsSync(legacyDir)) {
    console.log(t('setup.postinstall.legacy_notice'));
    console.log(t('setup.postinstall.legacy_old', { path: legacyDir }));
    console.log(t('setup.postinstall.legacy_new', { path: DATA_DIR }));
    console.log(t('setup.postinstall.legacy_cleanup'));
    console.log('');
  }
}

main();
