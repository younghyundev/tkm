import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';
import { getPokedexList, getRegionSummary } from '../src/core/pokedex.js';
import { getBoxList } from '../src/core/box.js';
import { getPokemonName } from '../src/core/pokemon-data.js';

// Gen4 pokemon used in tests:
// 387: grass, common, stage:0, region:2 (Turtwig)
// 388: grass, uncommon, stage:1, region:2 (Grotle)
// 389: grass/ground, rare, stage:2, region:2 (Torterra)
// 390: fire, common, stage:0, region:7 (Chimchar)
// 391: fire/fighting, uncommon, stage:1, region:7 (Monferno)
// 392: fire/fighting, rare, stage:2, region:7 (Infernape)
// 393: water, common, stage:0, region:3 (Piplup)

describe('getPokedexList filters', () => {
  it('returns all pokemon with no filters', () => {
    const state = makeState();
    const list = getPokedexList(state);
    assert.ok(list.length > 0);
  });

  it('filters by status=caught', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01' },
        '390': { seen: true, caught: false, first_seen: '2026-01-01' },
      },
    });
    const list = getPokedexList(state, { status: 'caught' });
    assert.ok(list.some(e => e.name === '387'));
    assert.ok(!list.some(e => e.name === '390'));
  });

  it('filters by status=uncaught', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01' },
        '390': { seen: true, caught: false, first_seen: '2026-01-01' },
      },
    });
    const list = getPokedexList(state, { status: 'uncaught' });
    assert.ok(!list.some(e => e.name === '387'));
    // 390 is seen but not caught — uncaught includes it
    assert.ok(list.some(e => e.name === '390'));
  });

  it('filters by stage=0 (base form)', () => {
    const state = makeState();
    const list = getPokedexList(state, { stage: 0 });
    for (const entry of list) {
      assert.equal(entry.stage, 0);
    }
    assert.ok(list.some(e => e.name === '387')); // Turtwig stage 0
    assert.ok(!list.some(e => e.name === '388')); // Grotle stage 1
  });

  it('filters by stage=2 (fully evolved)', () => {
    const state = makeState();
    const list = getPokedexList(state, { stage: 2 });
    for (const entry of list) {
      assert.equal(entry.stage, 2);
    }
    assert.ok(list.some(e => e.name === '389')); // Torterra stage 2
    assert.ok(!list.some(e => e.name === '387')); // Turtwig stage 0
  });

  it('filters by shiny=true', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01', shiny_caught: true },
        '390': { seen: true, caught: true, first_seen: '2026-01-01' },
      },
    });
    const list = getPokedexList(state, { shiny: true });
    assert.ok(list.some(e => e.name === '387'));
    assert.ok(!list.some(e => e.name === '390'));
  });

  it('filters by keyword on internal ID', () => {
    const state = makeState();
    const list = getPokedexList(state, { keyword: '39' });
    assert.ok(list.some(e => e.name === '390'));
    assert.ok(list.some(e => e.name === '391'));
    assert.ok(list.some(e => e.name === '392'));
    assert.ok(list.some(e => e.name === '393'));
  });

  it('filters by keyword on display name (case-insensitive)', () => {
    const state = makeState();
    // getPokemonName('387') returns localized name (e.g. "모부기" in ko)
    // Search by partial display name should work
    const name387 = getPokemonName('387');
    const partial = name387.slice(0, 2);
    const list = getPokedexList(state, { keyword: partial });
    assert.ok(list.some(e => e.name === '387'), `keyword "${partial}" should match pokemon 387 (${name387})`);
  });

  it('combines type + uncaught with AND logic', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01' },
        '388': { seen: true, caught: false, first_seen: '2026-01-01' },
      },
    });
    const list = getPokedexList(state, { type: 'grass', status: 'uncaught' });
    // 387 is caught grass → excluded
    assert.ok(!list.some(e => e.name === '387'));
    // 388 is uncaught grass → included
    assert.ok(list.some(e => e.name === '388'));
    // 390 is uncaught fire → excluded (wrong type)
    assert.ok(!list.some(e => e.name === '390'));
  });

  it('combines region + caught + shiny with AND logic', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01', shiny_caught: true },
        '388': { seen: true, caught: true, first_seen: '2026-01-01' },
      },
    });
    const list = getPokedexList(state, { region: '2', status: 'caught', shiny: true });
    assert.ok(list.some(e => e.name === '387')); // region 2, caught, shiny
    assert.ok(!list.some(e => e.name === '388')); // region 2, caught, NOT shiny
  });

  it('returns empty array when no matches', () => {
    const state = makeState();
    const list = getPokedexList(state, { type: 'dragon', stage: 0, status: 'caught' });
    assert.equal(list.length, 0);
  });

  it('existing type filter still works', () => {
    const state = makeState();
    const list = getPokedexList(state, { type: 'fire' });
    for (const entry of list) {
      assert.ok(entry.types.includes('fire'));
    }
  });

  it('existing region filter still works', () => {
    const state = makeState();
    const list = getPokedexList(state, { region: '2' });
    for (const entry of list) {
      assert.equal(entry.region, '2');
    }
  });

  it('existing rarity filter still works', () => {
    const state = makeState();
    const list = getPokedexList(state, { rarity: 'rare' });
    for (const entry of list) {
      assert.equal(entry.rarity, 'rare');
    }
  });

  it('includes stage and shinyCaught in entries', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01', shiny_caught: true },
      },
    });
    const list = getPokedexList(state);
    const entry = list.find(e => e.name === '387');
    assert.ok(entry);
    assert.equal(entry.stage, 0);
    assert.equal(entry.shinyCaught, true);
  });
});

