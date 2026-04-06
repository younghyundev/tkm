import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAchievements, checkCommonAchievements, formatAchievementMessage } from '../src/core/achievements.js';
import { readCommonState } from '../src/core/state.js';
import { runMigrations } from '../src/core/migration.js';
import { levelToXp } from '../src/core/xp.js';
import { makeState, makeConfig } from './helpers.js';
import { initLocale } from '../src/i18n/index.js';
import type { CommonState } from '../src/core/types.js';

function makeCommonState(overrides: Partial<CommonState> = {}): CommonState {
  return {
    achievements: {},
    encounter_rate_bonus: 0,
    xp_bonus_multiplier: 0,
    items: {},
    max_party_size_bonus: 0,
    session_count: 0,
    total_tokens_consumed: 0,
    battle_count: 0,
    battle_wins: 0,
    catch_count: 0,
    evolution_count: 0,
    error_count: 0,
    permission_count: 0,
    ...overrides,
  };
}

initLocale('ko');

describe('checkAchievements', () => {
  it('first_session triggers at session_count >= 1', () => {
    const state = makeState({ session_count: 1 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_session');
    assert.ok(ev, 'first_session should trigger');
    assert.equal(ev!.rewardPokemon, '393');
    assert.ok(state.achievements['first_session']);
    assert.ok(state.unlocked.includes('393'));
    assert.ok(state.pokemon['393']);
    assert.equal(state.pokemon['393'].id, 393);
  });

  it('first_error triggers at error_count >= 1', () => {
    const state = makeState({ error_count: 1 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_error');
    assert.ok(ev, 'first_error should trigger');
    assert.equal(ev!.rewardPokemon, '396');
    assert.ok(state.pokemon['396']);
    assert.equal(state.pokemon['396'].id, 396);
  });

  it('first_evolution triggers at evolution_count >= 1', () => {
    const state = makeState({ evolution_count: 1 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_evolution');
    assert.ok(ev, 'first_evolution should trigger');
    assert.equal(ev!.rewardPokemon, '390');
  });

  it('ten_sessions gives +20% XP bonus (common achievement)', () => {
    const state = makeState({ session_count: 10 });
    const config = makeConfig();
    const commonState = makeCommonState({ session_count: 10 });
    checkCommonAchievements(commonState, config, state);

    assert.ok(commonState.achievements['ten_sessions']);
    assert.equal(commonState.xp_bonus_multiplier, 0.2); // additive in commonState (base 0)
  });

  it('hundred_k_tokens rewards Shinx (403)', () => {
    const state = makeState({ total_tokens_consumed: 100000 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'hundred_k_tokens');
    assert.ok(ev);
    assert.equal(ev!.rewardPokemon, '403');
    assert.equal(state.pokemon['403'].id, 403);
  });

  it('five_hundred_k_tokens rewards Riolu (447)', () => {
    const state = makeState({ total_tokens_consumed: 500000 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'five_hundred_k_tokens');
    assert.ok(ev);
    assert.equal(ev!.rewardPokemon, '447');
    assert.equal(state.pokemon['447'].id, 447);
  });

  it('permission_master increases max_party_size (common achievement)', () => {
    const state = makeState({ permission_count: 50 });
    const config = makeConfig({ max_party_size: 5 });
    const commonState = makeCommonState({ permission_count: 50 });
    checkCommonAchievements(commonState, config, state);

    assert.ok(commonState.achievements['permission_master']);
    assert.equal(config.max_party_size, 6);
  });

  it('permission_master caps at 6 (common achievement)', () => {
    const state = makeState({ permission_count: 50 });
    const config = makeConfig({ max_party_size: 6 });
    const commonState = makeCommonState({ permission_count: 50 });
    checkCommonAchievements(commonState, config, state);

    assert.equal(config.max_party_size, 6);
  });

  it('does not re-trigger already achieved', () => {
    const state = makeState({
      session_count: 10,
      achievements: { first_session: true },
    });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    assert.ok(!events.find(e => e.id === 'first_session'), 'should not re-trigger gen-specific');

    // Common achievement re-trigger check
    const commonState = makeCommonState({
      session_count: 10,
      achievements: { ten_sessions: true },
    });
    const commonEvents = checkCommonAchievements(commonState, config, state);
    assert.ok(!commonEvents.find(e => e.id === 'ten_sessions'), 'should not re-trigger common');
    // XP bonus should not be applied again
    assert.equal(commonState.xp_bonus_multiplier, 0);
  });

  it('multiple achievements can trigger in one call', () => {
    const state = makeState({
      session_count: 1,
      error_count: 1,
    });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    assert.ok(events.find(e => e.id === 'first_session'));
    assert.ok(events.find(e => e.id === 'first_error'));
  });

  it('legendary/mythical reward pokemon start at level 50', () => {
    const state = makeState({ total_tokens_consumed: 1000000, catch_count: 100 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    // Dialga (#483) — legendary
    const dialga = events.find(e => e.id === 'one_million_tokens');
    assert.ok(dialga);
    assert.equal(state.pokemon['483'].level, 50, 'legendary should start at level 50');
    assert.ok(state.pokemon['483'].xp > 0, 'legendary should have XP matching level 50');

    // Arceus (#493) — mythical
    const arceus = events.find(e => e.id === 'pokedex_100');
    assert.ok(arceus);
    assert.equal(state.pokemon['493'].level, 50, 'mythical should start at level 50');
    assert.ok(state.pokemon['493'].xp > 0, 'mythical should have XP matching level 50');
  });

  it('common reward pokemon match party average level', () => {
    const state = makeState({
      total_tokens_consumed: 100000,
      pokemon: { '393': { id: 393, xp: 0, level: 20, friendship: 0, ev: 0 } },
    });
    const config = makeConfig({ party: ['393'] });
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'hundred_k_tokens');
    assert.ok(ev);
    assert.equal(state.pokemon['403'].level, 20, 'should match party average level');
  });

  it('common reward pokemon default to level 1 when party is empty', () => {
    const state = makeState({ session_count: 1 });
    const config = makeConfig();
    checkAchievements(state, config);

    assert.equal(state.pokemon['393'].level, 1, 'empty party should default to level 1');
  });

  it('does not add duplicate to unlocked', () => {
    const state = makeState({
      session_count: 1,
      unlocked: ['393'],
      pokemon: { '393': { id: 393, xp: 100, level: 3, friendship: 0, ev: 0 } },
    });
    const config = makeConfig();
    checkAchievements(state, config);

    const count = state.unlocked.filter(u => u === '393').length;
    assert.equal(count, 1, 'should not duplicate in unlocked');
  });
});

describe('formatAchievementMessage', () => {
  it('formats reward pokemon message', () => {
    const msg = formatAchievementMessage({ id: 'test', name: '첫 만남', rewardPokemon: '393' });
    assert.ok(msg.includes('팽도리'), `expected '팽도리' in: ${msg}`);
    assert.ok(msg.includes('첫 만남'));
  });

  it('formats basic unlocked message', () => {
    const msg = formatAchievementMessage({ id: 'test', name: '단골 트레이너' });
    assert.ok(msg.includes('단골 트레이너'));
  });
});

describe('runMigrations — legendary reward level fix', () => {
  it('bumps legendary reward pokemon from level 1 to 50 with matching XP', () => {
    const state = makeState({
      achievements: { one_million_tokens: true },
      unlocked: ['483'],
      pokemon: { '483': { id: 483, xp: 0, level: 1, friendship: 0, ev: 0 } },
    });
    runMigrations(state);
    assert.equal(state.pokemon['483'].level, 50);
    assert.ok(state.pokemon['483'].xp >= levelToXp(50, 'slow'), 'XP should match level 50');
  });

  it('bumps mythical reward pokemon from level 1 to 50 with matching XP', () => {
    const state = makeState({
      achievements: { pokedex_100: true },
      unlocked: ['493'],
      pokemon: { '493': { id: 493, xp: 0, level: 1, friendship: 0, ev: 0 } },
    });
    runMigrations(state);
    assert.equal(state.pokemon['493'].level, 50);
    assert.ok(state.pokemon['493'].xp >= levelToXp(50, 'slow'), 'XP should match level 50');
  });

  it('does not downgrade legendary pokemon above 50', () => {
    const state = makeState({
      achievements: { one_million_tokens: true },
      unlocked: ['483'],
      pokemon: { '483': { id: 483, xp: 5000, level: 72, friendship: 50, ev: 10 } },
    });
    runMigrations(state);
    assert.equal(state.pokemon['483'].level, 72);
  });

  it('does not touch common pokemon', () => {
    const state = makeState({
      achievements: { first_session: true },
      unlocked: ['393'],
      pokemon: { '393': { id: 393, xp: 0, level: 5, friendship: 0, ev: 0 } },
    });
    runMigrations(state);
    assert.equal(state.pokemon['393'].level, 5);
  });

  it('skips if already migrated', () => {
    const state = makeState({
      migrated_version: '99.0.0',
      achievements: { one_million_tokens: true },
      unlocked: ['483'],
      pokemon: { '483': { id: 483, xp: 0, level: 1, friendship: 0, ev: 0 } },
    });
    runMigrations(state);
    assert.equal(state.pokemon['483'].level, 1, 'should not run migration if already at higher version');
  });
});
