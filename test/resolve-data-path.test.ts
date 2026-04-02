import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Tests for resolveDataPath strictness (via getPokemonDB public API).
 *
 * resolveDataPath throws for non-gen4 generation when:
 *   - The per-gen directory EXISTS (so genDataDir returns it, not the legacy fallback)
 *   - But the specific data file (pokemon.json) does NOT exist inside it
 *
 * We set up a fake PLUGIN_ROOT with:
 *   - data/gen_stub/ directory (exists, so no legacy fallback)
 *   - No pokemon.json inside (triggers the throw)
 */
const TEST_DIR = join(tmpdir(), `tokenmon-resolve-path-test-${Date.now()}`);

// Create fake plugin root: has gen_stub dir but no files inside
mkdirSync(join(TEST_DIR, 'data', 'gen_stub'), { recursive: true });

// Set env before importing modules (PLUGIN_ROOT is resolved at import time)
process.env.CLAUDE_CONFIG_DIR = TEST_DIR;
process.env.CLAUDE_PLUGIN_ROOT = TEST_DIR;

const { getPokemonDB, _resetForTesting } = await import('../src/core/pokemon-data.js');

test('resolveDataPath throws for non-gen4 generation when per-gen file missing', () => {
  _resetForTesting();
  assert.throws(
    () => getPokemonDB('gen_stub'),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes('gen_stub') || err.message.includes('Missing data file'),
        `Expected gen name or 'Missing data file' in error: ${err.message}`
      );
      return true;
    }
  );
});

test('resolveDataPath gen4 fallback does not throw even when per-gen file missing', () => {
  _resetForTesting();
  // gen4 dir also doesn't exist in fake PLUGIN_ROOT — falls through to legacy path
  // Legacy path also missing, so this throws a file-not-found, NOT the "Missing data file" error
  // This confirms gen4 doesn't get the strict rejection (it tries the legacy path)
  assert.throws(
    () => getPokemonDB('gen4'),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      // Should be ENOENT from trying the legacy path, NOT the strict "Missing data file" error
      assert.ok(
        !err.message.includes('Missing data file'),
        `gen4 should not get strict rejection, but got: ${err.message}`
      );
      return true;
    }
  );
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
