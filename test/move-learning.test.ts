import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkMoveLearn, initializeMoves } from '../src/core/move-learning.js';
import { _injectMovesData, _resetMovesCache } from '../src/core/moves.js';
import type { MoveData, PokemonMovePool } from '../src/core/types.js';

// ── Test fixtures ──

const testMoves: Record<string, MoveData> = {
  '33': {
    id: 33, name: 'tackle', nameKo: '몸통박치기', nameEn: 'Tackle',
    type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35,
  },
  '84': {
    id: 84, name: 'thunder-shock', nameKo: '전기충격', nameEn: 'Thunder Shock',
    type: 'electric', category: 'special', power: 40, accuracy: 100, pp: 30,
  },
  '98': {
    id: 98, name: 'quick-attack', nameKo: '전광석화', nameEn: 'Quick Attack',
    type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 30,
  },
  '9': {
    id: 9, name: 'thunder-punch', nameKo: '번개펀치', nameEn: 'Thunder Punch',
    type: 'electric', category: 'physical', power: 75, accuracy: 100, pp: 15,
  },
  '85': {
    id: 85, name: 'thunderbolt', nameKo: '10만볼트', nameEn: 'Thunderbolt',
    type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15,
  },
  '10': {
    id: 10, name: 'scratch', nameKo: '할퀴기', nameEn: 'Scratch',
    type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35,
  },
  '45': {
    id: 45, name: 'growl', nameKo: '울음소리', nameEn: 'Growl',
    type: 'normal', category: 'physical', power: 0, accuracy: 100, pp: 40,
  },
};

// Pikachu-like pokemon (id 25): learns moves at levels 1, 1, 6, 15, 26
const testPokemonMoves: Record<string, PokemonMovePool> = {
  '25': {
    pool: [
      { moveId: 84, learnLevel: 1 },   // thunder-shock
      { moveId: 33, learnLevel: 1 },   // tackle
      { moveId: 98, learnLevel: 6 },   // quick-attack
      { moveId: 9, learnLevel: 15 },   // thunder-punch
      { moveId: 85, learnLevel: 26 },  // thunderbolt
    ],
  },
  // Pokemon with 5+ level-1 moves for testing assignDefaultMoves
  '99': {
    pool: [
      { moveId: 33, learnLevel: 1 },   // tackle (40)
      { moveId: 84, learnLevel: 1 },   // thunder-shock (40)
      { moveId: 98, learnLevel: 1 },   // quick-attack (40)
      { moveId: 10, learnLevel: 1 },   // scratch (40)
      { moveId: 45, learnLevel: 1 },   // growl (0)
      { moveId: 9, learnLevel: 5 },    // thunder-punch (75)
    ],
  },
};

// ── Tests ──

