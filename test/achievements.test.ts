import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAchievements, formatAchievementMessage } from '../src/core/achievements.js';
import type { State, Config } from '../src/core/types.js';

function makeState(overrides: Partial<State> = {}): State {
  return {
    pokemon: {},
    unlocked: [],
    achievements: {},
    total_tokens_consumed: 0,
    session_count: 0,
    error_count: 0,
    permission_count: 0,
    evolution_count: 0,
    last_session_id: null,
    xp_bonus_multiplier: 1.0,
    last_session_tokens: {},
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    tokens_per_xp: 100,
    party: [],
    starter_chosen: true,
    volume: 0.5,
    sprite_enabled: true,
    cry_enabled: true,
    xp_formula: 'medium_fast',
    xp_bonus_multiplier: 1.0,
    max_party_size: 6,
    peon_ping_integration: false,
    peon_ping_port: 19998,
    ...overrides,
  };
}

describe('checkAchievements', () => {
  it('first_session triggers at session_count >= 1', () => {
    const state = makeState({ session_count: 1 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_session');
    assert.ok(ev, 'first_session should trigger');
    assert.equal(ev!.rewardPokemon, '팽도리');
    assert.ok(state.achievements['first_session']);
    assert.ok(state.unlocked.includes('팽도리'));
    assert.ok(state.pokemon['팽도리']);
    assert.equal(state.pokemon['팽도리'].id, 393);
  });

  it('first_error triggers at error_count >= 1', () => {
    const state = makeState({ error_count: 1 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_error');
    assert.ok(ev, 'first_error should trigger');
    assert.equal(ev!.rewardPokemon, '찌르꼬');
    assert.ok(state.pokemon['찌르꼬']);
    assert.equal(state.pokemon['찌르꼬'].id, 396);
  });

  it('first_evolution triggers at evolution_count >= 1', () => {
    const state = makeState({ evolution_count: 1 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_evolution');
    assert.ok(ev, 'first_evolution should trigger');
    assert.equal(ev!.rewardPokemon, '불꽃숭이');
  });

  it('ten_sessions gives +20% XP bonus', () => {
    const state = makeState({ session_count: 10 });
    const config = makeConfig();
    checkAchievements(state, config);

    assert.ok(state.achievements['ten_sessions']);
    assert.equal(state.xp_bonus_multiplier, 1.2);
  });

  it('hundred_k_tokens rewards 꼬링크', () => {
    const state = makeState({ total_tokens_consumed: 100000 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'hundred_k_tokens');
    assert.ok(ev);
    assert.equal(ev!.rewardPokemon, '꼬링크');
    assert.equal(state.pokemon['꼬링크'].id, 403);
  });

  it('five_hundred_k_tokens rewards 리오르', () => {
    const state = makeState({ total_tokens_consumed: 500000 });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'five_hundred_k_tokens');
    assert.ok(ev);
    assert.equal(ev!.rewardPokemon, '리오르');
    assert.equal(state.pokemon['리오르'].id, 447);
  });

  it('permission_master increases max_party_size', () => {
    const state = makeState({ permission_count: 50 });
    const config = makeConfig({ max_party_size: 6 });
    checkAchievements(state, config);

    assert.ok(state.achievements['permission_master']);
    assert.equal(config.max_party_size, 7);
  });

  it('permission_master caps at 7', () => {
    const state = makeState({ permission_count: 50 });
    const config = makeConfig({ max_party_size: 7 });
    // Force achievement not yet triggered
    checkAchievements(state, config);

    assert.equal(config.max_party_size, 7);
  });

  it('does not re-trigger already achieved', () => {
    const state = makeState({
      session_count: 10,
      achievements: { first_session: true, ten_sessions: true },
    });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    assert.ok(!events.find(e => e.id === 'first_session'), 'should not re-trigger');
    assert.ok(!events.find(e => e.id === 'ten_sessions'), 'should not re-trigger');
    // XP bonus should not be applied again
    assert.equal(state.xp_bonus_multiplier, 1.0);
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

  it('does not add duplicate to unlocked', () => {
    const state = makeState({
      session_count: 1,
      unlocked: ['팽도리'],
      pokemon: { '팽도리': { id: 393, xp: 100, level: 3 } },
    });
    const config = makeConfig();
    checkAchievements(state, config);

    const count = state.unlocked.filter(u => u === '팽도리').length;
    assert.equal(count, 1, 'should not duplicate in unlocked');
  });
});

describe('formatAchievementMessage', () => {
  it('formats reward pokemon message', () => {
    const msg = formatAchievementMessage({ id: 'test', name: '첫 만남', rewardPokemon: '팽도리' });
    assert.ok(msg.includes('팽도리'));
    assert.ok(msg.includes('첫 만남'));
  });

  it('formats reward message', () => {
    const msg = formatAchievementMessage({ id: 'test', name: '단골 트레이너', rewardMessage: 'XP 보너스 +20%' });
    assert.ok(msg.includes('XP 보너스'));
  });
});
