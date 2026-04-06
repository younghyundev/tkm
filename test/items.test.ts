import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { addItem, useItem, getItemCount, rollItemDrop, randInt } from '../src/core/items.js';

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

    it('victory drop quantity is 1-5', () => {
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
        assert.ok(d >= 1 && d <= 5, `Victory drop count out of range [1,5]: ${d}`);
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

    it('loss drop quantity is 1-2', () => {
      const drops: number[] = [];
      for (let i = 0; i < 500; i++) {
        const state = makeState();
        const count = rollItemDrop(state, false);
        if (count > 0) drops.push(count);
        if (drops.length >= 20) break;
      }
      assert.ok(drops.length > 0, 'Should have at least one drop in 500 tries');
      for (const d of drops) {
        assert.ok(d >= 1 && d <= 2, `Loss drop count out of range [1,2]: ${d}`);
      }
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
});
