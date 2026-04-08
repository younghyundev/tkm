import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { addItem, useItem, getItemCount, randInt, getDropRateMultiplier } from '../src/core/items.js';

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

  describe('getDropRateMultiplier', () => {
    it('returns 2.0 for 0-49 balls (recovery boost)', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: {} })), 2.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 0 } })), 2.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 25 } })), 2.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 49 } })), 2.0);
    });

    it('returns 1.0 for 50-149 balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 50 } })), 1.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 100 } })), 1.0);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 149 } })), 1.0);
    });

    it('returns 0.3 for 150-299 balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 150 } })), 0.3);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 200 } })), 0.3);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 299 } })), 0.3);
    });

    it('returns 0.1 for 300+ balls', () => {
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 300 } })), 0.1);
      assert.equal(getDropRateMultiplier(makeState({ items: { pokeball: 500 } })), 0.1);
    });
  });
});
