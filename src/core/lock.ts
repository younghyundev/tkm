/**
 * Global lock module for tokenmon.
 * Lock file: ~/.claude/tokenmon/tokenmon.lock
 *
 * - Single global lock protects all state/config/session mutations
 * - PID stored in lock file for stale detection
 * - On timeout: check if PID alive → force release if dead → retry once
 * - Atomics.wait for non-busy sleep
 * - process.on('exit') safety net for lock cleanup
 *
 * WARNING: Not reentrant — nested withLock calls will deadlock.
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { LOCK_PATH } from './paths.js';

let lockHeld = false;

// Safety net: clean up lock on process exit (covers process.exit, SIGTERM, SIGINT — not SIGKILL)
process.on('exit', () => {
  if (lockHeld) {
    try { unlinkSync(LOCK_PATH); } catch { /* ignore */ }
  }
});

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireGlobalLock(timeoutMs: number): boolean {
  const dir = dirname(LOCK_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
      lockHeld = true;
      return true;
    } catch {
      // Lock held by another process — non-busy sleep 50ms
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }

  // Timeout: check if lock holder is alive (PID-based stale detection)
  try {
    const pidStr = readFileSync(LOCK_PATH, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);
    if (!isNaN(pid) && !isProcessAlive(pid)) {
      // Dead process — force release and retry once
      try { unlinkSync(LOCK_PATH); } catch { /* ignore */ }
      try {
        writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
        lockHeld = true;
        return true;
      } catch { /* someone else acquired it */ }
    }
  } catch { /* ignore read errors */ }

  return false;
}

function releaseGlobalLock(): void {
  lockHeld = false;
  try { unlinkSync(LOCK_PATH); } catch { /* ignore */ }
}

/**
 * Execute fn under the global tokenmon lock.
 * Returns fn's result on success, or null if lock acquisition fails.
 *
 * Hooks: check for null return and skip gracefully.
 * CLI: check for null return and display an error message.
 */
export function withLock<T>(fn: () => T, timeoutMs: number = 5000): T | null {
  if (!acquireGlobalLock(timeoutMs)) return null;
  try {
    return fn();
  } finally {
    releaseGlobalLock();
  }
}
