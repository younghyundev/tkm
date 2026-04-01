import { readFileSync } from 'fs';
import { readSession, writeSession } from '../core/state.js';
import { withLock } from '../core/lock.js';
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

  if (!agentId) {
    console.log('{"continue": true}');
    return;
  }

  let removedPokemon: string | null = null;

  const lockResult = withLock(() => {
    const session = readSession();
    const removed = session.agent_assignments.find(a => a.agent_id === agentId);
    session.agent_assignments = session.agent_assignments.filter(a => a.agent_id !== agentId);
    writeSession(session);
    if (removed) {
      removedPokemon = removed.pokemon;
    }
  });

  if (lockResult === null) {
    process.stderr.write(`tokenmon subagent-stop: lock acquisition failed, agent ${agentId} cleanup skipped\n`);
  }

  if (removedPokemon) {
    playCry(removedPokemon);
  }

  console.log('{"continue": true}');
}

main();
