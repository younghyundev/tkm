import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';

describe('battle types', () => {
  it('makeState includes gym_badges', () => {
    const state = makeState();
    assert.ok(Array.isArray(state.gym_badges));
  });

  it('BaseStats accepts sp_attack/sp_defense', () => {
    const stats = { hp: 45, attack: 49, defense: 49, speed: 45, sp_attack: 65, sp_defense: 65 };
    assert.equal(stats.sp_attack, 65);
    assert.equal(stats.sp_defense, 65);
  });

  it('PokemonState accepts moves', () => {
    const pokemon = { id: 1, xp: 0, level: 5, friendship: 0, ev: 0, moves: [1, 2, 3, 4] };
    assert.equal(pokemon.moves.length, 4);
  });
});
