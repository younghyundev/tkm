import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { addItem, useItem, getItemCount, rollItemDrop } from '../src/core/items.js';

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

  describe('rollItemDrop', () => {
    it('drops pokeball (not retry_token)', () => {
      const state = makeState();
      // Run enough times to get at least one drop
      let dropped = false;
      for (let i = 0; i < 100 && !dropped; i++) {
        dropped = rollItemDrop(state, true);
      }
      assert.ok(dropped, 'Should drop at least once in 100 tries at 20%');
      assert.ok(getItemCount(state, 'pokeball') > 0, 'Dropped item should be pokeball');
      assert.equal(getItemCount(state, 'retry_token'), 0, 'Should not drop retry_token');
    });

    it('drops on loss at lower rate', () => {
      const state = makeState();
      let dropped = false;
      for (let i = 0; i < 200 && !dropped; i++) {
        dropped = rollItemDrop(state, false);
      }
      assert.ok(dropped, 'Should drop at least once in 200 tries at 5%');
      assert.ok(getItemCount(state, 'pokeball') > 0);
    });
  });
});
