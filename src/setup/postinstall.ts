import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'fs';
import { join } from 'path';
import { DATA_DIR, GLOBAL_CONFIG_PATH, CLAUDE_DIR, PLUGIN_ROOT } from '../core/paths.js';
import { t, initLocale } from '../i18n/index.js';
import { readGlobalConfig } from '../core/config.js';

function getDefaultGen(): string {
  try {
    const gensPath = join(PLUGIN_ROOT, 'data', 'generations.json');
    if (existsSync(gensPath)) {
      const gens = JSON.parse(readFileSync(gensPath, 'utf-8'));
      return gens.default_generation ?? 'gen4';
    }
  } catch { /* fall through */ }
  return 'gen4';
}

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
  max_party_size: 3,
  peon_ping_integration: false,
  peon_ping_port: 19998,
  current_region: '1',
  default_dispatch: null,
  sprite_mode: 'all',
  renderer: 'braille',
  info_mode: 'ace_full',
  tips_enabled: true,
  notifications_enabled: true,
  language: 'en',
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

/**
 * Migrate flat data files to per-generation directory structure.
 * Moves ~/.claude/tokenmon/{state,config,session}.json → ~/.claude/tokenmon/gen4/
 * Creates global-config.json with active_generation and language.
 */
function migrateToMultiGen(): void {
  const rootState = join(DATA_DIR, 'state.json');
  const rootConfig = join(DATA_DIR, 'config.json');
  const rootSession = join(DATA_DIR, 'session.json');

  // Legacy files always belong to gen4 — the original generation
  const LEGACY_GEN = 'gen4';
  const targetDir = join(DATA_DIR, LEGACY_GEN);
  const hasAnyLegacy = existsSync(rootState) || existsSync(rootConfig) || existsSync(rootSession);
  if (!hasAnyLegacy) {
    // Ensure global-config.json exists even on fresh install
    if (!existsSync(GLOBAL_CONFIG_PATH)) {
      const defaultGen = getDefaultGen();
      writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        active_generation: defaultGen,
        language: 'en',
      }, null, 2), 'utf-8');
    }
    return;
  }

  console.log('');
  console.log('  ⚙ Multi-generation migration...');

  // Create target generation directory
  mkdirSync(targetDir, { recursive: true });

  // Read language from existing config before moving
  let language: 'ko' | 'en' = 'en';
  if (existsSync(rootConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(rootConfig, 'utf-8'));
      language = cfg.language ?? 'en';
    } catch { /* use default */ }
  }

  // Per-file independent migration — idempotent, safe to run multiple times
  const filesToMigrate = [
    { src: rootState, dest: join(targetDir, 'state.json') },
    { src: rootConfig, dest: join(targetDir, 'config.json') },
    { src: rootSession, dest: join(targetDir, 'session.json') },
  ];

  for (const { src, dest } of filesToMigrate) {
    if (existsSync(src) && !existsSync(dest)) {
      copyFileSync(src, dest);
      // Verify copy before removing original
      const srcSize = readFileSync(src).length;
      const destSize = readFileSync(dest).length;
      if (srcSize === destSize) {
        // Keep original as backup (.migrated suffix)
        renameSync(src, src + '.migrated');
        console.log(`  ✓ ${src} → ${dest}`);
      } else {
        console.log(`  ⚠ Size mismatch, keeping original: ${src}`);
      }
    }
  }

  // Create global-config.json — legacy users stay on LEGACY_GEN (gen4) where their data is
  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
      active_generation: LEGACY_GEN,
      language,
    }, null, 2), 'utf-8');
    console.log(`  ✓ ${GLOBAL_CONFIG_PATH}`);
  }

  console.log('  ✓ Multi-generation migration complete');
}

function bakeHookPaths(): void {
  const hooksJsonPath = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
  if (!existsSync(hooksJsonPath)) return;

  let content = readFileSync(hooksJsonPath, 'utf-8');
  // Only bake if any template vars are present
  if (!content.includes('${CLAUDE_PLUGIN_ROOT}') && !content.includes('${CLAUDE_PLUGIN_DATA}')) return;

  content = content.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, PLUGIN_ROOT);
  content = content.replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, DATA_DIR);
  writeFileSync(hooksJsonPath, content, 'utf-8');
  console.log(`  ✓ hooks.json paths resolved to ${PLUGIN_ROOT}`);
}

function main(): void {
  // Initialize locale — try reading from global config first, fallback to legacy config
  let lang: 'ko' | 'en' = 'en';
  try {
    const gc = readGlobalConfig();
    lang = gc.language;
  } catch {
    try {
      const legacyConfigPath = join(DATA_DIR, 'config.json');
      if (existsSync(legacyConfigPath)) {
        const cfg = JSON.parse(readFileSync(legacyConfigPath, 'utf-8'));
        lang = cfg.language ?? 'en';
      }
    } catch { /* use default */ }
  }
  initLocale(lang);
  console.log('');
  console.log(t('setup.postinstall.title'));
  console.log('');

  // Ensure data directory exists
  mkdirSync(DATA_DIR, { recursive: true });

  // Legacy bash data path
  const legacyDir = join(CLAUDE_DIR, 'hooks', 'tokenmon');

  // Determine target paths based on whether multi-gen is already set up
  // Legacy bash files always belong to gen4 — the original generation
  const LEGACY_GEN = 'gen4';
  const defaultGenDir = join(DATA_DIR, LEGACY_GEN);
  const isMultiGen = existsSync(defaultGenDir) || existsSync(GLOBAL_CONFIG_PATH);

  if (isMultiGen) {
    // Multi-gen mode: migrate legacy bash data directly to default gen dir
    mkdirSync(defaultGenDir, { recursive: true });
    migrateFile(join(legacyDir, 'state.json'), join(defaultGenDir, 'state.json'), DEFAULT_STATE);
    migrateFile(join(legacyDir, 'config.json'), join(defaultGenDir, 'config.json'), DEFAULT_CONFIG);
    migrateFile(join(legacyDir, 'session.json'), join(defaultGenDir, 'session.json'), DEFAULT_SESSION);
  } else {
    // Legacy single-gen mode: migrate to root first (will be moved to gen4/ by migrateToMultiGen)
    migrateFile(join(legacyDir, 'state.json'), join(DATA_DIR, 'state.json'), DEFAULT_STATE);
    migrateFile(join(legacyDir, 'config.json'), join(DATA_DIR, 'config.json'), DEFAULT_CONFIG);
    migrateFile(join(legacyDir, 'session.json'), join(DATA_DIR, 'session.json'), DEFAULT_SESSION);
  }

  // Migrate tokens_per_xp from old defaults to new default (10000)
  const configToCheck = isMultiGen ? join(defaultGenDir, 'config.json') : join(DATA_DIR, 'config.json');
  if (existsSync(configToCheck)) {
    try {
      const config = JSON.parse(readFileSync(configToCheck, 'utf-8'));
      if (config.tokens_per_xp === 10 || config.tokens_per_xp === 100) {
        const oldValue = config.tokens_per_xp;
        config.tokens_per_xp = 10000;
        writeFileSync(configToCheck, JSON.stringify(config, null, 2), 'utf-8');
        console.log(t('setup.postinstall.tokens_per_xp_updated', { old: oldValue }));
      }
    } catch {
      // Ignore
    }
  }

  // Multi-gen migration: move root-level files to gen4/ if needed
  migrateToMultiGen();

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

  bakeHookPaths();
}

main();
