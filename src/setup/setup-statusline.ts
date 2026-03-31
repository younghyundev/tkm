import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CLAUDE_DIR, DATA_DIR, PLUGIN_ROOT } from '../core/paths.js';

const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const WRAPPER_PATH = join(DATA_DIR, 'status-wrapper.mjs');

const TOKENMON_CMD = `CLAUDE_PLUGIN_DATA="${DATA_DIR}" CLAUDE_PLUGIN_ROOT="${PLUGIN_ROOT}" "${PLUGIN_ROOT}/node_modules/.bin/tsx" "${PLUGIN_ROOT}/src/status-line.ts"`;

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function createWrapper(existingCmd: string): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const content = `#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const prevCmd = ${JSON.stringify(existingCmd)};
const tokenmonCmd = ${JSON.stringify(TOKENMON_CMD)};

// Read stdin once and pass it to both commands
let stdinData = null;
try {
  stdinData = readFileSync('/dev/stdin', { encoding: 'utf8' });
} catch {
  stdinData = null;
}

function run(cmd) {
  try {
    const opts = { encoding: 'utf8', timeout: 5000 };
    if (stdinData) opts.input = stdinData;
    return execSync(cmd, opts).trim();
  } catch {
    return '';
  }
}

const prevOut = run(prevCmd);
const tokenmonOut = run(tokenmonCmd);

if (prevOut && tokenmonOut) {
  console.log(\`\${prevOut}  |  \${tokenmonOut}\`);
} else if (tokenmonOut) {
  console.log(tokenmonOut);
} else if (prevOut) {
  console.log(prevOut);
}
`;
  writeFileSync(WRAPPER_PATH, content, 'utf-8');
}

function extractWrappedCommand(cmd: string): string | null {
  // settings.json의 command에서 실제 래퍼 경로를 추출
  const wrapperPath = cmd.replace(/^node\s+/, '').replace(/\$HOME/g, process.env.HOME ?? '');
  try {
    const wrapper = readFileSync(wrapperPath, 'utf-8');
    const match = wrapper.match(/const prevCmd = "(.*?)";/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractCommand(statusLine: unknown): string | null {
  if (!statusLine) return null;
  if (typeof statusLine === 'string') return statusLine;
  if (typeof statusLine === 'object' && statusLine !== null) {
    const cmd = (statusLine as Record<string, unknown>).command;
    return typeof cmd === 'string' ? cmd : null;
  }
  return null;
}

function main(): void {
  const settings = readSettings();
  const existingCmd = extractCommand(settings.statusLine);

  if (existingCmd && existingCmd.includes('status-line.ts')) {
    console.log('  ✓ tokenmon statusLine 이미 설정됨 (건너뜀)');
    return;
  }

  if (existingCmd && existingCmd.includes('status-wrapper.mjs')) {
    // 래퍼가 이미 설정되어 있어도 최신 버전으로 재생성
    const wrappedCmd = extractWrappedCommand(existingCmd);
    if (wrappedCmd) {
      createWrapper(wrappedCmd);
      console.log('  ✓ tokenmon 래퍼 최신 버전으로 갱신됨');
    } else {
      console.log('  ✓ tokenmon 래퍼 이미 설정됨 (건너뜀)');
    }
    return;
  }

  if (existingCmd) {
    console.log(`  ℹ 기존 statusLine 감지: ${existingCmd}`);
    createWrapper(existingCmd);
    settings.statusLine = {
      type: 'command',
      command: `node $HOME/.claude/tokenmon/status-wrapper.mjs`,
    };
    writeSettings(settings);
    console.log(`  ✓ 래퍼 생성: ${WRAPPER_PATH}`);
    console.log('  ✓ 기존 statusLine과 tokenmon을 함께 표시하도록 설정됨');
  } else {
    settings.statusLine = {
      type: 'command',
      command: TOKENMON_CMD,
    };
    writeSettings(settings);
    console.log('  ✓ tokenmon statusLine 등록 완료');
  }
}

main();
