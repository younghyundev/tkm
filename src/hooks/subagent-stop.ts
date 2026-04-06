import { readFileSync } from 'fs';
import { readSession, writeSession, readState, writeState } from '../core/state.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache } from '../core/paths.js';
import type { HookInput, HookOutput } from '../core/types.js';
import { playCry } from '../audio/play-cry.js';
import { readConfig, readGlobalConfig } from '../core/config.js';
import { addItem, randInt } from '../core/items.js';
import { initLocale, t } from '../i18n/index.js';

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
  const agentId = input.agent_id ?? '';
  const sessionId = input.session_id ?? '';
  if (sessionId) {
    const resolvedGen = getSessionGeneration(sessionId);
    if (resolvedGen) {
      setActiveGenerationCache(resolvedGen);
    } else {
      process.stderr.write(`tokenmon subagent-stop: no gen binding for session ${sessionId}, skipping\n`);
      console.log('{"continue": true}');
      return;
    }
  }

  if (!agentId) {
    console.log('{"continue": true}');
    return;
  }

  let removedPokemon: string | null = null;
  let ballMessage: string | null = null;

  const lockResult = withLock(() => {
    const session = readSession(undefined, sessionId || undefined);
    const removed = session.agent_assignments.find(a => a.agent_id === agentId);
    session.agent_assignments = session.agent_assignments.filter(a => a.agent_id !== agentId);
    writeSession(session, undefined, sessionId || undefined);
    if (removed) {
      removedPokemon = removed.pokemon;
    }

    // Action-based ball drop: 100% chance, 3~5 balls
    const state = readState();
    const config = readConfig();
    const globalConfig = readGlobalConfig();
    initLocale(config.language ?? 'en', globalConfig.voice_tone);
    const count = randInt(3, 5);
    addItem(state, 'pokeball', count);
    writeState(state);
    ballMessage = t('item_drop.subagent', { n: count });
  });

  if (!lockResult.acquired) {
    process.stderr.write(`tokenmon subagent-stop: lock acquisition failed, agent ${agentId} cleanup skipped\n`);
  }

  if (removedPokemon) {
    playCry(removedPokemon);
  }

  const output: HookOutput = { continue: true };
  if (ballMessage) {
    output.system_message = ballMessage;
  }
  console.log(JSON.stringify(output));
}

try {
  main();
} catch (err) {
  process.stderr.write(`tokenmon subagent-stop: ${err}\n`);
  console.log(JSON.stringify({ continue: true }));
}
