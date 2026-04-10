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

  it('normalizeBattlePokemon backfills missing sleepCounter to 0 (v3a)', () => {
    const mon = makeLegacyPokemon();
    assert.equal((mon as any).sleepCounter, undefined);
    normalizeBattlePokemon(mon);
    assert.equal(mon.sleepCounter, 0);
  });

  it('normalizeBattlePokemon coerces NaN/infinite sleepCounter to 0', () => {
    const mon = makeLegacyPokemon();
    mon.sleepCounter = NaN as unknown as number;
    normalizeBattlePokemon(mon);
    assert.equal(mon.sleepCounter, 0);

    mon.sleepCounter = Infinity;
    normalizeBattlePokemon(mon);
    assert.equal(mon.sleepCounter, 0);
  });

  it('normalizeBattlePokemon preserves existing sleepCounter', () => {
    const mon = makeLegacyPokemon();
    mon.sleepCounter = 2;
    normalizeBattlePokemon(mon);
    assert.equal(mon.sleepCounter, 2);
  });

  it('normalizeBattlePokemon backfills missing volatileStatuses to [] (v3c)', () => {
    const mon = makeLegacyPokemon();
    assert.equal((mon as any).volatileStatuses, undefined);
    normalizeBattlePokemon(mon);
    assert.deepEqual((mon as any).volatileStatuses, []);
  });

  it('normalizeBattlePokemon preserves existing volatileStatuses', () => {
    const mon = makeLegacyPokemon({
      volatileStatuses: [{ type: 'confusion', turnsRemaining: 3 }],
    } as Partial<BattlePokemon>);
    normalizeBattlePokemon(mon);
    assert.equal((mon as any).volatileStatuses.length, 1);
    assert.equal((mon as any).volatileStatuses[0].type, 'confusion');
  });

  it('normalizeBattlePokemon backfills missing statStages to zeroes (v3b)', () => {
    const mon = makeLegacyPokemon();
    assert.equal((mon as any).statStages, undefined);
    normalizeBattlePokemon(mon);
    assert.deepEqual(mon.statStages, {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    });
  });

  it('resumed legacy sleeping mon can wake up without NaN soft-lock', async () => {
    // Regression for v3a R2 finding: a legacy save with statusCondition='sleep'
    // but sleepCounter=undefined would otherwise decrement to NaN and trap the
    // mon in permanent sleep. After migration, the mon should wake up on the
    // first checkSleepSkip call (counter 0 → wake).
    const { checkSleepSkip } = await import('../src/core/status-effects.js');
    const mon = makeLegacyPokemon();
    mon.statusCondition = 'sleep';
    normalizeBattlePokemon(mon);
    const msgs: string[] = [];
    const skipped = checkSleepSkip(mon, msgs);
    assert.equal(skipped, true, 'Should skip this turn');
    assert.equal(mon.statusCondition, null, 'Should wake up (not stuck in permanent sleep)');
  });

  it('normalizeBattlePokemon drops volatile-status entries with unknown type', () => {
    // Regression for v3c R1 MEDIUM: corrupted saves with unknown volatile
    // status types should be dropped, not passed through to the battle loop.
    const mon = makeLegacyPokemon({
      volatileStatuses: [
        { type: 'confusion', turnsRemaining: 3 },
        { type: 'not_a_real_status' as any },
        { type: 'bound' as any, turnsRemaining: 2 },
      ],
    } as Partial<BattlePokemon>);
    normalizeBattlePokemon(mon);
    assert.equal(mon.volatileStatuses.length, 1);
    assert.equal(mon.volatileStatuses[0].type, 'confusion');
  });

  it('normalizeBattlePokemon drops leech_seed entries with invalid sourceSide', () => {
    // Regression for v3c R1 MEDIUM: leech_seed with a bogus sourceSide
    // ('foo') would crash applyLeechSeedEndOfTurn at allPokemon['foo'].
    const mon = makeLegacyPokemon({
      volatileStatuses: [
        { type: 'leech_seed', sourceSide: 'foo' as any },
        { type: 'leech_seed', sourceSide: 'player' },
        { type: 'leech_seed' }, // no sourceSide
      ],
    } as Partial<BattlePokemon>);
    normalizeBattlePokemon(mon);
    assert.equal(mon.volatileStatuses.length, 1);
    assert.equal(mon.volatileStatuses[0].type, 'leech_seed');
    assert.equal((mon.volatileStatuses[0] as any).sourceSide, 'player');
  });

  it('normalizeBattlePokemon coerces confusion with non-finite turnsRemaining to 0', () => {
    const mon = makeLegacyPokemon({
      volatileStatuses: [
        { type: 'confusion', turnsRemaining: NaN as any },
      ],
    } as Partial<BattlePokemon>);
    normalizeBattlePokemon(mon);
    assert.equal(mon.volatileStatuses.length, 1);
    assert.equal((mon.volatileStatuses[0] as any).turnsRemaining, 0);
  });
});
