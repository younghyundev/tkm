import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { DATA_DIR, STATE_PATH, CONFIG_PATH, SESSION_PATH, CLAUDE_DIR } from '../core/paths.js';

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
  current_region: '쌍둥이잎 마을',
  default_dispatch: null,
  sprite_mode: 'all',
  renderer: 'braille',
  info_mode: 'ace_full',
  tips_enabled: true,
}, null, 2);

const DEFAULT_SESSION = JSON.stringify({
  session_id: null,
  agent_assignments: [],
  evolution_events: [],
  achievement_events: [],
}, null, 2);

function migrateFile(srcPath: string, destPath: string, defaultContent: string): void {
  if (existsSync(destPath)) {
    console.log(`  ✓ ${destPath} 이미 존재 (보존)`);
    return;
  }

  if (existsSync(srcPath)) {
    // Backup source before migration
    const backupPath = srcPath + '.bak';
    if (!existsSync(backupPath)) {
      copyFileSync(srcPath, backupPath);
      console.log(`  ℹ 백업 생성: ${backupPath}`);
    }

    // Copy source to destination
    const content = readFileSync(srcPath, 'utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.log(`  ⚠ ${srcPath} 파싱 실패 — 기본값 사용`);
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
    console.log(`  ✓ ${srcPath} → ${destPath} 마이그레이션 완료`);
  } else {
    writeFileSync(destPath, defaultContent, 'utf-8');
    console.log(`  ✓ ${destPath} 생성 (기본값)`);
  }
}

function main(): void {
  console.log('');
  console.log('  토큰몬 (Tokénmon) 초기 설정...');
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
        console.log(`  ℹ tokens_per_xp ${oldValue} → 10000 으로 업데이트`);
      }
    } catch {
      // Ignore
    }
  }

  console.log('');
  console.log('  ✓ 토큰몬 초기 설정 완료!');
  console.log('');

  if (existsSync(legacyDir)) {
    console.log('  ℹ 기존 bash 데이터가 마이그레이션되었습니다.');
    console.log(`    이전 데이터: ${legacyDir}`);
    console.log(`    새 데이터:   ${DATA_DIR}`);
    console.log('    기존 bash 훅은 수동으로 정리하세요.');
    console.log('');
  }
}

main();
