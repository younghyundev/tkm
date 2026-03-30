import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkEvolution, applyEvolution } from '../src/core/evolution.js';
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

describe('checkEvolution', () => {
  it('모부기 evolves at Lv.18', () => {
    const result = checkEvolution('모부기', 17, 18);
    assert.notEqual(result, null);
    assert.equal(result!.oldPokemon, '모부기');
    assert.equal(result!.newPokemon, '수풀부기');
    assert.equal(result!.newId, 388);
  });

  it('does not evolve below threshold', () => {
    assert.equal(checkEvolution('모부기', 15, 17), null);
  });

  it('does not evolve if already past threshold', () => {
    assert.equal(checkEvolution('모부기', 18, 20), null);
  });

  it('불꽃숭이 evolves at Lv.14', () => {
    const result = checkEvolution('불꽃숭이', 13, 14);
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '파이숭이');
    assert.equal(result!.newId, 391);
  });

  it('팽도리 evolves at Lv.16', () => {
    const result = checkEvolution('팽도리', 15, 16);
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '팽태자');
  });

  it('수풀부기 (stage 1) evolves at Lv.32', () => {
    const result = checkEvolution('수풀부기', 31, 32);
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '토대부기');
    assert.equal(result!.newId, 389);
  });

  it('토대부기 (final stage) does not evolve', () => {
    assert.equal(checkEvolution('토대부기', 50, 51), null);
  });

  it('리오르 has no level-based evolution', () => {
    assert.equal(checkEvolution('리오르', 30, 31), null);
  });

  it('unknown pokemon returns null', () => {
    assert.equal(checkEvolution('없는포켓몬', 10, 11), null);
  });
});

describe('applyEvolution', () => {
  it('updates state and config correctly', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 5000, level: 18 } },
      unlocked: ['모부기'],
    });
    const config = makeConfig({ party: ['모부기'] });

    const evolution = checkEvolution('모부기', 17, 18)!;
    applyEvolution(state, config, evolution, 5000);

    // New pokemon added to state
    assert.equal(state.pokemon['수풀부기'].id, 388);
    assert.equal(state.pokemon['수풀부기'].xp, 5000);
    assert.equal(state.pokemon['수풀부기'].level, 18);

    // Added to unlocked
    assert.ok(state.unlocked.includes('수풀부기'));

    // Evolution count incremented
    assert.equal(state.evolution_count, 1);

    // Party updated in config
    assert.deepEqual(config.party, ['수풀부기']);
  });

  it('does not duplicate in unlocked', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 5000, level: 18 } },
      unlocked: ['모부기', '수풀부기'],
    });
    const config = makeConfig({ party: ['모부기'] });

    const evolution = checkEvolution('모부기', 17, 18)!;
    applyEvolution(state, config, evolution, 5000);

    const count = state.unlocked.filter(u => u === '수풀부기').length;
    assert.equal(count, 1);
  });

  it('old pokemon remains in state.pokemon (matches M0)', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 5000, level: 18 } },
      unlocked: ['모부기'],
    });
    const config = makeConfig({ party: ['모부기'] });

    const evolution = checkEvolution('모부기', 17, 18)!;
    applyEvolution(state, config, evolution, 5000);

    assert.ok('모부기' in state.pokemon, 'old pokemon should remain in state');
  });
});
