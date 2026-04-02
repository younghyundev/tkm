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
const { statePath, sessionPath, SESSION_GEN_MAP_PATH } = await import('../src/core/paths.js');

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

await test('pruneSessionTokens with activeSessionIds preserves active sessions even with low token count', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 25; i++) tokens[`s${i}`] = i * 100;
  // s0 has value 0 (would normally be pruned), but mark it as active
  const activeIds = new Set(['s0', 's1']);
  const result = pruneSessionTokens(tokens, activeIds);
  assert.ok('s0' in result, 's0 (active, value 0) should be preserved');
  assert.ok('s1' in result, 's1 (active, value 100) should be preserved');
  assert.equal(Object.keys(result).length, 20);
});

await test('pruneSessionTokens with activeSessionIds fills remaining slots by token count', () => {
  const tokens: Record<string, number> = {};
  for (let i = 0; i < 25; i++) tokens[`s${i}`] = i * 100;
  const activeIds = new Set(['s0']); // 1 active, 19 slots for inactive
  const result = pruneSessionTokens(tokens, activeIds);
  assert.ok('s0' in result, 's0 (active) should be preserved');
  // The 19 highest-value inactive sessions should fill remaining slots
  assert.ok('s24' in result, 's24 (highest value inactive) should be kept');
  assert.ok('s6' in result, 's6 should be kept (top 19 inactive)');
  assert.ok(!('s5' in result), 's5 should be pruned (21st slot)');
  assert.equal(Object.keys(result).length, 20);
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
  const now = new Date().toISOString();
  const map = {
    'sess-abc': { generation: 'gen4', created: now, last_seen: now },
    'sess-xyz': { generation: 'gen1', created: now, last_seen: now },
  };
  writeSessionGenMap(map);
  const loaded = readSessionGenMap();
  assert.equal(loaded['sess-abc'].generation, 'gen4');
  assert.equal(loaded['sess-xyz'].generation, 'gen1');
  assert.equal(Object.keys(loaded).length, 2);
});

await test('pruneSessionGenMap removes entries where last_seen is older than maxAge', () => {
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(); // 10 days ago
  const recent = new Date(Date.now() - 1 * 3600 * 1000).toISOString();   // 1 hour ago
  const map = {
    'old-sess': { generation: 'gen4', created: old, last_seen: old },
    'new-sess': { generation: 'gen4', created: old, last_seen: recent },
  };
  const maxAge = 7 * 24 * 3600 * 1000; // 7 days
  const result = pruneSessionGenMap(map, maxAge);
  assert.ok(!('old-sess' in result), 'old entry should be pruned');
  assert.ok('new-sess' in result, 'recent last_seen entry should be kept even if created is old');
  assert.equal(Object.keys(result).length, 1);
});

await test('pruneSessionGenMap uses created as fallback when last_seen missing', () => {
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(); // 10 days ago
  const recent = new Date(Date.now() - 1 * 3600 * 1000).toISOString();   // 1 hour ago
  // Simulate legacy entries without last_seen field
  const map = {
    'old-sess': { generation: 'gen4', created: old, last_seen: '' },
    'new-sess': { generation: 'gen4', created: recent, last_seen: '' },
  };
  const maxAge = 7 * 24 * 3600 * 1000;
  const result = pruneSessionGenMap(map, maxAge);
  assert.ok(!('old-sess' in result), 'old entry should be pruned via created fallback');
  assert.ok('new-sess' in result, 'recent entry should be kept via created fallback');
});

await test('pruneSessionGenMap keeps all entries younger than maxAge', () => {
  const recent1 = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const recent2 = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const map = {
    'a': { generation: 'gen4', created: recent1, last_seen: recent1 },
    'b': { generation: 'gen1', created: recent2, last_seen: recent2 },
  };
  const result = pruneSessionGenMap(map, 7 * 24 * 3600 * 1000);
  assert.equal(Object.keys(result).length, 2);
});

