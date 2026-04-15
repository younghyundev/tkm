import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkEvolution, applyEvolution, addFriendship } from '../src/core/evolution.js';
import { getPokemonDB, getPokemonName, _resetForTesting as resetPokemonData } from '../src/core/pokemon-data.js';
import { setActiveGenerationCache } from '../src/core/paths.js';
import { _resetForTesting as resetI18n, initLocale } from '../src/i18n/index.js';
import { makeState, makeConfig } from './helpers.js';
import type { EvolutionContext } from '../src/core/types.js';

function makeCtx(overrides: Partial<EvolutionContext> = {}): EvolutionContext {
  return {
    oldLevel: 10, newLevel: 11, friendship: 0,
    currentRegion: '1',
    unlockedAchievements: [], items: {},
    ...overrides,
  };
}

function withGen<T>(gen: string, run: () => T): T {
  resetPokemonData();
  resetI18n();
  initLocale('en');
  setActiveGenerationCache(gen);
  try {
    return run();
  } finally {
    resetPokemonData();
    resetI18n();
    initLocale('en');
    setActiveGenerationCache('gen4');
  }
}

describe('checkEvolution', () => {
  it('387 evolves at Lv.18', () => {
    const result = checkEvolution('387', makeCtx({ oldLevel: 17, newLevel: 18 }));
    assert.notEqual(result, null);
    assert.equal(result!.oldPokemon, '387');
    assert.equal(result!.newPokemon, '388');
    assert.equal(result!.newId, 388);
  });

  it('does not evolve below threshold', () => {
    assert.equal(checkEvolution('387', makeCtx({ oldLevel: 15, newLevel: 17 })), null);
  });

  it('does not evolve if already past threshold', () => {
    assert.equal(checkEvolution('387', makeCtx({ oldLevel: 18, newLevel: 20 })), null);
  });

  it('390 evolves at Lv.14', () => {
    const result = checkEvolution('390', makeCtx({ oldLevel: 13, newLevel: 14 }));
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '391');
  });

  it('389 (final stage) does not evolve', () => {
    assert.equal(checkEvolution('389', makeCtx({ oldLevel: 50, newLevel: 51 })), null);
  });

  it('447 evolves via friendship at threshold 220', () => {
    // Below threshold
    assert.equal(checkEvolution('447', makeCtx({ friendship: 219 })), null);
    // At threshold
    const result = checkEvolution('447', makeCtx({ friendship: 220 }));
    assert.notEqual(result, null);
    assert.equal(result!.newPokemon, '448');
  });

  it('unknown pokemon returns null', () => {
    assert.equal(checkEvolution('없는포켓몬', makeCtx()), null);
  });

  it('406 꼬몽울 evolves to 407 로즈레이드 via friendship (not skipping)', () => {
    // Bug regression: stage 2 data caused 꼬몽울 to skip directly to 로즈레이드.
    // After fix, 407 is stage 1 so the legacy line[stage+1] path resolves correctly.
    const below = checkEvolution('406', makeCtx({ friendship: 219 }));
    assert.equal(below, null);
    const result = checkEvolution('406', makeCtx({ friendship: 220 }));
    assert.notEqual(result, null);
    assert.equal(result!.oldPokemon, '406');
    assert.equal(result!.newPokemon, '407');
    assert.equal(result!.newId, 407);
  });

  it('loads cross-gen chains into the active generation cache deterministically', () => {
    withGen('gen2', () => {
      const db = getPokemonDB();

      assert.ok(db.pokemon['25'], 'Pikachu should be injected into gen2');
      assert.ok(db.pokemon['26'], 'Raichu should be injected into gen2');
      assert.deepEqual(db.pokemon['25'].line, ['172', '25', '26']);
      assert.equal(db.pokemon['25'].stage, 1);
      assert.deepEqual(db.pokemon['26'].line, ['172', '25', '26']);
      assert.equal(db.pokemon['26'].stage, 2);
    });
  });

  it('supports chained evolution after a cross-gen target is loaded', () => {
    withGen('gen2', () => {
      const first = checkEvolution('172', makeCtx({ friendship: 220 }));
      assert.notEqual(first, null);
      assert.equal(first!.newPokemon, '25');

      const second = checkEvolution('25', makeCtx({ items: { 'thunder-stone': 1 } }));
      assert.notEqual(second, null);
      assert.equal(second!.newPokemon, '26');
    });
  });

  it('resolves imported cross-gen names in a fresh process', () => {
    withGen('gen2', () => {
      assert.equal(getPokemonName('25'), 'Pikachu');
    });
  });
});

describe('addFriendship', () => {
  it('increments friendship', () => {
    const state = makeState({
      pokemon: { '447': { id: 447, xp: 0, level: 1, friendship: 100, ev: 0 } },
    });
    addFriendship(state, '447', 5);
    assert.equal(state.pokemon['447'].friendship, 105);
  });

  it('handles missing friendship field (migration)', () => {
    const state = makeState({
      pokemon: { '387': { id: 387, xp: 0, level: 1, friendship: 0, ev: 0 } },
    });
    addFriendship(state, '387', 2);
    assert.equal(state.pokemon['387'].friendship, 2);
  });
});

describe('applyEvolution', () => {
  it('updates state and config correctly', () => {
    const state = makeState({
      pokemon: { '387': { id: 387, xp: 5000, level: 18, friendship: 50, ev: 0 } },
      unlocked: ['387'],
    });
    const config = makeConfig({ party: ['387'] });

    const evolution = checkEvolution('387', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.equal(state.pokemon['388'].id, 388);
    assert.equal(state.pokemon['388'].xp, 5000);
    assert.equal(state.pokemon['388'].level, 18);
    assert.equal(state.pokemon['388'].friendship, 50); // friendship carried over
    assert.ok(state.unlocked.includes('388'));
    assert.equal(state.evolution_count, 1);
    assert.deepEqual(config.party, ['388']);
  });

  it('evolution preserves EV', () => {
    const state = makeState({
      pokemon: { '387': { id: 387, xp: 5000, level: 18, friendship: 50, ev: 100 } },
      unlocked: ['387'],
    });
    const config = makeConfig({ party: ['387'] });

    const evolution = checkEvolution('387', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.equal(state.pokemon['388'].ev, 100, 'EV should carry over on evolution');
  });

  it('evolution carries over all extra state fields (nickname, call_count, ev)', () => {
    const state = makeState({
      pokemon: { '387': { id: 387, xp: 5000, level: 17, friendship: 50, ev: 80, nickname: '테스트이름', call_count: 12 } },
      unlocked: ['387'],
    });
    const config = makeConfig({ party: ['387'] });

    const evolution = checkEvolution('387', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.equal(state.pokemon['388'].nickname, '테스트이름', 'nickname should carry over');
    assert.equal(state.pokemon['388'].call_count, 12, 'call_count should carry over');
    assert.equal(state.pokemon['388'].ev, 80, 'ev should carry over');
    assert.equal(state.pokemon['388'].friendship, 50, 'friendship should carry over');
  });

  it('old pokemon remains in state.pokemon', () => {
    const state = makeState({
      pokemon: { '387': { id: 387, xp: 5000, level: 18, friendship: 0, ev: 0 } },
      unlocked: ['387'],
    });
    const config = makeConfig({ party: ['387'] });

    const evolution = checkEvolution('387', makeCtx({ oldLevel: 17, newLevel: 18 }))!;
    applyEvolution(state, config, evolution, 5000);

    assert.ok('387' in state.pokemon);
  });
});
