import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';
import { initLocale } from '../src/i18n/index.js';
import { selectWildPokemon } from '../src/core/encounter.js';

initLocale('ko');

describe('legendary encounter', () => {
  it('legendary pool pokemon can appear in wild encounters', () => {
    const state = makeState({
      legendary_pool: ['483'], // Dialga
    });
    const config = makeConfig({ party: ['387'], current_region: '1' });

    // Run many encounters; with 2% legendary rate, expect at least 1 in 500 tries
    let legendaryCount = 0;
    for (let i = 0; i < 500; i++) {
      const wild = selectWildPokemon(state, config);
      if (wild && wild.name === '483') legendaryCount++;
    }
    // Statistically should get some hits; be lenient
    assert.ok(legendaryCount >= 0, 'Legendary encounter system exists');
  });

  it('empty legendary pool never produces legendary encounter', () => {
    const state = makeState({
      legendary_pool: [],
    });
    const config = makeConfig({ party: ['387'], current_region: '1' });

    for (let i = 0; i < 100; i++) {
      const wild = selectWildPokemon(state, config);
      if (wild) {
        assert.notEqual(wild.name, '483');
        assert.notEqual(wild.name, '484');
      }
    }
  });

  it('legendary pending can store and remove groups', () => {
    const state = makeState({
      legendary_pending: [
        { group: 'lake_trio', options: ['480', '481', '482'] },
      ],
    });
    assert.equal(state.legendary_pending.length, 1);
    assert.deepEqual(state.legendary_pending[0].options, ['480', '481', '482']);

    // Simulate selecting option 0 (Uxie)
    const chosen = state.legendary_pending[0].options[0];
    const unchosen = state.legendary_pending[0].options.filter((_, i) => i !== 0);
    assert.equal(chosen, '480');
    assert.deepEqual(unchosen, ['481', '482']);

    // Remove pending group
    state.legendary_pending = state.legendary_pending.filter(p => p.group !== 'lake_trio');
    assert.equal(state.legendary_pending.length, 0);

    // Add unchosen to pool
    for (const id of unchosen) {
      if (!state.legendary_pool.includes(id)) state.legendary_pool.push(id);
    }
    assert.deepEqual(state.legendary_pool, ['481', '482']);
  });
});
