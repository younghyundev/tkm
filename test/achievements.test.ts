import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAchievements, formatAchievementMessage } from '../src/core/achievements.js';
import { makeState, makeConfig } from './helpers.js';
import { initLocale } from '../src/i18n/index.js';

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

  it('ten_sessions gives +20% XP bonus', () => {
    const state = makeState({ session_count: 10 });
    const config = makeConfig();
    checkAchievements(state, config);

    assert.ok(state.achievements['ten_sessions']);
    assert.equal(state.xp_bonus_multiplier, 1.2);
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

  it('permission_master increases max_party_size', () => {
    const state = makeState({ permission_count: 50 });
    const config = makeConfig({ max_party_size: 6 });
    checkAchievements(state, config);

    assert.ok(state.achievements['permission_master']);
    assert.equal(config.max_party_size, 7);
  });

  it('permission_master caps at 8', () => {
    const state = makeState({ permission_count: 50 });
    const config = makeConfig({ max_party_size: 7 });
    // Force achievement not yet triggered
    checkAchievements(state, config);

    assert.equal(config.max_party_size, 8);
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
