import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { addItem, useItem, getItemCount, rollItemDrop, randInt, getDropRateMultiplier } from '../src/core/items.js';

describe('items', () => {
  it('addItem increments count', () => {
    const state = makeState();
    addItem(state, 'pokeball');
    assert.equal(getItemCount(state, 'pokeball'), 1);
    addItem(state, 'pokeball', 3);
    assert.equal(getItemCount(state, 'pokeball'), 4);
  });

  it('useItem decrements count', () => {
    const state = makeState({ items: { pokeball: 2 } });
    assert.ok(useItem(state, 'pokeball'));
    assert.equal(getItemCount(state, 'pokeball'), 1);
  });

  it('useItem fails at 0', () => {
    const state = makeState({ items: { pokeball: 0 } });
    assert.ok(!useItem(state, 'pokeball'));
  });

  it('useItem fails for nonexistent item', () => {
    const state = makeState();
    assert.ok(!useItem(state, 'pokeball'));
  });

  describe('randInt', () => {
    it('returns exact value when min === max', () => {
      assert.equal(randInt(5, 5), 5);
      assert.equal(randInt(0, 0), 0);
    });

    it('returns values within [min, max] inclusive', () => {
      for (let i = 0; i < 200; i++) {
        const val = randInt(1, 5);
        assert.ok(val >= 1 && val <= 5, `randInt(1,5) out of range: ${val}`);
      }
    });

    it('returns integer values', () => {
      for (let i = 0; i < 50; i++) {
        const val = randInt(1, 10);
        assert.equal(val, Math.floor(val));
      }
    });
  });

  describe('rollItemDrop', () => {
    it('drops pokeball (not retry_token) on victory', () => {
      const state = makeState();
      // Run enough times to get at least one drop
      let dropped = 0;
      for (let i = 0; i < 100 && !dropped; i++) {
        dropped = rollItemDrop(state, true);
      }
      assert.ok(dropped > 0, 'Should drop at least once in 100 tries at 30%');
      assert.ok(getItemCount(state, 'pokeball') > 0, 'Dropped item should be pokeball');
      assert.equal(getItemCount(state, 'retry_token'), 0, 'Should not drop retry_token');
    });

    it('victory drop quantity is 1-3', () => {
      // Force a drop by running many times, collect all drop counts
      const drops: number[] = [];
      for (let i = 0; i < 500; i++) {
        const state = makeState();
        const count = rollItemDrop(state, true);
        if (count > 0) drops.push(count);
        if (drops.length >= 30) break;
      }
      assert.ok(drops.length > 0, 'Should have at least one drop in 500 tries');
      for (const d of drops) {
        assert.ok(d >= 1 && d <= 3, `Victory drop count out of range [1,3]: ${d}`);
      }
    });

    it('drops on loss at lower rate', () => {
      const state = makeState();
      let dropped = 0;
      for (let i = 0; i < 200 && !dropped; i++) {
        dropped = rollItemDrop(state, false);
      }
      assert.ok(dropped > 0, 'Should drop at least once in 200 tries at 12%');
      assert.ok(getItemCount(state, 'pokeball') > 0);
    });

    it('loss drop quantity is 1', () => {
      const drops: number[] = [];
      for (let i = 0; i < 500; i++) {
        const state = makeState();
        const count = rollItemDrop(state, false);
        if (count > 0) drops.push(count);
        if (drops.length >= 20) break;
      }
      assert.ok(drops.length > 0, 'Should have at least one drop in 500 tries');
      for (const d of drops) {
        assert.equal(d, 1, `Loss drop count should always be 1, got: ${d}`);
      }
    });

    it('soft cap reduces drop rate at high inventory', () => {
      let lowDrops = 0;
      let highDrops = 0;
      const trials = 2000;
      for (let i = 0; i < trials; i++) {
        if (rollItemDrop(makeState({ items: { pokeball: 0 } }), true) > 0) lowDrops++;
        if (rollItemDrop(makeState({ items: { pokeball: 400 } }), true) > 0) highDrops++;
      }
      assert.ok(highDrops < lowDrops, `High inventory (${highDrops}) should have fewer drops than low (${lowDrops})`);
      assert.ok(highDrops < trials * 0.10, `High inventory drops (${highDrops}) should be under 10% of trials`);
    });

    it('returns 0 when no drop occurs (eventually)', () => {
      // With 30% rate, probability of never getting 0 in 10 tries is negligible
      let gotZero = false;
      for (let i = 0; i < 100; i++) {
        const state = makeState();
        if (rollItemDrop(state, true) === 0) {
          gotZero = true;
          break;
        }
      }
      assert.ok(gotZero, 'Should return 0 when no drop (70% of the time)');
    });
  });

  describe('getDropRateMultiplier', () => {
    it('returns 1.0 for 0-99 balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: {} })), 1.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 0 } })), 1.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 50 } })), 1.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 99 } })), 1.0);
    });

    it('returns 0.5 for 100-199 balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 100 } })), 0.5);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 150 } })), 0.5);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 199 } })), 0.5);
    });

    it('returns 0.25 for 200-299 balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 200 } })), 0.25);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 299 } })), 0.25);
    });

    it('returns 0.1 for 300+ balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 300 } })), 0.1);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 500 } })), 0.1);
    });
  });
});
