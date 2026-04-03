import { readFileSync } from 'fs';
import { readSession, writeSession } from '../core/state.js';
import { readConfig } from '../core/config.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache } from '../core/paths.js';
import type { HookInput, HookOutput } from '../core/types.js';
import { playCry } from '../audio/play-cry.js';

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
      process.stderr.write(`tokenmon subagent-start: no gen binding for session ${sessionId}, skipping\n`);
      console.log('{"continue": true}');
      return;
    }
  }

  if (!agentId) {
    console.log('{"continue": true}');
    return;
  }

  let chosen: string | null = null;

  const lockResult = withLock(() => {
    const session = readSession(undefined, sessionId || undefined);
    const config = readConfig();

    // Select dispatch pokemon: prefer default_dispatch, then first unassigned
    const assignedPokemon = new Set(session.agent_assignments.map(a => a.pokemon));

    if (config.default_dispatch && config.party.includes(config.default_dispatch) && !assignedPokemon.has(config.default_dispatch)) {
      chosen = config.default_dispatch;
    } else {
      for (const p of config.party) {
        if (!assignedPokemon.has(p)) {
          chosen = p;
          break;
        }
      }
    }

    if (chosen) {
      session.agent_assignments.push({ agent_id: agentId, pokemon: chosen, xp_multiplier: 1.5 });
      writeSession(session, undefined, sessionId || undefined);
    }
  });

  if (!lockResult.acquired) {
    process.stderr.write(`tokenmon subagent-start: lock acquisition failed, agent ${agentId} untracked\n`);
  }

  if (chosen) {
    playCry(chosen);
  }

  console.log('{"continue": true}');
}

try {
  main();
} catch (err) {
  process.stderr.write(`tokenmon subagent-start: ${err}\n`);
  console.log(JSON.stringify({ continue: true }));
}
