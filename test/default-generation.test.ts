import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set up isolated test environment before any imports
const TEST_DIR = join(tmpdir(), `tokenmon-test-default-gen-${Date.now()}`);
const TEST_DATA_DIR = join(TEST_DIR, 'tokenmon');
const TEST_PLUGIN_ROOT = join(TEST_DIR, 'plugin');
process.env.CLAUDE_CONFIG_DIR = TEST_DIR;
process.env.CLAUDE_PLUGIN_ROOT = TEST_PLUGIN_ROOT;

// Dynamic imports after env setup
const { readSessionGenMap, writeSessionGenMap } = await import('../src/core/state.js');
const { clearActiveGenerationCache } = await import('../src/core/paths.js');

function freshDir(): void {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(join(TEST_PLUGIN_ROOT, 'data'), { recursive: true });
}

// --- Fix 1: getDefaultGen reads from generations.json ---

await test('getActiveGeneration uses default_generation from generations.json', async () => {
  freshDir();
  // Write generations.json with a custom default
  writeFileSync(
    join(TEST_PLUGIN_ROOT, 'data', 'generations.json'),
    JSON.stringify({
      generations: {
        gen1: { id: 'gen1', name: 'Generation I', region_name: { en: 'Kanto', ko: '관동' }, pokemon_range: [1, 151], starters: ['1', '4', '7'], order: 1 },
        gen4: { id: 'gen4', name: 'Generation IV', region_name: { en: 'Sinnoh', ko: '신오' }, pokemon_range: [280, 493], starters: ['387', '390', '393'], order: 4 },
      },
      default_generation: 'gen1',
    }),
    'utf-8'
  );

  // Also create gen1 data dir so validateGeneration passes
  mkdirSync(join(TEST_PLUGIN_ROOT, 'data', 'gen1'), { recursive: true });

  // Re-import paths to get fresh module in this test (clear cache via exported fn)
  const { getActiveGeneration, clearActiveGenerationCache: clearCache } = await import('../src/core/paths.js');
  clearCache();

  // No global-config.json → falls through to generations.json default
  const gen = getActiveGeneration();
  assert.equal(gen, 'gen1', 'should read default_generation from generations.json');
});

await test('getActiveGeneration falls back to gen4 when generations.json missing', async () => {
  freshDir();
  // No generations.json written

  const { getActiveGeneration, clearActiveGenerationCache: clearCache } = await import('../src/core/paths.js');
  clearCache();

  // No global-config.json, no generations.json → ultimate fallback
  const gen = getActiveGeneration();
  assert.equal(gen, 'gen4', 'should fall back to gen4 when generations.json missing');
});

// --- Fix 2: gen switch updates all session-gen-map entries ---

await test('gen switch updates all active session bindings to new generation', () => {
  freshDir();

  // Simulate existing session-gen-map with entries bound to gen4
  const initialMap = {
    'session-aaa': { generation: 'gen4', created: new Date().toISOString() },
    'session-bbb': { generation: 'gen4', created: new Date().toISOString() },
    'session-ccc': { generation: 'gen4', created: new Date().toISOString() },
  };
  writeSessionGenMap(initialMap);

  // Simulate what gen switch does: update all entries to new gen
  const targetGen = 'gen1';
  const genMap = readSessionGenMap();
  for (const entry of Object.values(genMap)) {
    entry.generation = targetGen;
  }
  writeSessionGenMap(genMap);

  // Verify all sessions now point to gen1
  const updated = readSessionGenMap();
  assert.equal(updated['session-aaa'].generation, 'gen1', 'session-aaa should switch to gen1');
  assert.equal(updated['session-bbb'].generation, 'gen1', 'session-bbb should switch to gen1');
  assert.equal(updated['session-ccc'].generation, 'gen1', 'session-ccc should switch to gen1');
  assert.equal(Object.keys(updated).length, 3, 'all sessions should be preserved');
});

await test('gen switch on empty session-gen-map is a no-op', () => {
  freshDir();

  // Empty map
  writeSessionGenMap({});

  const genMap = readSessionGenMap();
  for (const entry of Object.values(genMap)) {
    entry.generation = 'gen1';
  }
  writeSessionGenMap(genMap);

  const updated = readSessionGenMap();
  assert.deepEqual(updated, {}, 'empty map should remain empty after switch');
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
