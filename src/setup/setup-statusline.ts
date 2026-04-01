import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CLAUDE_DIR, DATA_DIR, PLUGIN_ROOT } from '../core/paths.js';
import { t, initLocale } from '../i18n/index.js';
import { readConfig } from '../core/config.js';

const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const WRAPPER_PATH = join(DATA_DIR, 'status-wrapper.mjs');

const TOKENMON_CMD = `CLAUDE_PLUGIN_DATA="${DATA_DIR}" CLAUDE_PLUGIN_ROOT="${PLUGIN_ROOT}" "${PLUGIN_ROOT}/bin/tsx-resolve.sh" "${PLUGIN_ROOT}/src/status-line.ts"`;

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
  stdinData = readFileSync(0, { encoding: 'utf8' });
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

if (tokenmonOut) console.log(tokenmonOut);
if (prevOut) console.log(prevOut);
`;
  writeFileSync(WRAPPER_PATH, content, 'utf-8');
}

function extractWrappedCommand(cmd: string): string | null {
  // Extract the actual wrapped command path from settings.json command
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
  initLocale(readConfig().language ?? 'ko');
  const settings = readSettings();
  const existingCmd = extractCommand(settings.statusLine);

  if (existingCmd && existingCmd.includes('status-line.ts')) {
    console.log(t('setup.statusline.already_set'));
    return;
  }

  if (existingCmd && existingCmd.includes('status-wrapper.mjs')) {
    // Recreate wrapper with latest version even if already set
    const wrappedCmd = extractWrappedCommand(existingCmd);
    if (wrappedCmd) {
      createWrapper(wrappedCmd);
      console.log(t('setup.statusline.wrapper_updated'));
    } else {
      console.log(t('setup.statusline.wrapper_already'));
    }
    return;
  }

  if (existingCmd) {
    console.log(t('setup.statusline.existing_detected', { cmd: existingCmd }));
    createWrapper(existingCmd);
    settings.statusLine = {
      type: 'command',
      command: `node $HOME/.claude/tokenmon/status-wrapper.mjs`,
    };
    writeSettings(settings);
    console.log(t('setup.statusline.wrapper_created', { path: WRAPPER_PATH }));
    console.log(t('setup.statusline.combined'));
  } else {
    settings.statusLine = {
      type: 'command',
      command: TOKENMON_CMD,
    };
    writeSettings(settings);
    console.log(t('setup.statusline.registered'));
  }
}

main();
