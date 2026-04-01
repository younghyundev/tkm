import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';
import { getRandomTip } from '../src/core/guide.js';

describe('guide', () => {
  describe('getRandomTip', () => {
    it('returns null or valid tip object', () => {
      const state = makeState();
      const config = makeConfig({ party: ['모부기'] });
      // Run multiple times since there's a 30% probability gate
      for (let i = 0; i < 50; i++) {
        const tip = getRandomTip(state, config);
        if (tip !== null) {
          assert.equal(typeof tip.id, 'string');
          assert.equal(typeof tip.text, 'string');
          assert.ok(tip.id.length > 0, 'tip id should not be empty');
          assert.ok(tip.text.length > 0, 'tip text should not be empty');
          return; // Got a valid tip, test passes
        }
      }
      // 50 tries at 30% = (0.7)^50 ≈ 1.8e-8 chance of all null — practically impossible
      assert.fail('Expected at least one tip in 50 tries');
    });

    it('does not repeat the same tip as last_tip', () => {
      const state = makeState();
      const config = makeConfig({ party: ['모부기'] });
      // Get a first tip
      let firstTip = null;
      for (let i = 0; i < 100; i++) {
        firstTip = getRandomTip(state, config);
        if (firstTip) break;
      }
      if (!firstTip) return; // Skip if we can't get a tip

      // Set last_tip and verify next tip is different
      state.last_tip = firstTip;
      let gotDifferent = false;
      for (let i = 0; i < 100; i++) {
        const tip = getRandomTip(state, config);
        if (tip && tip.id !== firstTip.id) {
          gotDifferent = true;
          break;
        }
      }
      assert.ok(gotDifferent, 'Should eventually get a different tip than last_tip');
    });

    it('resolves dynamic tip templates (no unresolved {placeholders})', () => {
      const state = makeState({
        pokemon: { '모부기': { id: 387, xp: 5000, level: 20, friendship: 0, ev: 0 } },
        unlocked: ['모부기'],
        battle_wins: 5, battle_count: 10,
        session_count: 5, catch_count: 3,
      });
      const config = makeConfig({ party: ['모부기', '불꽃숭이'] });

      const dynamicTips: Array<{ id: string; text: string }> = [];
      for (let i = 0; i < 200; i++) {
        const tip = getRandomTip(state, config);
        if (tip && tip.text.includes('{')) {
          // Found an unresolved placeholder — this is a bug
          assert.fail(`Unresolved placeholder in tip "${tip.id}": ${tip.text}`);
        }
        if (tip) dynamicTips.push(tip);
      }
      assert.ok(dynamicTips.length > 0, 'Should get at least some tips');
    });
  });
});
