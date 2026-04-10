import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initLocale } from '../src/i18n/index.js';
import { createStatStages } from '../src/core/stat-stages.js';
import type { BattlePokemon, BattleState } from '../src/core/types.js';
import {
  addVolatileStatus,
  applyLeechSeedEndOfTurn,
  checkConfusionSkip,
  checkFlinchSkip,
  hasVolatileStatus,
} from '../src/core/volatile-status.js';

initLocale('ko');

function makePokemon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    id: 1,
    name: '1',
    displayName: 'Test',
    types: ['normal'],
    level: 50,
    maxHp: 160,
    currentHp: 160,
    attack: 60,
    defense: 50,
    spAttack: 55,
    spDefense: 50,
    speed: 70,
    moves: [],
    fainted: false,
    statusCondition: null,
    toxicCounter: 0,
    sleepCounter: 0,
    volatileStatuses: [],
    statStages: createStatStages(),
    ...overrides,
  };
}

function makeState(
  player: BattlePokemon,
  opponent: BattlePokemon,
): Pick<BattleState, 'player' | 'opponent'> {
  return {
    player: { pokemon: [player], activeIndex: 0 },
    opponent: { pokemon: [opponent], activeIndex: 0 },
  };
}

describe('addVolatileStatus', () => {
  it('adds confusion with a randomized 2-5 turn duration', () => {
    const mon = makePokemon();
    const messages: string[] = [];
    const originalRandom = Math.random;

    try {
      Math.random = () => 0.6;
      assert.equal(addVolatileStatus(mon, { type: 'confusion' }, messages), true);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(mon.volatileStatuses.length, 1);
    assert.equal(mon.volatileStatuses[0].type, 'confusion');
    assert.equal(mon.volatileStatuses[0].turnsRemaining, 4);
    assert.equal(messages.length, 1);
  });

  it('rejects duplicate confusion', () => {
    const mon = makePokemon({
      volatileStatuses: [{ type: 'confusion', turnsRemaining: 3 }],
    });
    const messages: string[] = [];

    assert.equal(addVolatileStatus(mon, { type: 'confusion' }, messages), false);
    assert.equal(mon.volatileStatuses.length, 1);
    assert.equal(mon.volatileStatuses[0].turnsRemaining, 3);
    assert.equal(messages.length, 1);
  });

  it('rejects leech-seed on grass types', () => {
    const mon = makePokemon({ types: ['grass'] });
    const messages: string[] = [];

    assert.equal(
      addVolatileStatus(mon, { type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }, messages),
      false,
    );
    assert.equal(mon.volatileStatuses.length, 0);
    assert.equal(messages.length, 1);
  });
});

describe('checkConfusionSkip', () => {
  it('self-hits on a 33% roll and decrements turns', () => {
    const mon = makePokemon({
      currentHp: 100,
      volatileStatuses: [{ type: 'confusion', turnsRemaining: 3 }],
    });
    const messages: string[] = [];
    const originalRandom = Math.random;

    try {
      Math.random = () => 0;
      assert.equal(checkConfusionSkip(mon, messages), true);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(mon.volatileStatuses.length, 1);
    assert.equal(mon.volatileStatuses[0].turnsRemaining, 2);
    assert.ok(mon.currentHp < 100);
    assert.equal(mon.fainted, false);
    assert.equal(messages.length, 1);
  });

  it('snaps out when turns reach zero', () => {
    const mon = makePokemon({
      volatileStatuses: [{ type: 'confusion', turnsRemaining: 1 }],
    });
    const messages: string[] = [];
    const originalRandom = Math.random;

    try {
      Math.random = () => 0.9;
      assert.equal(checkConfusionSkip(mon, messages), false);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(hasVolatileStatus(mon, 'confusion'), false);
    assert.equal(messages.length, 1);
  });
});

describe('checkFlinchSkip', () => {
  it('consumes flinch and skips the move', () => {
    const mon = makePokemon({
      volatileStatuses: [{ type: 'flinch' }, { type: 'confusion', turnsRemaining: 2 }],
    });
    const messages: string[] = [];

    assert.equal(checkFlinchSkip(mon, messages), true);
    assert.equal(hasVolatileStatus(mon, 'flinch'), false);
    assert.equal(hasVolatileStatus(mon, 'confusion'), true);
    assert.equal(messages.length, 1);
  });
});

describe('applyLeechSeedEndOfTurn', () => {
  it('drains 1/8 max HP and heals the source side', () => {
    const seeded = makePokemon({
      displayName: 'Seeded',
      volatileStatuses: [{ type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }],
    });
    const healer = makePokemon({ displayName: 'Healer', currentHp: 80 });
    const otherSide = makePokemon({ displayName: 'Opponent' });
    const messages: string[] = [];

    assert.equal(applyLeechSeedEndOfTurn(seeded, makeState(healer, otherSide), messages), false);
    assert.equal(seeded.currentHp, 140);
    assert.equal(healer.currentHp, 100);
    assert.equal(messages.length, 1);
  });

  it('caps healing at maxHp', () => {
    const seeded = makePokemon({
      currentHp: 20,
      volatileStatuses: [{ type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }],
    });
    const healer = makePokemon({ currentHp: 159 });
    const otherSide = makePokemon({ displayName: 'Opponent' });

    assert.equal(applyLeechSeedEndOfTurn(seeded, makeState(healer, otherSide), []), true);
    assert.equal(seeded.currentHp, 0);
    assert.equal(seeded.fainted, true);
    assert.equal(healer.currentHp, 160);
  });
});

describe('leech-seed data pipeline integration', () => {
  // Regression for v3c R2 HIGH: leech-seed was added as move id 920 but no
  // species movepool referenced it, so the move would never actually appear
  // in real battle setup. This test asserts the move is reachable through
  // the authoritative getMoveData/getPokemonMovePool chain.
  it('leech-seed moveId 920 resolves via getMoveData', async () => {
    const { getMoveData } = await import('../src/core/moves.js');
    const move = getMoveData(920);
    assert.ok(move, 'getMoveData(920) should return the leech-seed move');
    assert.equal(move?.name, 'leech-seed');
    assert.equal(move?.type, 'grass');
    assert.equal((move as any)?.volatileEffect?.type, 'leech_seed');
  });

  it('Bulbasaur (species 1) movepool contains leech-seed', async () => {
    const { getPokemonMovePool } = await import('../src/core/moves.js');
    const pool = getPokemonMovePool(1);
    assert.ok(
      pool.some((m) => m.moveId === 920),
      `Bulbasaur pool should contain leech-seed (920). Got: ${JSON.stringify(pool)}`,
    );
  });
});
