#!/usr/bin/env -S npx tsx
/**
 * Tokénmon TypeScript 플러그인 설치 스크립트
 *
 * Usage: npx tsx install.ts [--reset]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execSync, spawnSync } from 'child_process';

const PLUGIN_ROOT = dirname(new URL(import.meta.url).pathname);
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const DATA_DIR = join(CLAUDE_DIR, 'tokenmon');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const RAW_DIR = join(PLUGIN_ROOT, 'sprites', 'raw');
const TERM_DIR = join(PLUGIN_ROOT, 'sprites', 'terminal');
const CRIES_DIR = join(PLUGIN_ROOT, 'cries');

// Colors
const BOLD = '\x1b[1m';
const R = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

const ok = (s: string) => console.log(`${GREEN}✓ ${s}${R}`);
const info = (s: string) => console.log(`${CYAN}ℹ ${s}${R}`);
const warn = (s: string) => console.log(`${YELLOW}⚠ ${s}${R}`);
const err = (s: string) => console.error(`${RED}✗ ${s}${R}`);
const step = (s: string) => console.log(`\n${BOLD}[${new Date().toTimeString().slice(0, 8)}] ${s}${R}`);

// ── Pokemon IDs ──────────────────────────────────────────────────────────────
const POKEMON_IDS = [387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 403, 404, 405, 447, 448];

// ── Reset mode ───────────────────────────────────────────────────────────────
if (process.argv.includes('--reset')) {
  const statePath = join(DATA_DIR, 'state.json');
  if (existsSync(statePath)) {
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`\n${BOLD}⚠ state.json을 초기화합니다. 모든 진행 상황이 삭제됩니다.\n계속하시겠습니까? (y/N): ${R}`, resolve);
    });
    rl.close();
    if (answer.toLowerCase() === 'y') {
      writeFileSync(statePath, JSON.stringify({
        pokemon: {}, unlocked: [], achievements: {},
        total_tokens_consumed: 0, session_count: 0, error_count: 0,
        permission_count: 0, evolution_count: 0, last_session_id: null,
        xp_bonus_multiplier: 1.0, last_session_tokens: {},
      }, null, 2));
      ok('state.json 초기화 완료');
    } else {
      info('초기화 취소');
    }
  }
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`
${BOLD}========================================${R}
${BOLD}  토큰몬 (Tokénmon) 설치${R}
${BOLD}  플러그인: ${PLUGIN_ROOT}${R}
${BOLD}  데이터:   ${DATA_DIR}${R}
${BOLD}========================================${R}
`);

// 1. npm install
step('의존성 설치...');
if (!existsSync(join(PLUGIN_ROOT, 'node_modules'))) {
  const result = spawnSync('npm', ['install'], { cwd: PLUGIN_ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    err('npm install 실패');
    process.exit(1);
  }
} else {
  ok('node_modules 이미 존재');
}

// 2. Download sprites
step('스프라이트 다운로드...');
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(TERM_DIR, { recursive: true });

let spriteDownloaded = 0;
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

for (const id of POKEMON_IDS) {
  const outPath = join(RAW_DIR, `${id}.png`);
  if (existsSync(outPath)) continue;
  try {
    execSync(`curl -fsSL --max-time 10 "${SPRITE_BASE}/${id}.png" -o "${outPath}" 2>/dev/null`);
    spriteDownloaded++;
  } catch {
    // Ignore individual failures
  }
}
if (spriteDownloaded > 0) ok(`${spriteDownloaded}개 스프라이트 다운로드 완료`);
else ok('스프라이트 이미 다운로드됨');

// 3. Convert sprites
step('스프라이트 변환...');
let spriteConverted = 0;

// Use the TS converter
for (const id of POKEMON_IDS) {
  const rawPath = join(RAW_DIR, `${id}.png`);
  const termPath = join(TERM_DIR, `${id}.txt`);
  if (existsSync(termPath) || !existsSync(rawPath)) continue;
  try {
    const { convertFile } = await import('./src/sprites/convert.js');
    convertFile(rawPath, termPath, 20);
    spriteConverted++;
  } catch {
    // Ignore
  }
}
if (spriteConverted > 0) ok(`${spriteConverted}개 스프라이트 변환 완료`);
else ok('스프라이트 이미 변환됨');

// 4. Download cries
step('울음소리 다운로드...');
mkdirSync(CRIES_DIR, { recursive: true });

let cryDownloaded = 0;
const CRY_BASE = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest';

for (const id of POKEMON_IDS) {
  const outPath = join(CRIES_DIR, `${id}.ogg`);
  if (existsSync(outPath)) continue;
  try {
    execSync(`curl -fsSL --max-time 15 "${CRY_BASE}/${id}.ogg" -o "${outPath}" 2>/dev/null`);
    cryDownloaded++;
  } catch {
    try { execSync(`rm -f "${outPath}"`); } catch { /* ignore */ }
  }
}
if (cryDownloaded > 0) ok(`${cryDownloaded}개 울음소리 다운로드 완료`);
else ok('울음소리 이미 다운로드됨');

