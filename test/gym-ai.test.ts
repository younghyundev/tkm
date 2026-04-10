import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initLocale } from '../src/i18n/index.js';
import { selectAiMove, selectAiAction } from '../src/core/gym-ai.js';
import { createBattlePokemon } from '../src/core/turn-battle.js';
import type { MoveData } from '../src/core/types.js';

initLocale('ko');

// ── Test move data ──

const thunderbolt: MoveData = {
  id: 85,
  name: 'thunderbolt',
  nameKo: '10만볼트',
  nameEn: 'Thunderbolt',
  type: 'electric',
  category: 'special',
  power: 90,
  accuracy: 100,
  pp: 15,
};

const tackle: MoveData = {
  id: 33,
  name: 'tackle',
  nameKo: '몸통박치기',
  nameEn: 'Tackle',
  type: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  pp: 35,
};

// ── Helpers ──

function makeAttacker() {
  return createBattlePokemon(
    { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
    [thunderbolt, tackle],
  );
}

function makeWaterDefender() {
  return createBattlePokemon(
    { id: 120, types: ['water'], level: 30, baseStats: { hp: 30, attack: 45, defense: 55, speed: 85, sp_attack: 70, sp_defense: 25 } },
    [tackle],
  );
}

// ── Tests ──

describe('selectAiMove', () => {
  it('prefers super-effective STAB move against water defender', () => {
    const runs = 100;
    let thunderboltCount = 0;
    for (let i = 0; i < runs; i++) {
      const attacker = makeAttacker();
      const defender = makeWaterDefender();
      const idx = selectAiMove(attacker, defender);
      if (idx === 0) thunderboltCount++;
    }
    // Thunderbolt (index 0) is electric vs water = 2x, + STAB 1.5 → score = 90*1.5*2 = 270
    // Tackle (index 1) is normal vs water = 1x, no STAB → score = 40*1*1 = 40
    // 80% best + 20% random (50% chance of idx 0) → expected ~90%
    assert.ok(
      thunderboltCount > 60,
      `Expected thunderbolt picked >60 times, got ${thunderboltCount}`,
    );
  });

  it('skips moves with 0 PP', () => {
    const attacker = makeAttacker();
    const defender = makeWaterDefender();
    // Drain all PP from thunderbolt (index 0)
    attacker.moves[0].currentPp = 0;
    const idx = selectAiMove(attacker, defender);
    assert.equal(idx, 1, 'Should pick tackle (index 1) when thunderbolt has 0 PP');
  });

  it('returns 0 when all moves have 0 PP', () => {
    const attacker = makeAttacker();
    const defender = makeWaterDefender();
    attacker.moves[0].currentPp = 0;
    attacker.moves[1].currentPp = 0;
    const idx = selectAiMove(attacker, defender);
    assert.equal(idx, 0, 'Should return 0 (struggle) when no moves usable');
  });
});

describe('selectAiAction', () => {
  it('returns TurnAction with type move', () => {
    const attacker = makeAttacker();
    const defender = makeWaterDefender();
    const action = selectAiAction(attacker, defender);
    assert.equal(action.type, 'move');
    assert.ok('moveIndex' in action, 'Action should have moveIndex');
    assert.equal(typeof action.moveIndex, 'number');
  });
});
