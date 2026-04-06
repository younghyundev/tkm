import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeState, makeConfig } from './helpers.js';
import { initLocale } from '../src/i18n/index.js';
import {
  checkMilestoneRewards,
  checkTypeMasters,
  checkChainCompletion,
  countNonLegendaryCaught,
  getTypeMasterXpMultiplier,
  getTypeMasterProgress,
} from '../src/core/pokedex-rewards.js';
import type { PokedexRewardsDB } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

initLocale('ko');

describe('pokedex-rewards', () => {
  describe('pokedex-rewards.json', () => {
    it('loads valid rewards data', () => {
      const raw = readFileSync(join(PROJECT_ROOT, 'data', 'pokedex-rewards.json'), 'utf-8');
      const db = JSON.parse(raw) as PokedexRewardsDB;
      assert.ok(Array.isArray(db.milestones));
      assert.ok(db.milestones.length > 0);
      assert.ok(typeof db.legendary_groups === 'object');
      assert.ok(typeof db.type_master === 'object');
      assert.ok(typeof db.chain_completion_reward === 'object');
    });

    it('milestones have required fields', () => {
      const raw = readFileSync(join(PROJECT_ROOT, 'data', 'pokedex-rewards.json'), 'utf-8');
      const db = JSON.parse(raw) as PokedexRewardsDB;
      for (const m of db.milestones) {
        assert.ok(m.id, 'Missing id');
        assert.ok(typeof m.threshold === 'number', 'Missing threshold');
        assert.ok(m.reward_type, 'Missing reward_type');
        assert.ok(m.reward_value !== undefined, 'Missing reward_value');
        assert.ok(m.label.en, 'Missing en label');
        assert.ok(m.label.ko, 'Missing ko label');
      }
    });

    it('milestones are sorted by threshold ascending', () => {
      const raw = readFileSync(join(PROJECT_ROOT, 'data', 'pokedex-rewards.json'), 'utf-8');
      const db = JSON.parse(raw) as PokedexRewardsDB;
      for (let i = 1; i < db.milestones.length; i++) {
        assert.ok(
          db.milestones[i].threshold >= db.milestones[i - 1].threshold,
          `Milestone ${db.milestones[i].id} threshold not in order`,
        );
      }
    });

    it('legendary_groups reference valid pokemon IDs', () => {
      const raw = readFileSync(join(PROJECT_ROOT, 'data', 'pokedex-rewards.json'), 'utf-8');
      const db = JSON.parse(raw) as PokedexRewardsDB;
      const pokemonDB = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'pokemon.json'), 'utf-8'));
      for (const [groupId, group] of Object.entries(db.legendary_groups)) {
        assert.ok(group.options.length > 0, `Group ${groupId} has no options`);
        for (const id of group.options) {
          assert.ok(pokemonDB.pokemon[id], `Pokemon ${id} in group ${groupId} not found in pokemon.json`);
        }
      }
    });

    it('legendary_unlock milestones reference valid groups', () => {
      const raw = readFileSync(join(PROJECT_ROOT, 'data', 'pokedex-rewards.json'), 'utf-8');
      const db = JSON.parse(raw) as PokedexRewardsDB;
      for (const m of db.milestones) {
        if (m.reward_type === 'legendary_unlock') {
          assert.ok(
            db.legendary_groups[m.reward_value as string],
            `Milestone ${m.id} references unknown group ${m.reward_value}`,
          );
        }
      }
    });

    it('type_master config is valid', () => {
      const raw = readFileSync(join(PROJECT_ROOT, 'data', 'pokedex-rewards.json'), 'utf-8');
      const db = JSON.parse(raw) as PokedexRewardsDB;
      assert.equal(db.type_master.xp_bonus, 1.2);
      assert.ok(db.type_master.legendary_unlock_threshold > 0);
      assert.ok(db.type_master.special_legends.options.length > 0);
    });
  });

  describe('countNonLegendaryCaught', () => {
    it('excludes legendary and mythical from count', () => {
      const state = makeState({
        pokedex: {
          '387': { seen: true, caught: true, first_seen: '2026-01-01' },
          '390': { seen: true, caught: true, first_seen: '2026-01-01' },
          '483': { seen: true, caught: true, first_seen: '2026-01-01' }, // legendary
          '493': { seen: true, caught: true, first_seen: '2026-01-01' }, // mythical
        },
      });
      assert.equal(countNonLegendaryCaught(state), 2);
    });
  });

  describe('checkMilestoneRewards', () => {
    it('claims pokeball milestone at 10 caught', () => {
      const pokedex: Record<string, any> = {};
      // Add 10 non-legendary caught pokemon
      const ids = ['387','388','389','390','391','392','393','394','395','396'];
      for (const id of ids) {
        pokedex[id] = { seen: true, caught: true, first_seen: '2026-01-01' };
      }
      const state = makeState({ pokedex });
      const config = makeConfig();
      const claimed = checkMilestoneRewards(state, config);
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0].milestone.id, 'milestone_10');
      assert.ok(state.pokedex_milestones_claimed.includes('milestone_10'));
      assert.equal(state.items.pokeball, 5);
    });

    it('claims xp_multiplier milestone at 30 caught', () => {
      const pokedex: Record<string, any> = {};
      const pokemonDB = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'pokemon.json'), 'utf-8'));
      const nonLeg = Object.entries(pokemonDB.pokemon)
        .filter(([, p]: [string, any]) => p.rarity !== 'legendary' && p.rarity !== 'mythical')
        .slice(0, 30);
      for (const [id] of nonLeg) {
        pokedex[id] = { seen: true, caught: true, first_seen: '2026-01-01' };
      }
      const state = makeState({ pokedex });
      const config = makeConfig();
      const claimed = checkMilestoneRewards(state, config);
      // Should claim milestone_10 and milestone_30
      assert.ok(claimed.some(c => c.milestone.id === 'milestone_10'));
      assert.ok(claimed.some(c => c.milestone.id === 'milestone_30'));
      assert.ok(state.xp_bonus_multiplier > 1.0);
    });

    it('legendary_unlock milestone adds to legendary_pending', () => {
      const pokedex: Record<string, any> = {};
      const pokemonDB = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'pokemon.json'), 'utf-8'));
      const nonLeg = Object.entries(pokemonDB.pokemon)
        .filter(([, p]: [string, any]) => p.rarity !== 'legendary' && p.rarity !== 'mythical')
        .slice(0, 50);
      for (const [id] of nonLeg) {
        pokedex[id] = { seen: true, caught: true, first_seen: '2026-01-01' };
      }
      const state = makeState({ pokedex });
      const config = makeConfig();
      checkMilestoneRewards(state, config);
      assert.ok(state.legendary_pending.some(p => p.group === 'lake_trio'));
    });

    it('is idempotent — calling twice does not double rewards', () => {
      const pokedex: Record<string, any> = {};
      const ids = ['387','388','389','390','391','392','393','394','395','396'];
      for (const id of ids) {
        pokedex[id] = { seen: true, caught: true, first_seen: '2026-01-01' };
      }
      const state = makeState({ pokedex });
      const config = makeConfig();
      checkMilestoneRewards(state, config);
      const ballsAfterFirst = state.items.pokeball;
      checkMilestoneRewards(state, config);
      assert.equal(state.items.pokeball, ballsAfterFirst);
    });
  });

  describe('checkTypeMasters', () => {
    it('detects type master when all pokemon of a type are caught', () => {
      const pokemonDB = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'pokemon.json'), 'utf-8'));
      // Find all non-legendary fairy-type pokemon
      const fairyPokemon = Object.entries(pokemonDB.pokemon)
        .filter(([, p]: [string, any]) =>
          p.types.includes('fairy') && p.rarity !== 'legendary' && p.rarity !== 'mythical')
        .map(([id]: [string, any]) => id);

      const pokedex: Record<string, any> = {};
      for (const id of fairyPokemon) {
        pokedex[id] = { seen: true, caught: true, first_seen: '2026-01-01' };
      }
      const state = makeState({ pokedex });
      const newMasters = checkTypeMasters(state);
      assert.ok(newMasters.includes('fairy'));
      assert.ok(state.type_masters.includes('fairy'));
    });

    it('does not detect type master with partial catches', () => {
      const state = makeState({
        pokedex: {
          '468': { seen: true, caught: true, first_seen: '2026-01-01' }, // Togekiss (fairy)
        },
      });
      const newMasters = checkTypeMasters(state);
      assert.ok(!newMasters.includes('fairy'));
    });
  });

  describe('checkChainCompletion', () => {
    it('awards pokeballs for completed evolution chain', () => {
      const state = makeState({
        pokedex: {
          '387': { seen: true, caught: true, first_seen: '2026-01-01' }, // Turtwig
          '388': { seen: true, caught: true, first_seen: '2026-01-01' }, // Grotle
          '389': { seen: true, caught: true, first_seen: '2026-01-01' }, // Torterra
        },
      });
      const completions = checkChainCompletion(state);
      assert.ok(completions.chains >= 1);
      assert.ok((state.items.pokeball ?? 0) >= 3);
    });

    it('does not award for incomplete chain', () => {
      const state = makeState({
        pokedex: {
          '387': { seen: true, caught: true, first_seen: '2026-01-01' },
          '388': { seen: true, caught: true, first_seen: '2026-01-01' },
          // Missing 389 (Torterra)
        },
      });
      const completions = checkChainCompletion(state);
      assert.deepEqual(completions, { chains: 0, ballsAwarded: 0 });
    });

    it('is idempotent', () => {
      const state = makeState({
        pokedex: {
          '387': { seen: true, caught: true, first_seen: '2026-01-01' },
          '388': { seen: true, caught: true, first_seen: '2026-01-01' },
          '389': { seen: true, caught: true, first_seen: '2026-01-01' },
        },
      });
      checkChainCompletion(state);
      const balls = state.items.pokeball ?? 0;
      checkChainCompletion(state);
      assert.equal(state.items.pokeball, balls);
    });
  });

  describe('getTypeMasterXpMultiplier', () => {
    it('returns 1.0 with no mastered types', () => {
      const state = makeState();
      assert.equal(getTypeMasterXpMultiplier(state, ['fire'], ['water']), 1.0);
    });

    it('returns 1.2 when attacker type is mastered', () => {
      const state = makeState({ type_masters: ['fire'] });
      const mult = getTypeMasterXpMultiplier(state, ['fire'], ['water']);
      assert.equal(mult, 1.2);
    });

    it('returns 1.2 when defender type is mastered', () => {
      const state = makeState({ type_masters: ['water'] });
      const mult = getTypeMasterXpMultiplier(state, ['fire'], ['water']);
      assert.equal(mult, 1.2);
    });
  });

  describe('getTypeMasterProgress', () => {
    it('returns progress for all types', () => {
      const state = makeState();
      const progress = getTypeMasterProgress(state);
      assert.ok(progress.length > 0);
      for (const entry of progress) {
        assert.ok(typeof entry.type === 'string');
        assert.ok(typeof entry.caught === 'number');
        assert.ok(typeof entry.total === 'number');
        assert.ok(typeof entry.mastered === 'boolean');
      }
    });
  });

  describe('state defaults', () => {
    it('makeState includes M3 fields', () => {
      const state = makeState();
      assert.deepEqual(state.pokedex_milestones_claimed, []);
      assert.deepEqual(state.type_masters, []);
      assert.deepEqual(state.legendary_pool, []);
      assert.deepEqual(state.legendary_pending, []);
      assert.deepEqual(state.titles, []);
    });

    it('M3 fields can be overridden', () => {
      const state = makeState({
        pokedex_milestones_claimed: ['milestone_10'],
        type_masters: ['fire'],
        titles: ['pokedex_master'],
      });
      assert.deepEqual(state.pokedex_milestones_claimed, ['milestone_10']);
      assert.deepEqual(state.type_masters, ['fire']);
      assert.deepEqual(state.titles, ['pokedex_master']);
    });
  });
});