describe('move-learning', () => {
  beforeEach(() => {
    _injectMovesData(testMoves, testPokemonMoves);
  });

  afterEach(() => {
    _resetMovesCache();
  });

  describe('checkMoveLearn', () => {
    it('learns a new move when slot available (level 5→7)', () => {
      // Pokemon 25 starts with thunder-shock and tackle (level 1 moves)
      const result = checkMoveLearn(25, 5, 7, [84, 33]);

      assert.deepStrictEqual(result.moves, [84, 33, 98]);
      assert.strictEqual(result.learned, 98); // quick-attack at level 6
      assert.strictEqual(result.replaced, null);
    });

    it('learns multiple moves across a level range', () => {
      // Level 1→16: should pick up quick-attack (6) and thunder-punch (15)
      const result = checkMoveLearn(25, 1, 16, [84, 33]);

      assert.deepStrictEqual(result.moves, [84, 33, 98, 9]);
      assert.strictEqual(result.learned, 9); // last learned = thunder-punch
      assert.strictEqual(result.replaced, null);
    });

    it('skips moves already known', () => {
      const result = checkMoveLearn(25, 0, 7, [84, 33, 98]);

      // Already knows all moves in this range
      assert.deepStrictEqual(result.moves, [84, 33, 98]);
      assert.strictEqual(result.learned, null);
      assert.strictEqual(result.replaced, null);
    });

    it('replaces weakest move when at 4 moves and new move is stronger', () => {
      // Has 4 moves, levels through 26 to learn thunderbolt (power 90)
      // Weakest are tackle/thunder-shock/quick-attack (power 40 each)
      const result = checkMoveLearn(25, 25, 27, [84, 33, 98, 9]);

      assert.strictEqual(result.learned, 85); // thunderbolt
      assert.ok(
        [84, 33, 98].includes(result.replaced!),
        `replaced should be one of the 40-power moves, got ${result.replaced}`,
      );
      assert.strictEqual(result.moves.length, 4);
      assert.ok(result.moves.includes(85)); // thunderbolt is in the set
      assert.ok(result.moves.includes(9));  // thunder-punch kept
    });

    it('does NOT replace when new move is not stronger than weakest', () => {
      // All 4 moves have power >= 40, quick-attack also has power 40
      // thunder-punch (75) and thunderbolt (90) are stronger than all
      // Put pokemon at level 5→7 with 4 strong moves already
      const result = checkMoveLearn(25, 5, 7, [85, 9, 84, 33]);

      // quick-attack (power 40) is not stronger than weakest (40), so no replace
      assert.deepStrictEqual(result.moves, [85, 9, 84, 33]);
      assert.strictEqual(result.learned, null);
      assert.strictEqual(result.replaced, null);
    });

    it('does nothing when no new moves in level range', () => {
      const result = checkMoveLearn(25, 7, 14, [84, 33, 98]);

      assert.deepStrictEqual(result.moves, [84, 33, 98]);
      assert.strictEqual(result.learned, null);
      assert.strictEqual(result.replaced, null);
    });

    it('does nothing for unknown pokemon', () => {
      const result = checkMoveLearn(9999, 1, 50, []);

      assert.deepStrictEqual(result.moves, []);
      assert.strictEqual(result.learned, null);
      assert.strictEqual(result.replaced, null);
    });

    it('does not mutate the input array', () => {
      const original = [84, 33];
      const copy = [...original];
      checkMoveLearn(25, 5, 7, original);

      assert.deepStrictEqual(original, copy);
    });

    it('handles same oldLevel and newLevel (no level gain)', () => {
      const result = checkMoveLearn(25, 6, 6, [84, 33]);

      assert.deepStrictEqual(result.moves, [84, 33]);
      assert.strictEqual(result.learned, null);
      assert.strictEqual(result.replaced, null);
    });

    it('includes moves at exactly newLevel (boundary)', () => {
      // Level 5→6: should learn quick-attack at exactly level 6
      const result = checkMoveLearn(25, 5, 6, [84, 33]);

      assert.deepStrictEqual(result.moves, [84, 33, 98]);
      assert.strictEqual(result.learned, 98);
    });

    it('excludes moves at exactly oldLevel (boundary)', () => {
      // Level 6→10: should NOT re-learn quick-attack (learnLevel 6 = oldLevel)
      const result = checkMoveLearn(25, 6, 10, [84, 33]);

      assert.deepStrictEqual(result.moves, [84, 33]);
      assert.strictEqual(result.learned, null);
    });

    it('replaces the lowest-power move among 4 when a stronger move arrives', () => {
      // Construct a set where one move has distinctly lower power
      // growl=0, tackle=40, thunder-shock=40, thunder-punch=75
      const result = checkMoveLearn(25, 25, 27, [45, 33, 84, 9]);

      // thunderbolt (90) should replace growl (0) - the weakest
      assert.strictEqual(result.learned, 85);
      assert.strictEqual(result.replaced, 45); // growl replaced
      assert.ok(result.moves.includes(85));
      assert.ok(!result.moves.includes(45));
    });
  });

  describe('initializeMoves', () => {
    it('returns moves for a pokemon at a given level', () => {
      const moves = initializeMoves(25, 10);

      // At level 10: eligible moves are thunder-shock(1), tackle(1), quick-attack(6)
      assert.strictEqual(moves.length, 3);
      assert.ok(moves.includes(84));
      assert.ok(moves.includes(33));
      assert.ok(moves.includes(98));
    });

    it('returns at most 4 moves, preferring higher power', () => {
      // Pokemon 99 has 5 level-1 moves + 1 at level 5
      const moves = initializeMoves(99, 1);

      // 5 eligible at level 1, should pick top 4 by power
      // tackle(40), thunder-shock(40), quick-attack(40), scratch(40), growl(0)
      assert.strictEqual(moves.length, 4);
      // growl (power 0) should be excluded
      assert.ok(!moves.includes(45), 'growl (power 0) should not be in the top 4');
    });

    it('includes higher-level moves when level is high enough', () => {
      const moves = initializeMoves(99, 10);

      // At level 10: all 6 moves eligible, pick top 4 by power
      // thunder-punch(75), tackle(40), thunder-shock(40), quick-attack(40), scratch(40), growl(0)
      assert.strictEqual(moves.length, 4);
      assert.ok(moves.includes(9), 'thunder-punch (power 75) should be included');
      assert.ok(!moves.includes(45), 'growl (power 0) should not be included');
    });

    it('returns empty array for unknown pokemon', () => {
      const moves = initializeMoves(9999, 50);
      assert.deepStrictEqual(moves, []);
    });
  });
});
