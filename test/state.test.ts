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
const { readState, writeState, pruneSessionTokens, readSession, writeSession } = await import('../src/core/state.js');

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

  const tmpPath = join(TEST_DATA_DIR, 'state.json.tmp');
  assert.equal(existsSync(tmpPath), false);

  const raw = readFileSync(join(TEST_DATA_DIR, 'state.json'), 'utf-8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

// --- pruneSessionTokens ---

await test('pruneSessionTokens keeps all when <= 10 entries', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 10; i++) tokens[`s${i}`] = i * 100;
  const result = pruneSessionTokens(tokens);
  assert.equal(Object.keys(result).length, 10);
});

await test('pruneSessionTokens prunes to 10 when > 10 entries', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 15; i++) tokens[`s${i}`] = i * 100;
  const result = pruneSessionTokens(tokens);
  assert.equal(Object.keys(result).length, 10);
});

await test('pruneSessionTokens keeps highest values', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 15; i++) tokens[`s${i}`] = i * 100;
  const result = pruneSessionTokens(tokens);
  assert.ok(!('s0' in result), 's0 (value 0) should be pruned');
  assert.ok(!('s4' in result), 's4 (value 400) should be pruned');
  assert.ok('s5' in result, 's5 (value 500) should be kept');
  assert.ok('s14' in result, 's14 (value 1400) should be kept');
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

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
