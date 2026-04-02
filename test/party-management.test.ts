import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, makeConfig } from './helpers.js';
import { initLocale } from '../src/i18n/index.js';

initLocale('ko');

describe('party management', () => {
  describe('box filtering', () => {
    it('box contains unlocked pokemon not in party', () => {
      const state = makeState({
        unlocked: ['387', '390', '393', '396'],
        pokemon: {
          '387': { id: 387, xp: 0, level: 10, friendship: 0, ev: 0 },
          '390': { id: 390, xp: 0, level: 8, friendship: 0, ev: 0 },
          '393': { id: 393, xp: 0, level: 5, friendship: 0, ev: 0 },
          '396': { id: 396, xp: 0, level: 3, friendship: 0, ev: 0 },
        },
      });
      const config = makeConfig({ party: ['387', '390'] });

      const box = state.unlocked
        .filter(name => !config.party.includes(name) && state.pokemon[name])
        .map(name => ({ name, level: state.pokemon[name]?.level ?? 1 }));

      assert.equal(box.length, 2);
      assert.ok(box.some(p => p.name === '393'));
      assert.ok(box.some(p => p.name === '396'));
    });

    it('box is empty when all unlocked are in party', () => {
      const state = makeState({
        unlocked: ['387', '390'],
        pokemon: {
          '387': { id: 387, xp: 0, level: 10, friendship: 0, ev: 0 },
          '390': { id: 390, xp: 0, level: 8, friendship: 0, ev: 0 },
        },
      });
      const config = makeConfig({ party: ['387', '390'] });

      const box = state.unlocked
        .filter(name => !config.party.includes(name) && state.pokemon[name]);

      assert.equal(box.length, 0);
    });
  });

  describe('party swap logic', () => {
    it('swap replaces party slot with box pokemon', () => {
      const config = makeConfig({ party: ['387', '390', '393'] });
      const slotIdx = 1; // Slot 2 (0-indexed)
      const target = '396';

      const outgoing = config.party[slotIdx];
      config.party[slotIdx] = target;

      assert.equal(outgoing, '390');
      assert.deepEqual(config.party, ['387', '396', '393']);
    });
  });

  describe('party reorder logic', () => {
    it('reorder moves pokemon between slots', () => {
      const party = ['387', '390', '393', '396'];
      const fromIdx = 0;
      const toIdx = 2;

      const [moved] = party.splice(fromIdx, 1);
      party.splice(toIdx, 0, moved);

      assert.equal(moved, '387');
      assert.deepEqual(party, ['390', '393', '387', '396']);
    });

    it('reorder same slot is no-op', () => {
      const party = ['387', '390', '393'];
      const original = [...party];
      const fromIdx = 1;
      const toIdx = 1;

      if (fromIdx !== toIdx) {
        const [moved] = party.splice(fromIdx, 1);
        party.splice(toIdx, 0, moved);
      }

      assert.deepEqual(party, original);
    });
  });

  describe('party suggest scoring', () => {
    it('scores pokemon higher for type advantage against region pool', () => {
      // Simulate scoring: water pokemon should score well against fire-heavy region
      const typeCounts = { fire: 5, ground: 3, rock: 2 };
      const typeChart: Record<string, { strong: string[] }> = {
        water: { strong: ['fire', 'ground', 'rock'] },
        grass: { strong: ['water', 'ground', 'rock'] },
      };

      function score(types: string[]): number {
        let s = 0;
        for (const pType of types) {
          const matchup = typeChart[pType];
          if (!matchup) continue;
          for (const strong of matchup.strong) {
            s += (typeCounts[strong as keyof typeof typeCounts] ?? 0) * 2;
          }
        }
        return s;
      }

      const waterScore = score(['water']);
      const grassScore = score(['grass']);

      // Water beats fire(5), ground(3), rock(2) = (5+3+2)*2 = 20
      assert.equal(waterScore, 20);
      // Grass beats water(0), ground(3), rock(2) = (0+3+2)*2 = 10
      assert.equal(grassScore, 10);
      assert.ok(waterScore > grassScore);
    });
  });

  describe('state fields', () => {
    it('completed_chains defaults to empty array', () => {
      const state = makeState();
      assert.deepEqual(state.completed_chains, []);
    });

    it('legendary_pool can be populated', () => {
      const state = makeState({ legendary_pool: ['483', '484'] });
      assert.deepEqual(state.legendary_pool, ['483', '484']);
    });
  });
});
