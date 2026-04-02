import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set up isolated test directory before importing state module
// Paths are cached at import time, so this must be set ONCE before import
const TEST_DIR = join(tmpdir(), `tokenmon-test-state-${Date.now()}`);
const TEST_DATA_DIR = join(TEST_DIR, 'tokenmon');
process.env.CLAUDE_CONFIG_DIR = TEST_DIR;
// Force user-scope so resolveDataDir() uses CLAUDE_DIR/tokenmon/ instead of .tokenmon/
process.env.CLAUDE_PLUGIN_ROOT = join(TEST_DIR, '.claude', 'plugins', 'cache', 'tokenmon');

// Dynamic import after env setup
const { readState, writeState, pruneSessionTokens, readSession, writeSession, readSessionGenMap, writeSessionGenMap, pruneSessionGenMap } = await import('../src/core/state.js');
const { statePath, SESSION_GEN_MAP_PATH } = await import('../src/core/paths.js');

function freshDir(): void {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DATA_DIR, { recursive: true });
}

// --- State tests (sequential) ---

await test('readState returns defaults when file missing', () => {
  freshDir();
  const state = readState();
  assert.deepEqual(state.pokemon, {});
  assert.deepEqual(state.unlocked, []);
  assert.deepEqual(state.achievements, {});
  assert.equal(state.total_tokens_consumed, 0);
  assert.equal(state.session_count, 0);
  assert.equal(state.xp_bonus_multiplier, 1.0);
});

await test('writeState + readState roundtrip persists all fields', () => {
  freshDir();
  const state = readState();
  state.pokemon['모부기'] = { id: 387, xp: 5000, level: 10, friendship: 0, ev: 0 };
  state.unlocked.push('모부기');
  state.session_count = 42;
  state.total_tokens_consumed = 100000;
  state.last_session_tokens['abc'] = 5000;
  writeState(state);

  const loaded = readState();
  assert.equal(loaded.pokemon['모부기'].xp, 5000);
  assert.equal(loaded.pokemon['모부기'].level, 10);
  assert.deepEqual(loaded.unlocked, ['모부기']);
  assert.equal(loaded.session_count, 42);
  assert.equal(loaded.total_tokens_consumed, 100000);
  assert.equal(loaded.last_session_tokens['abc'], 5000);
});

await test('atomic write uses tmp file (no partial writes)', () => {
  freshDir();
  const state = readState();
  state.session_count = 1;
  writeState(state);

  const actualPath = statePath();
  const tmpPath = actualPath + '.tmp';
  assert.equal(existsSync(tmpPath), false);

  const raw = readFileSync(actualPath, 'utf-8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

// --- pruneSessionTokens ---

await test('pruneSessionTokens keeps all when <= 20 entries', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 20; i++) tokens[`s${i}`] = i * 100;
  const result = pruneSessionTokens(tokens);
  assert.equal(Object.keys(result).length, 20);
});

await test('pruneSessionTokens prunes to 20 when > 20 entries', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 25; i++) tokens[`s${i}`] = i * 100;
  const result = pruneSessionTokens(tokens);
  assert.equal(Object.keys(result).length, 20);
});

await test('pruneSessionTokens keeps highest values', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 25; i++) tokens[`s${i}`] = i * 100;
  const result = pruneSessionTokens(tokens);
  assert.ok(!('s0' in result), 's0 (value 0) should be pruned');
  assert.ok(!('s4' in result), 's4 (value 400) should be pruned');
  assert.ok('s5' in result, 's5 (value 500) should be kept');
  assert.ok('s24' in result, 's24 (value 2400) should be kept');
});

await test('pruneSessionTokens empty object returns empty', () => {
  assert.deepEqual(pruneSessionTokens({}), {});
});

// --- Session tests (sequential) ---

await test('readSession returns defaults when missing', () => {
  freshDir();
  const session = readSession();
  assert.equal(session.session_id, null);
  assert.deepEqual(session.agent_assignments, []);
});

await test('writeSession + readSession roundtrip', () => {
  freshDir();
  writeSession({
    session_id: 'test-123',
    agent_assignments: [{ agent_id: 'a1', pokemon: '모부기' }],
    evolution_events: [],
    achievement_events: [],
  });
  const loaded = readSession();
  assert.equal(loaded.session_id, 'test-123');
  assert.equal(loaded.agent_assignments.length, 1);
  assert.equal(loaded.agent_assignments[0].pokemon, '모부기');
});

// --- Session-gen-map tests ---

await test('readSessionGenMap returns {} when file missing', () => {
  freshDir();
  const map = readSessionGenMap();
  assert.deepEqual(map, {});
});

await test('writeSessionGenMap + readSessionGenMap roundtrip', () => {
  freshDir();
  const map = {
    'sess-abc': { generation: 'gen4', created: new Date().toISOString() },
    'sess-xyz': { generation: 'gen1', created: new Date().toISOString() },
  };
  writeSessionGenMap(map);
  const loaded = readSessionGenMap();
  assert.equal(loaded['sess-abc'].generation, 'gen4');
  assert.equal(loaded['sess-xyz'].generation, 'gen1');
  assert.equal(Object.keys(loaded).length, 2);
});

await test('pruneSessionGenMap removes entries older than maxAge', () => {
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(); // 10 days ago
  const recent = new Date(Date.now() - 1 * 3600 * 1000).toISOString();   // 1 hour ago
  const map = {
    'old-sess': { generation: 'gen4', created: old },
    'new-sess': { generation: 'gen4', created: recent },
  };
  const maxAge = 7 * 24 * 3600 * 1000; // 7 days
  const result = pruneSessionGenMap(map, maxAge);
  assert.ok(!('old-sess' in result), 'old entry should be pruned');
  assert.ok('new-sess' in result, 'recent entry should be kept');
  assert.equal(Object.keys(result).length, 1);
});

await test('pruneSessionGenMap keeps all entries younger than maxAge', () => {
  const recent1 = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const recent2 = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const map = {
    'a': { generation: 'gen4', created: recent1 },
    'b': { generation: 'gen1', created: recent2 },
  };
  const result = pruneSessionGenMap(map, 7 * 24 * 3600 * 1000);
  assert.equal(Object.keys(result).length, 2);
});

await test('pruneSessionGenMap returns {} for empty map', () => {
  assert.deepEqual(pruneSessionGenMap({}, 7 * 24 * 3600 * 1000), {});
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
