import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig, writeConfig } from '../core/config.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { playCry } from '../audio/play-cry.js';
import { initLocale } from '../i18n/index.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache } from '../core/paths.js';
import type { HookInput, HookOutput } from '../core/types.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function main(): void {
  const stdinData = readStdin();
  try {
    const input = JSON.parse(stdinData) as HookInput;
    const sessionId = input.session_id ?? '';
    if (sessionId) {
      const resolvedGen = getSessionGeneration(sessionId);
      setActiveGenerationCache(resolvedGen);
    }
  } catch { /* fall through */ }

  const messages: string[] = [];

  const result = withLock(() => {
    const state = readState();
    const config = readConfig();
    initLocale(config.language ?? 'en');

    // Increment permission_count
    state.permission_count += 1;

    // Check achievements (permission_master)
    const achEvents = checkAchievements(state, config);
    for (const achEvent of achEvents) {
      messages.push(formatAchievementMessage(achEvent));
    }

    writeState(state);
    writeConfig(config); // permission_master may update max_party_size
  });

  // Lock failed — skip gracefully
  if (result === null) {
    // no-op
  }

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

try {
  main();
} catch (err) {
  process.stderr.write(`tokenmon permission: ${err}\n`);
  console.log(JSON.stringify({ continue: true }));
}
