import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig, readGlobalConfig } from '../core/config.js';
import { addItem, randInt } from '../core/items.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache, getActiveGeneration } from '../core/paths.js';
import { initLocale, t } from '../i18n/index.js';
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
  const input = JSON.parse(readStdin()) as HookInput;
  const sessionId = input.session_id ?? '';

  if (sessionId) {
    const resolvedGen = getSessionGeneration(sessionId);
    if (resolvedGen) {
      setActiveGenerationCache(resolvedGen);
    } else {
      console.log('{"continue": true}');
      return;
    }
  } else {
    setActiveGenerationCache(getActiveGeneration());
  }

  const output: HookOutput = { continue: true };

  // 10% chance to drop 1~2 balls
  if (Math.random() >= 0.10) {
    console.log(JSON.stringify(output));
    return;
  }

  const lockResult = withLock(() => {
    const state = readState();
    const config = readConfig();
    const globalConfig = readGlobalConfig();
    initLocale(config.language ?? 'en', globalConfig.voice_tone);

    const count = randInt(1, 2);
    addItem(state, 'pokeball', count);
    writeState(state);

    return t('item_drop.tool', { n: count });
  });

  if (lockResult.acquired && lockResult.value) {
    output.system_message = lockResult.value;
  }

  console.log(JSON.stringify(output));
}

try {
  main();
} catch (err) {
  process.stderr.write(`tokenmon post-tool-use: ${err}\n`);
  console.log('{"continue": true}');
}
