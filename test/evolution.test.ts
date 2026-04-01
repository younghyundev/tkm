import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkEvolution, applyEvolution, addFriendship } from '../src/core/evolution.js';
import type { State, Config, EvolutionContext } from '../src/core/types.js';

function makeCtx(overrides: Partial<EvolutionContext> = {}): EvolutionContext {
  return {
    oldLevel: 10, newLevel: 11, friendship: 0,
    currentRegion: '쌍둥이잎 마을',
    unlockedAchievements: [], items: {},
    ...overrides,
  };
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    pokemon: {}, unlocked: [], achievements: {},
    total_tokens_consumed: 0, session_count: 0, error_count: 0,
    permission_count: 0, evolution_count: 0, last_session_id: null,
    xp_bonus_multiplier: 1.0, last_session_tokens: {}, pokedex: {},
    encounter_count: 0, catch_count: 0, battle_count: 0,
    battle_wins: 0, battle_losses: 0, items: {},
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    tokens_per_xp: 10000, party: [], starter_chosen: true,
    volume: 0.5, sprite_enabled: true, cry_enabled: true,
    xp_formula: 'medium_fast', xp_bonus_multiplier: 1.0,
    max_party_size: 6, peon_ping_integration: false,
    peon_ping_port: 19998, current_region: '쌍둥이잎 마을',
    auto_retry_enabled: true, auto_retry_threshold: 0.6,
    ...overrides,
  };
}

describe('checkEvolution', () => {
  it('모부기 evolves at Lv.18', () => {
    const result = checkEvolution('모부기', makeCtx({ oldLevel: 17, newLevel: 18 }));
    assert.notEqual(result, null);
    assert.equal(result!.oldPokemon, '모부기');
    assert.equal(result!.newPokemon, '수풀부기');
    assert.equal(result!.newId, 388);
  });

  it('does not evolve below threshold', () => {
    assert.equal(checkEvolution('모부기', makeCtx({ oldLevel: 15, newLevel: 17 })), null);
  });

  it('does not evolve if already past threshold', () => {
    assert.equal(checkEvolution('모부기', makeCtx({ oldLevel: 18, newLevel: 20 })), null);
  });

  it('불꽃숭이 evolves at Lv.14', () => {
    const result = checkEvolution('불꽃숭이', makeCtx({ oldLevel: 13, newLevel: 14 }));
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '파이숭이');
  });

  it('토대부기 (final stage) does not evolve', () => {
    assert.equal(checkEvolution('토대부기', makeCtx({ oldLevel: 50, newLevel: 51 })), null);
  });

  it('리오르 evolves via friendship at threshold 220', () => {
    // Below threshold
    assert.equal(checkEvolution('리오르', makeCtx({ friendship: 219 })), null);
    // At threshold
    const result = checkEvolution('리오르', makeCtx({ friendship: 220 }));
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '루카리오');
  });

  it('unknown pokemon returns null', () => {
    assert.equal(checkEvolution('없는포켓몬', makeCtx()), null);
  });
});

describe('addFriendship', () => {
  it('increments friendship', () => {
    const state = makeState({
      pokemon: { '리오르': { id: 447, xp: 0, level: 1, friendship: 100, ev: 0 } },
    });
    addFriendship(state, '리오르', 5);
    assert.equal(state.pokemon['리오르'].friendship, 105);
  });

  it('handles missing friendship field (migration)', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 0, level: 1, friendship: 0, ev: 0 } },
    });
    addFriendship(state, '모부기', 2);
    assert.equal(state.pokemon['모부기'].friendship, 2);
  });
});

describe('applyEvolution', () => {
  it('updates state and config correctly', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 5000, level: 18, friendship: 50, ev: 0 } },
      unlocked: ['모부기'],
    });
    const config = makeConfig({ party: ['모부기'] });

    const evolution = checkEvolution('모부기', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.equal(state.pokemon['수풀부기'].id, 388);
    assert.equal(state.pokemon['수풀부기'].xp, 5000);
    assert.equal(state.pokemon['수풀부기'].level, 18);
    assert.equal(state.pokemon['수풀부기'].friendship, 50); // friendship carried over
    assert.ok(state.unlocked.includes('수풀부기'));
    assert.equal(state.evolution_count, 1);
    assert.deepEqual(config.party, ['수풀부기']);
  });

  it('evolution preserves EV', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 5000, level: 18, friendship: 50, ev: 100 } },
      unlocked: ['모부기'],
    });
    const config = makeConfig({ party: ['모부기'] });

    const evolution = checkEvolution('모부기', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.equal(state.pokemon['수풀부기'].ev, 100, 'EV should carry over on evolution');
  });

  it('old pokemon remains in state.pokemon', () => {
    const state = makeState({
      pokemon: { '모부기': { id: 387, xp: 5000, level: 18, friendship: 0, ev: 0 } },
      unlocked: ['모부기'],
    });
    const config = makeConfig({ party: ['모부기'] });

    const evolution = checkEvolution('모부기', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.ok('모부기' in state.pokemon);
  });
});
