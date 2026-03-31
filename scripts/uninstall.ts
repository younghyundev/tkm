#!/usr/bin/env tsx
/**
 * Tokenmon clean uninstall script.
 * Removes statusLine config, then asks whether to keep pokemon data.
 */

import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

const forceKeep = process.argv.includes('--keep-state');
const forceRemove = process.argv.includes('--remove-all');
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const DATA_DIR = join(CLAUDE_DIR, 'tokenmon');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
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

  // 2. Handle data directory
  if (!existsSync(DATA_DIR)) {
    console.log('  [-] data directory not found');
    console.log('\nDone. Run "/plugin uninstall tokenmon@tokenmon" to remove the plugin itself.');
    return;
  }

  // Determine whether to keep state
  let keepState = forceKeep;

  if (!forceKeep && !forceRemove) {
    console.log('');
    console.log('  포켓몬 데이터가 남아있습니다:');
    console.log(`  경로: ${DATA_DIR}`);

    // Show summary of what exists
    if (existsSync(join(DATA_DIR, 'state.json'))) {
      try {
        const state = JSON.parse(readFileSync(join(DATA_DIR, 'state.json'), 'utf-8'));
        const pokemonCount = Object.keys(state.pokemon ?? {}).length;
        const achievementCount = Object.keys(state.achievements ?? {}).filter(k => state.achievements[k]).length;
        console.log(`  포켓몬: ${pokemonCount}마리 | 업적: ${achievementCount}개`);
      } catch { /* ignore */ }
    }

    console.log('');
    const answer = await ask('  포켓몬 데이터를 보존하시겠습니까? (Y/n): ');
    keepState = answer !== 'n';
  }

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
    for (const f of ['state.json.lock', 'session.json.lock', 'state.json.tmp', 'config.json.tmp', 'session.json.tmp']) {
      const p = join(DATA_DIR, f);
      if (existsSync(p)) rmSync(p);
    }
    console.log('  [v] data cleaned (state.json preserved — 재설치 시 이어서 플레이 가능)');
  } else {
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('  [v] 모든 데이터 삭제 완료');
  }

  console.log('\nDone. Run "/plugin uninstall tokenmon@tokenmon" to remove the plugin itself.');
  console.log('Restart Claude Code to apply changes.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
