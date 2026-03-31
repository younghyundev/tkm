import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { SESSION_PATH } from '../core/paths.js';
import { readSession, writeSession } from '../core/state.js';
import { readConfig } from '../core/config.js';
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

/**
 * Simple file-based lock using exclusive creation.
 * Returns true if lock acquired, false if already locked.
 */
function acquireLock(lockPath: string, timeoutMs: number = 5000): boolean {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // O_EXCL: fails if file already exists — atomic on local filesystems
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      // Lock held by another process, wait briefly
      const wait = 10;
      const end = Date.now() + wait;
      while (Date.now() < end) { /* busy wait */ }
    }
  }
  return false;
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // Ignore
  }
}

function main(): void {
  const input = JSON.parse(readStdin()) as HookInput;
  const agentId = input.agent_id ?? '';

  if (!agentId) {
    console.log('{"continue": true}');
    return;
  }

  const lockPath = SESSION_PATH + '.lock';

  // Ensure parent directory exists
  mkdirSync(dirname(SESSION_PATH), { recursive: true });

  if (!acquireLock(lockPath)) {
    // Timeout — proceed without assignment rather than blocking hook
    console.log('{"continue": true}');
    return;
  }

  try {
    const session = readSession();
    const config = readConfig();

    // Find first unassigned party pokemon
    const assignedPokemon = new Set(session.agent_assignments.map(a => a.pokemon));
    let chosen: string | null = null;
    for (const p of config.party) {
      if (!assignedPokemon.has(p)) {
        chosen = p;
        break;
      }
    }

    if (chosen) {
      session.agent_assignments.push({ agent_id: agentId, pokemon: chosen });
      writeSession(session);
      playCry(chosen);
    }
  } finally {
    releaseLock(lockPath);
  }

  console.log('{"continue": true}');
}

main();
