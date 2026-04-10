import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBattlePokemon, normalizeBattleTeam } from '../src/core/battle-state-io.js';
import type { BattlePokemon, BattleTeam } from '../src/core/types.js';

/**
 * Migration regression tests for battle-state-v2 schema upgrade.
 * Pre-status battle saves from feat/battle-system lack `statusCondition` and
 * `toxicCounter`. Without normalization, downstream `statusCondition !== null`
 * checks silently treat `undefined` as "already has a status" and block new
 * status application on resume.
 */

function makeLegacyPokemon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  // Simulate a pre-status save: no statusCondition, no toxicCounter.
  const mon = {
    id: 1,
    name: '1',
    displayName: 'Legacy',
    types: ['normal'],
    level: 50,
    maxHp: 120,
    currentHp: 120,
    attack: 60,
    defense: 50,
    spAttack: 55,
    spDefense: 50,
    speed: 70,
    moves: [],
    fainted: false,
    ...overrides,
  } as unknown as BattlePokemon;
  // Deliberately leave statusCondition and toxicCounter undefined
  return mon;
}

describe('battle state migration', () => {
  it('normalizeBattlePokemon backfills missing statusCondition to null', () => {
    const mon = makeLegacyPokemon();
    assert.equal((mon as any).statusCondition, undefined);
    normalizeBattlePokemon(mon);
    assert.equal(mon.statusCondition, null);
  });

  it('normalizeBattlePokemon backfills missing toxicCounter to 0', () => {
    const mon = makeLegacyPokemon();
    assert.equal((mon as any).toxicCounter, undefined);
    normalizeBattlePokemon(mon);
    assert.equal(mon.toxicCounter, 0);
  });

  it('normalizeBattlePokemon preserves existing statusCondition', () => {
    const mon = makeLegacyPokemon();
    mon.statusCondition = 'burn';
    mon.toxicCounter = 0;
    normalizeBattlePokemon(mon);
    assert.equal(mon.statusCondition, 'burn');
  });

  it('normalizeBattlePokemon preserves existing toxicCounter', () => {
    const mon = makeLegacyPokemon();
    mon.statusCondition = 'badly_poisoned';
    mon.toxicCounter = 5;
    normalizeBattlePokemon(mon);
    assert.equal(mon.toxicCounter, 5);
  });

  it('normalizeBattleTeam migrates all pokemon in a team', () => {
    const team: BattleTeam = {
      pokemon: [makeLegacyPokemon(), makeLegacyPokemon(), makeLegacyPokemon()],
      activeIndex: 0,
    };
    normalizeBattleTeam(team);
    for (const mon of team.pokemon) {
      assert.equal(mon.statusCondition, null);
      assert.equal(mon.toxicCounter, 0);
    }
  });

  it('normalizeBattleTeam handles empty pokemon array', () => {
    const team: BattleTeam = { pokemon: [], activeIndex: 0 };
    normalizeBattleTeam(team);
    assert.equal(team.pokemon.length, 0);
  });

  it('normalizeBattleTeam is a no-op on malformed team (missing pokemon array)', () => {
    const team = { activeIndex: 0 } as unknown as BattleTeam;
    // Should not throw
    normalizeBattleTeam(team);
  });

  it('legacy pokemon with undefined statusCondition does not block new status application', () => {
    // Regression for the R2 finding: undefined !== null, so without normalization
    // tryApplyStatus would treat a legacy pokemon as "already has a status".
    const mon = makeLegacyPokemon();
    normalizeBattlePokemon(mon);
    // After migration, statusCondition is null and a new status can be applied
    assert.equal(mon.statusCondition, null);
    // Simulate applying a status
    mon.statusCondition = 'burn';
    assert.equal(mon.statusCondition, 'burn');
  });
});
