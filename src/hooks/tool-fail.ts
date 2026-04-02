import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig } from '../core/config.js';
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { playCry } from '../audio/play-cry.js';
import { initLocale } from '../i18n/index.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache, getActiveGeneration } from '../core/paths.js';
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
      setActiveGenerationCache(resolvedGen ?? getActiveGeneration());
    }
  } catch { /* fall through */ }

  const messages: string[] = [];

  const result = withLock(() => {
    const state = readState();
    const config = readConfig();
    initLocale(config.language ?? 'en');

    // Increment error_count
    state.error_count += 1;

    // Check achievements (first_error)
    const achEvents = checkAchievements(state, config);
    for (const achEvent of achEvents) {
      messages.push(formatAchievementMessage(achEvent));
    }

    writeState(state);
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
  process.stderr.write(`tokenmon tool-fail: ${err}\n`);
  console.log(JSON.stringify({ continue: true }));
}
