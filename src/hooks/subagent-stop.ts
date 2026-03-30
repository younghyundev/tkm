import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { SESSION_PATH } from '../core/paths.js';
import { readSession, writeSession } from '../core/state.js';
import type { HookInput, HookOutput } from '../core/types.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function acquireLock(lockPath: string, timeoutMs: number = 5000): boolean {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
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
  mkdirSync(dirname(SESSION_PATH), { recursive: true });

  if (!acquireLock(lockPath)) {
    console.log('{"continue": true}');
    return;
  }

  try {
    const session = readSession();
    session.agent_assignments = session.agent_assignments.filter(a => a.agent_id !== agentId);
    writeSession(session);
  } finally {
    releaseLock(lockPath);
  }

  console.log('{"continue": true}');
}

main();
