import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Isolated test directory — must be set before importing paths module
const TEST_DIR = join(tmpdir(), `tokenmon-paths-test-${Date.now()}`);
const TEST_DATA_DIR = join(TEST_DIR, 'tokenmon');
process.env.CLAUDE_CONFIG_DIR = TEST_DIR;
process.env.CLAUDE_PLUGIN_ROOT = join(TEST_DIR, '.claude', 'plugins', 'cache', 'tokenmon');

mkdirSync(TEST_DATA_DIR, { recursive: true });

const { getSessionGeneration, SESSION_GEN_MAP_PATH, setActiveGenerationCache } = await import('../src/core/paths.js');

// Pin active gen so fallback is deterministic
setActiveGenerationCache('gen4');

const MAP_PATH = SESSION_GEN_MAP_PATH;

function writeMap(map: Record<string, { generation: string; created: string; last_seen: string }>): void {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), 'utf-8');
}

test('getSessionGeneration returns bound generation when session exists in map', () => {
  const now = new Date().toISOString();
  writeMap({
    'sess-111': { generation: 'gen1', created: now, last_seen: now },
  });
  const gen = getSessionGeneration('sess-111');
  assert.equal(gen, 'gen1');
});

test('getSessionGeneration returns null when session not in map', () => {
  const now = new Date().toISOString();
  writeMap({
    'sess-111': { generation: 'gen1', created: now, last_seen: now },
  });
  const gen = getSessionGeneration('unknown-session');
  assert.equal(gen, null);
});

test('getSessionGeneration returns null when sessionId is empty string', () => {
  const now = new Date().toISOString();
  writeMap({
    'sess-111': { generation: 'gen1', created: now, last_seen: now },
  });
  const gen = getSessionGeneration('');
  assert.equal(gen, null);
});

test('getSessionGeneration returns null when map file is missing', () => {
  // Remove map file
  try { rmSync(MAP_PATH); } catch { /* already absent */ }
  const gen = getSessionGeneration('any-session');
  assert.equal(gen, null);
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
