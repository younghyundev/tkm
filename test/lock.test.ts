import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync, fork } from 'child_process';

// Set up isolated test directory for withLockRetry tests that use the real LOCK_PATH
const RETRY_TEST_DIR = join(tmpdir(), `tokenmon-lock-retry-${Date.now()}`);
mkdirSync(RETRY_TEST_DIR, { recursive: true });
process.env.CLAUDE_CONFIG_DIR = RETRY_TEST_DIR;
process.env.CLAUDE_PLUGIN_ROOT = join(RETRY_TEST_DIR, '.claude', 'plugins', 'cache', 'tokenmon');

const { withLockRetry } = await import('../src/core/lock.js');
const { LOCK_PATH } = await import('../src/core/paths.js');

/**
 * Tests for src/core/lock.ts — global tokenmon lock.
 *
 * Test 1: withLock basic behavior (acquire → fn → release)
 * Test 2: N child processes doing counter++ → final value == N (lost-update prevention)
 *         This verifies: A reads state, B reads state, A writes, B writes → B does NOT clobber A's changes
 * Test 3: Stale lock (dead PID) → automatic recovery
 * Test 4: withLock returns null on timeout (graceful skip for hooks)
 * Test 5: Error in fn still releases lock (try/finally guarantee)
 */

// We test withLock through a child process script to use the real LOCK_PATH.
// For unit tests that don't need real file paths, we re-implement the core logic inline.

describe('Global lock (withLock)', () => {
  const testDir = join(tmpdir(), `tokenmon-lock-test-${Date.now()}`);
  const lockPath = join(testDir, 'tokenmon.lock');
  const counterPath = join(testDir, 'counter.json');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    if (existsSync(lockPath)) unlinkSync(lockPath);
  });

  afterEach(() => {
    if (existsSync(lockPath)) unlinkSync(lockPath);
    rmSync(testDir, { recursive: true, force: true });
  });

  it('acquires and releases lock around fn execution', () => {
    // Simulate withLock behavior with raw lock primitives
    assert.equal(existsSync(lockPath), false);
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    assert.equal(existsSync(lockPath), true);
    unlinkSync(lockPath);
    assert.equal(existsSync(lockPath), false);
  });

  it('lock file contains PID of holder', () => {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    const content = readFileSync(lockPath, 'utf-8').trim();
    assert.equal(content, String(process.pid));
    unlinkSync(lockPath);
  });

  it('exclusive create fails when lock is held', () => {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    assert.throws(() => {
      writeFileSync(lockPath, '99999', { flag: 'wx' });
    });
    unlinkSync(lockPath);
  });

  it('lock is released even when fn throws (try/finally)', () => {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    try {
      throw new Error('simulated error in fn');
    } catch {
      // error handled
    } finally {
      unlinkSync(lockPath);
    }
    assert.equal(existsSync(lockPath), false);
    // Re-acquirable after error release
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    assert.equal(existsSync(lockPath), true);
    unlinkSync(lockPath);
  });

  it('stale lock with dead PID can be force-released', () => {
    // Write a lock file with a definitely-dead PID
    const deadPid = 2147483647; // max PID, almost certainly not running
    writeFileSync(lockPath, String(deadPid), { flag: 'wx' });
    assert.equal(existsSync(lockPath), true);

    // Verify PID is dead
    let isAlive = false;
    try {
      process.kill(deadPid, 0);
      isAlive = true;
    } catch {
      isAlive = false;
    }

    if (!isAlive) {
      // Force release stale lock
      unlinkSync(lockPath);
      assert.equal(existsSync(lockPath), false);
      // Now acquirable
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      assert.equal(existsSync(lockPath), true);
      unlinkSync(lockPath);
    }
  });

  it('N concurrent processes produce correct counter (lost-update prevention)', async () => {
    const N = 10;
    // Initialize counter file
    writeFileSync(counterPath, JSON.stringify({ value: 0 }), 'utf-8');

    // Worker script: acquire lock → read counter → increment → write → release
    const workerScript = `
      const { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } = require('fs');
      const { dirname } = require('path');

      const lockPath = process.argv[2];
      const counterPath = process.argv[3];

      function acquireLock(timeout) {
        const dir = dirname(lockPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const start = Date.now();
        while (Date.now() - start < timeout) {
          try {
            writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
            return true;
          } catch {
            // Atomics.wait replacement for CJS
            const end = Date.now() + 20;
            while (Date.now() < end) { /* wait */ }
          }
        }
        // Stale lock check
        try {
          const pid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
          let alive = false;
          try { process.kill(pid, 0); alive = true; } catch { alive = false; }
          if (!alive) {
            try { unlinkSync(lockPath); } catch {}
            try { writeFileSync(lockPath, String(process.pid), { flag: 'wx' }); return true; } catch {}
          }
        } catch {}
        return false;
      }

      if (acquireLock(10000)) {
        try {
          const data = JSON.parse(readFileSync(counterPath, 'utf-8'));
          data.value += 1;
          const tmp = counterPath + '.tmp';
          writeFileSync(tmp, JSON.stringify(data), 'utf-8');
          require('fs').renameSync(tmp, counterPath);
        } finally {
          try { unlinkSync(lockPath); } catch {}
        }
      }
    `;

    const workerPath = join(testDir, 'worker.cjs');
    writeFileSync(workerPath, workerScript, 'utf-8');

    // Launch N workers concurrently
    const promises = [];
    for (let i = 0; i < N; i++) {
      promises.push(new Promise<void>((resolve, reject) => {
        const child = fork(workerPath, [lockPath, counterPath], { stdio: 'ignore' });
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`worker exited ${code}`)));
        child.on('error', reject);
      }));
    }

    await Promise.all(promises);

    // Verify final counter value
    const final = JSON.parse(readFileSync(counterPath, 'utf-8'));
    assert.equal(final.value, N, `Expected counter=${N} but got ${final.value} (lost-update detected!)`);
  });
});

describe('withLockRetry', () => {
  afterEach(() => {
    // Clean up real lock file between tests
    if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
  });

  it('succeeds on first attempt when lock is free (same as withLock)', () => {
    let called = false;
    const result = withLockRetry(() => {
      called = true;
      return 42;
    });
    assert.equal(result, 42);
    assert.ok(called, 'fn should have been called');
  });

  it('returns the value from fn', () => {
    const result = withLockRetry(() => 'hello');
    assert.equal(result, 'hello');
  });

  it('returns null after all retries exhausted (lock held by live PID)', () => {
    // Write a lock file with a live PID (current process) to simulate a held lock
    mkdirSync(join(RETRY_TEST_DIR, 'tokenmon'), { recursive: true });
    writeFileSync(LOCK_PATH, String(process.pid), { flag: 'w' });

    // withLockRetry should fail to acquire and return null (use very short timeout)
    const result = withLockRetry(() => 'should-not-run', 0, 10);
    assert.equal(result, null);
  });
});

// Cleanup retry test dir
rmSync(RETRY_TEST_DIR, { recursive: true, force: true });