// 5. Register hooks in settings.json
step('Claude Code 훅 등록...');

mkdirSync(CLAUDE_DIR, { recursive: true });
if (!existsSync(SETTINGS_FILE)) {
  writeFileSync(SETTINGS_FILE, '{}');
}

const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
if (!settings.hooks) settings.hooks = {};

const TSX = `${PLUGIN_ROOT}/bin/tsx-resolve.sh`;
const hookMap: Record<string, string> = {
  SessionStart: `"${TSX}" "${PLUGIN_ROOT}/src/hooks/session-start.ts"`,
  Stop: `"${TSX}" "${PLUGIN_ROOT}/src/hooks/stop.ts"`,
  PermissionRequest: `"${TSX}" "${PLUGIN_ROOT}/src/hooks/permission.ts"`,
  PostToolUseFailure: `"${TSX}" "${PLUGIN_ROOT}/src/hooks/tool-fail.ts"`,
  SubagentStart: `"${TSX}" "${PLUGIN_ROOT}/src/hooks/subagent-start.ts"`,
  SubagentStop: `"${TSX}" "${PLUGIN_ROOT}/src/hooks/subagent-stop.ts"`,
};

for (const [event, command] of Object.entries(hookMap)) {
  // Remove any existing tokenmon hooks for this event
  if (settings.hooks[event]) {
    settings.hooks[event] = settings.hooks[event].filter(
      (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes('tokenmon'))
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  // Add new tokenmon hook
  if (!settings.hooks[event]) settings.hooks[event] = [];
  settings.hooks[event].push({
    hooks: [{ type: 'command', command }],
  });
}

// StatusLine: wrap existing with tokenmon
const existingStatusLine = settings.statusLine?.command ?? '';
const tokenmonStatusLine = `"${TSX}" "${PLUGIN_ROOT}/src/status-line.ts"`;

if (existingStatusLine && !existingStatusLine.includes('tokenmon')) {
  // Create a wrapper that runs both
  const wrapperPath = join(PLUGIN_ROOT, 'scripts', 'status-line-wrapper.sh');
  mkdirSync(join(PLUGIN_ROOT, 'scripts'), { recursive: true });
  writeFileSync(wrapperPath, `#!/usr/bin/env bash
# Runs existing statusLine + tokenmon statusLine
${existingStatusLine} 2>/dev/null || true
${tokenmonStatusLine} 2>/dev/null || true
`, { mode: 0o755 });
  settings.statusLine = { type: 'command', command: wrapperPath };
  info(`기존 statusLine 발견 → 래퍼로 통합`);
} else if (!existingStatusLine) {
  settings.statusLine = { type: 'command', command: tokenmonStatusLine };
}

writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
ok('훅 등록 완료');

// 6. Install /tokenmon slash command
step('/tokenmon 명령어 설치...');
const cmdDir = join(CLAUDE_DIR, 'commands');
mkdirSync(cmdDir, { recursive: true });
writeFileSync(join(cmdDir, 'tokenmon.md'), `---
description: Tokenmon 상태 확인 및 파티 관리
---
사용자가 Tokenmon 명령을 실행하려고 합니다. Bash 도구를 사용하여 다음 명령을 실행하고 결과를 보여주세요:
"${TSX}" "${PLUGIN_ROOT}/src/cli/tokenmon.ts" $ARGUMENTS
$ARGUMENTS가 비어있으면 status를 기본값으로 사용하세요.
`);
ok('/tokenmon 명령어 설치 완료');

// Done
console.log(`
${BOLD}========================================${R}
${GREEN}✓ 토큰몬 설치 완료!${R}
${BOLD}========================================${R}

${CYAN}시작하기:${R}
  /tokenmon status      - 현재 상태 확인
  /tokenmon starter     - 스타터 선택 (미선택 시)
  /tokenmon help        - 도움말

${CYAN}Claude Code를 재시작하면 훅이 활성화됩니다.${R}
`);
