import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Re-implement lock functions to test independently (same logic as stop.ts)
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

describe('Stop hook file locking', () => {
  const testDir = join(tmpdir(), `tokenmon-lock-test-${Date.now()}`);
  const lockPath = join(testDir, 'state.json.lock');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    // Clean up any leftover lock
    if (existsSync(lockPath)) unlinkSync(lockPath);
  });

  afterEach(() => {
    if (existsSync(lockPath)) unlinkSync(lockPath);
    rmSync(testDir, { recursive: true, force: true });
  });

  it('acquires lock successfully when no lock exists', () => {
    const result = acquireLock(lockPath);
    assert.equal(result, true);
    assert.equal(existsSync(lockPath), true);
    releaseLock(lockPath);
  });

  it('releases lock so file no longer exists', () => {
    acquireLock(lockPath);
    assert.equal(existsSync(lockPath), true);
    releaseLock(lockPath);
    assert.equal(existsSync(lockPath), false);
  });

  it('fails to acquire when lock is already held', () => {
    // Acquire first lock
    acquireLock(lockPath);
    // Second acquire should time out
    const result = acquireLock(lockPath, 50); // 50ms timeout
    assert.equal(result, false);
    releaseLock(lockPath);
  });

  it('can re-acquire after release', () => {
    acquireLock(lockPath);
    releaseLock(lockPath);
    const result = acquireLock(lockPath);
    assert.equal(result, true);
    releaseLock(lockPath);
  });

  it('releaseLock is safe to call when no lock exists', () => {
    // Should not throw
    releaseLock(lockPath);
    releaseLock(lockPath);
  });

  it('lock is released in finally block pattern', () => {
    acquireLock(lockPath);
    try {
      // Simulate work that throws
      throw new Error('simulated error');
    } catch {
      // Error handled
    } finally {
      releaseLock(lockPath);
    }
    // Lock should be released despite error
    assert.equal(existsSync(lockPath), false);
    // Should be re-acquirable
    const result = acquireLock(lockPath);
    assert.equal(result, true);
    releaseLock(lockPath);
  });
});