describe('getRegionSummary', () => {
  it('returns correct per-region counts', () => {
    const state = makeState({
      pokedex: {
        '387': { seen: true, caught: true, first_seen: '2026-01-01' },
        '388': { seen: true, caught: false, first_seen: '2026-01-01' },
        '390': { seen: true, caught: true, first_seen: '2026-01-01' },
      },
    });
    const summary = getRegionSummary(state);
    // Region 2 has 387 (caught) and 388 (seen)
    const r2 = summary.find(s => s.regionId === '2');
    assert.ok(r2);
    assert.ok(r2.total > 0);
    assert.equal(r2.caught, 1); // only 387
    assert.equal(r2.seen, 2); // 387 + 388
    // Region 7 has 390 (caught)
    const r7 = summary.find(s => s.regionId === '7');
    assert.ok(r7);
    assert.equal(r7.caught, 1);
  });

  it('handles empty pokedex', () => {
    const state = makeState();
    const summary = getRegionSummary(state);
    assert.ok(summary.length > 0); // regions still exist
    for (const s of summary) {
      assert.equal(s.caught, 0);
      assert.equal(s.seen, 0);
    }
  });
});

describe('getBoxList', () => {
  const boxState = () => makeState({
    unlocked: ['387', '388', '389', '390', '391', '393', '390_shiny'],
    pokemon: {
      '387': { id: 387, xp: 0, level: 5, friendship: 0, ev: 0 },
      '388': { id: 388, xp: 0, level: 15, friendship: 0, ev: 0 },
      '389': { id: 389, xp: 0, level: 32, friendship: 0, ev: 0 },
      '390': { id: 390, xp: 0, level: 5, friendship: 0, ev: 0 },
      '391': { id: 391, xp: 0, level: 20, friendship: 0, ev: 0 },
      '393': { id: 393, xp: 0, level: 5, friendship: 0, ev: 0 },
      '390_shiny': { id: 390, xp: 0, level: 10, friendship: 0, ev: 0, shiny: true },
    },
  });

  it('returns box pokemon excluding party', () => {
    const state = boxState();
    const config = makeConfig({ party: ['387'] });
    const list = getBoxList(state, config);
    assert.ok(!list.some(e => e.name === '387')); // in party
    assert.ok(list.some(e => e.name === '388'));
    assert.equal(list.length, 6); // 7 unlocked - 1 in party
  });

  it('filters by type', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { type: 'fire' });
    for (const entry of list) {
      assert.ok(entry.types.includes('fire'));
    }
    assert.ok(list.some(e => e.name === '390'));
    assert.ok(!list.some(e => e.name === '387')); // grass
  });

  it('filters by rarity', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { rarity: 'rare' });
    for (const entry of list) {
      assert.equal(entry.rarity, 'rare');
    }
    assert.ok(list.some(e => e.name === '389')); // rare
    assert.ok(!list.some(e => e.name === '387')); // common
  });

  it('filters by stage', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { stage: 0 });
    for (const entry of list) {
      assert.equal(entry.stage, 0);
    }
  });

  it('filters by shiny', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { shiny: true });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, '390_shiny');
    assert.equal(list[0].isShiny, true);
  });

  it('filters by keyword', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { keyword: '39' });
    for (const entry of list) {
      assert.ok(entry.name.includes('39'));
    }
  });

  it('sorts by rarity (mythical > legendary > rare > uncommon > common)', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, undefined, 'rarity');
    // Verify order: rare entries before uncommon before common
    let lastRank = 999;
    const RANK: Record<string, number> = { mythical: 5, legendary: 4, rare: 3, uncommon: 2, common: 1 };
    for (const entry of list) {
      const rank = RANK[entry.rarity] ?? 0;
      assert.ok(rank <= lastRank, `${entry.rarity}(${rank}) should not come after rank ${lastRank}`);
      lastRank = rank;
    }
  });

  it('sorts by level (descending)', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, undefined, 'level');
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1].level >= list[i].level);
    }
  });

  it('combines filter + sort', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { stage: 0 }, 'level');
    for (const entry of list) {
      assert.equal(entry.stage, 0);
    }
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1].level >= list[i].level);
    }
  });

  it('returns empty for no matches', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config, { type: 'dragon' });
    assert.equal(list.length, 0);
  });

  it('includes isShiny and stage in entries', () => {
    const state = boxState();
    const config = makeConfig({ party: [] });
    const list = getBoxList(state, config);
    const shiny = list.find(e => e.name === '390_shiny');
    assert.ok(shiny);
    assert.equal(shiny.isShiny, true);
    assert.equal(shiny.stage, 0);
    const normal = list.find(e => e.name === '389');
    assert.ok(normal);
    assert.equal(normal.isShiny, false);
    assert.equal(normal.stage, 2);
  });
});
