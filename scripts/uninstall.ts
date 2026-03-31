#!/usr/bin/env tsx
/**
 * Tokenmon clean uninstall script.
 * Removes all user data, statusLine config, and wrapper files.
 * Run with --keep-state to preserve state.json (pokemon data).
 */

import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const keepState = process.argv.includes('--keep-state');
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const DATA_DIR = join(CLAUDE_DIR, 'tokenmon');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

console.log('Tokenmon uninstall\n');

// 1. Remove statusLine from settings.json
if (existsSync(SETTINGS_PATH)) {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    const sl = settings.statusLine;
    const isTokenmon = sl && typeof sl === 'object' &&
      typeof sl.command === 'string' &&
      sl.command.includes('tokenmon');

    if (isTokenmon) {
      delete settings.statusLine;
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
      console.log('  [v] statusLine removed from settings.json');
    } else if (sl) {
      console.log('  [-] statusLine exists but is not tokenmon — skipped');
    } else {
      console.log('  [-] no statusLine in settings.json');
    }
  } catch (err: any) {
    console.error(`  [!] settings.json error: ${err.message}`);
  }
} else {
  console.log('  [-] settings.json not found');
}

// 2. Remove data directory
if (existsSync(DATA_DIR)) {
  if (keepState) {
    // Remove everything except state.json
    const files = ['config.json', 'session.json', 'status-wrapper.mjs'];
    for (const f of files) {
      const p = join(DATA_DIR, f);
      if (existsSync(p)) {
        rmSync(p);
        console.log(`  [v] ${f} removed`);
      }
    }
    // Remove lock files
    for (const f of ['state.json.lock', 'session.json.lock', 'state.json.tmp', 'config.json.tmp', 'session.json.tmp']) {
      const p = join(DATA_DIR, f);
      if (existsSync(p)) rmSync(p);
    }
    console.log('  [v] data cleaned (state.json preserved)');
  } else {
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('  [v] ~/.claude/tokenmon/ removed');
  }
} else {
  console.log('  [-] ~/.claude/tokenmon/ not found');
}

console.log('\nDone. Run "/plugin uninstall tokenmon@tokenmon" to remove the plugin itself.');
console.log('Restart Claude Code to apply changes.');
