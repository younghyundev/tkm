import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';
import { addItem, useItem, getItemCount, shouldAutoRetry } from '../src/core/items.js';

describe('items', () => {
  it('addItem increments count', () => {
    const state = makeState();
    addItem(state, 'retry_token');
    assert.equal(getItemCount(state, 'retry_token'), 1);
    addItem(state, 'retry_token', 3);
    assert.equal(getItemCount(state, 'retry_token'), 4);
  });

  it('useItem decrements count', () => {
    const state = makeState({ items: { retry_token: 2 } });
    assert.ok(useItem(state, 'retry_token'));
    assert.equal(getItemCount(state, 'retry_token'), 1);
  });

  it('useItem fails at 0', () => {
    const state = makeState({ items: { retry_token: 0 } });
    assert.ok(!useItem(state, 'retry_token'));
  });

  it('useItem fails for nonexistent item', () => {
    const state = makeState();
    assert.ok(!useItem(state, 'retry_token'));
  });

  describe('shouldAutoRetry', () => {
    it('true when enabled + threshold met + item available', () => {
      const state = makeState({ items: { retry_token: 1 } });
      const config = makeConfig({ auto_retry_enabled: true, auto_retry_threshold: 0.6 });
      assert.ok(shouldAutoRetry(state, config, 0.65));
    });

    it('false when disabled', () => {
      const state = makeState({ items: { retry_token: 1 } });
      const config = makeConfig({ auto_retry_enabled: false });
      assert.ok(!shouldAutoRetry(state, config, 0.65));
    });

    it('false when winRate below threshold', () => {
      const state = makeState({ items: { retry_token: 1 } });
      const config = makeConfig({ auto_retry_threshold: 0.6 });
      assert.ok(!shouldAutoRetry(state, config, 0.4));
    });

    it('false when no items', () => {
      const state = makeState();
      const config = makeConfig();
      assert.ok(!shouldAutoRetry(state, config, 0.8));
    });
  });
});
