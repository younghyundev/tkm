import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { State, Config } from '../src/core/types.js';
import { addItem, useItem, getItemCount, shouldAutoRetry } from '../src/core/items.js';

function makeState(overrides: Partial<State> = {}): State {
  return {
    pokemon: {}, unlocked: [], achievements: {},
    total_tokens_consumed: 0, session_count: 0, error_count: 0,
    permission_count: 0, evolution_count: 0, last_session_id: null,
    xp_bonus_multiplier: 1.0, last_session_tokens: {}, pokedex: {},
    encounter_count: 0, catch_count: 0, battle_count: 0,
    battle_wins: 0, battle_losses: 0, items: {},
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    tokens_per_xp: 10000, party: [], starter_chosen: true,
    volume: 0.5, sprite_enabled: true, cry_enabled: true,
    xp_formula: 'medium_fast', xp_bonus_multiplier: 1.0,
    max_party_size: 6, peon_ping_integration: false,
    peon_ping_port: 19998, current_region: '쌍둥이잎 마을',
    auto_retry_enabled: true, auto_retry_threshold: 0.60,
    ...overrides,
  };
}

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
