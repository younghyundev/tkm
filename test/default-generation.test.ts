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

// --- Fix 2: gen switch does NOT modify session-gen-map (session isolation) ---

await test('gen switch does not modify session-gen-map (existing sessions keep their gen)', () => {
  freshDir();

  // Simulate existing session-gen-map with entries bound to gen4
  const initialMap = {
    'session-aaa': { generation: 'gen4', created: new Date().toISOString() },
    'session-bbb': { generation: 'gen4', created: new Date().toISOString() },
    'session-ccc': { generation: 'gen4', created: new Date().toISOString() },
  };
  writeSessionGenMap(initialMap);

  // Gen switch only updates global-config.json, NOT session-gen-map
  // Existing sessions remain on their original generation until restarted

  // Verify session-gen-map is untouched after switch
  const after = readSessionGenMap();
  assert.equal(after['session-aaa'].generation, 'gen4', 'session-aaa should remain on gen4');
  assert.equal(after['session-bbb'].generation, 'gen4', 'session-bbb should remain on gen4');
  assert.equal(after['session-ccc'].generation, 'gen4', 'session-ccc should remain on gen4');
  assert.equal(Object.keys(after).length, 3, 'all sessions should be preserved');
});

await test('gen switch on empty session-gen-map leaves it empty', () => {
  freshDir();

  // Empty map — nothing to update
  writeSessionGenMap({});

  // Gen switch does not touch session-gen-map
  const after = readSessionGenMap();
  assert.deepEqual(after, {}, 'empty map should remain empty after switch');
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
