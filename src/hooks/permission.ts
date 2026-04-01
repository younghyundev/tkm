import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig, writeConfig } from '../core/config.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { playCry } from '../audio/play-cry.js';
import { initLocale } from '../i18n/index.js';
import type { HookOutput } from '../core/types.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function main(): void {
  readStdin(); // consume stdin per hook protocol

  const state = readState();
  const config = readConfig();
  initLocale(config.language ?? 'ko');

  // Increment permission_count
  state.permission_count += 1;

  // Check achievements (permission_master)
  const messages: string[] = [];
  const achEvents = checkAchievements(state, config);
  for (const achEvent of achEvents) {
    messages.push(formatAchievementMessage(achEvent));
  }

  writeState(state);
  writeConfig(config); // permission_master may update max_party_size

  // Play cry async
  try {
    playCry();
  } catch {
    // Ignore
  }

  const output: HookOutput = { continue: true };
  if (messages.length > 0) {
    output.system_message = messages.join('\n');
  }
  console.log(JSON.stringify(output));
}

main();