await test('pruneSessionGenMap returns {} for empty map', () => {
  assert.deepEqual(pruneSessionGenMap({}, 7 * 24 * 3600 * 1000), {});
});

await test('pruneSessionGenMap default TTL is 30 days (keeps 20-day-old entries)', () => {
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
  const map = {
    'twenty-day-old': { generation: 'gen4', created: twentyDaysAgo, last_seen: twentyDaysAgo },
  };
  // Default maxAge should be 30 days, so 20-day-old entry should be kept
  const result = pruneSessionGenMap(map);
  assert.ok('twenty-day-old' in result, '20-day-old session should be kept with 30-day default TTL');
});

await test('pruneSessionGenMap default TTL prunes entries older than 30 days', () => {
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
  const map = {
    'very-old': { generation: 'gen4', created: thirtyOneDaysAgo, last_seen: thirtyOneDaysAgo },
  };
  const result = pruneSessionGenMap(map);
  assert.ok(!('very-old' in result), '31-day-old session should be pruned with 30-day default TTL');
});

// --- sessionPath with sessionId tests ---

await test('sessionPath with sessionId returns per-session path under sessions/ dir', () => {
  freshDir();
  const path = sessionPath('gen4', 'my-session-id');
  assert.ok(path.includes('sessions'), 'path should include sessions/ dir');
  assert.ok(path.endsWith('my-session-id.json'), 'path should end with session id .json');
});

await test('sessionPath without sessionId returns singleton session.json', () => {
  freshDir();
  const path = sessionPath('gen4');
  assert.ok(path.endsWith('session.json'), 'path should end with session.json');
  assert.ok(!path.includes('/sessions/'), 'path should not include sessions/ subdir');
});

await test('readSession and writeSession roundtrip with sessionId', () => {
  freshDir();
  writeSession({
    session_id: 'sess-per-file',
    agent_assignments: [{ agent_id: 'agent-1', pokemon: 'bulbasaur', xp_multiplier: 1.5 }],
    evolution_events: [],
    achievement_events: [],
  }, undefined, 'sess-per-file');
  const loaded = readSession(undefined, 'sess-per-file');
  assert.equal(loaded.session_id, 'sess-per-file');
  assert.equal(loaded.agent_assignments.length, 1);
  assert.equal(loaded.agent_assignments[0].agent_id, 'agent-1');
});

await test('two sessions with different sessionIds do not clobber each other', () => {
  freshDir();
  writeSession({
    session_id: 'sess-A',
    agent_assignments: [{ agent_id: 'agent-A', pokemon: 'bulbasaur', xp_multiplier: 1.5 }],
    evolution_events: [],
    achievement_events: [],
  }, undefined, 'sess-A');
  writeSession({
    session_id: 'sess-B',
    agent_assignments: [{ agent_id: 'agent-B', pokemon: 'charmander', xp_multiplier: 1.5 }],
    evolution_events: [],
    achievement_events: [],
  }, undefined, 'sess-B');
  const sessA = readSession(undefined, 'sess-A');
  const sessB = readSession(undefined, 'sess-B');
  assert.equal(sessA.agent_assignments[0].agent_id, 'agent-A');
  assert.equal(sessB.agent_assignments[0].agent_id, 'agent-B');
});

// --- Fail-closed behavior tests ---

await test('pruneSessionGenMap: active session kept via last_seen even when created is old', () => {
  const oldCreated = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(); // 10 days ago
  const recentLastSeen = new Date(Date.now() - 1 * 3600 * 1000).toISOString();   // 1 hour ago
  const map = {
    'long-running': { generation: 'gen4', created: oldCreated, last_seen: recentLastSeen },
  };
  const result = pruneSessionGenMap(map, 7 * 24 * 3600 * 1000);
  assert.ok('long-running' in result, 'long-running session with recent last_seen should be kept');
});

// Cleanup
rmSync(TEST_DIR, { recursive: true, force: true });
