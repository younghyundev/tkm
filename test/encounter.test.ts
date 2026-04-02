import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeState as _makeState, makeConfig as _makeConfig } from './helpers.js';
import { rollEncounter, selectWildPokemon, processEncounter, getMinWildLevel } from '../src/core/encounter.js';
import { formatBattleMessage } from '../src/core/battle.js';
import { initLocale } from '../src/i18n/index.js';

import type { State, Config } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const regionsDB = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'regions.json'), 'utf-8'));
const pokemonDB = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'pokemon.json'), 'utf-8'));

function makeState(overrides: Partial<State> = {}): State {
  return _makeState({
    pokemon: { '387': { id: 387, xp: 5000, level: 15, friendship: 0, ev: 0 } },
    unlocked: ['387'],
    ...overrides,
  });
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return _makeConfig({
    party: ['387'],
    ...overrides,
  });
}

initLocale('ko');

describe('encounter', () => {
  describe('rollEncounter', () => {
    it('returns boolean', () => {
      const state = makeState();
      const config = makeConfig();
      const result = rollEncounter(state, config);
      assert.equal(typeof result, 'boolean');
    });

    it('encounter rate is roughly 10-25% over 1000 rolls', () => {
      const state = makeState();
      const config = makeConfig();
      let hits = 0;
      for (let i = 0; i < 1000; i++) {
        if (rollEncounter(state, config)) hits++;
      }
      assert.ok(hits >= 50, `Too few encounters: ${hits}/1000`);
      assert.ok(hits <= 350, `Too many encounters: ${hits}/1000`);
    });
  });

  describe('selectWildPokemon', () => {
    it('returns pokemon from current region pool', () => {
      const state = makeState();
      const config = makeConfig({ current_region: '2' });
      const region = regionsDB.regions['2'];
      for (let i = 0; i < 50; i++) {
        const wild = selectWildPokemon(state, config);
        assert.ok(wild !== null);
        assert.ok(region.pokemon_pool.includes(wild!.name), `${wild!.name} not in region 2 pool`);
      }
    });

    it('level is at least regionMin and at least evoMin', () => {
      const state = makeState();
      const config = makeConfig({ current_region: '2' });
      const region = regionsDB.regions['2'];
      for (let i = 0; i < 50; i++) {
        const wild = selectWildPokemon(state, config);
        assert.ok(wild !== null);
        assert.ok(wild!.level >= region.level_range[0]);
        // evoMin may exceed regionMax for high-stage pokemon — that's intentional
        const evoMin = getMinWildLevel(wild!.name);
        assert.ok(wild!.level >= evoMin, `${wild!.name} level ${wild!.level} < evoMin ${evoMin}`);
      }
    });

    it('respects rarity weights (common should appear most)', () => {
      const state = makeState();
      const config = makeConfig({ current_region: '1' });
      const counts: Record<string, number> = {};
      for (let i = 0; i < 500; i++) {
        const wild = selectWildPokemon(state, config);
        if (wild) {
          const rarity = pokemonDB.pokemon[wild.name]?.rarity ?? 'unknown';
          counts[rarity] = (counts[rarity] || 0) + 1;
        }
      }
      const common = counts['common'] ?? 0;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      assert.ok(common / total > 0.3, `Common ratio too low: ${common}/${total}`);
    });
  });

  describe('getMinWildLevel', () => {
    it('stage 0 returns 1', () => {
      // 396 찌르꼬 is stage 0
      assert.equal(getMinWildLevel('396'), 1);
    });

    it('stage 1 returns pre-evo evolves_at', () => {
      // 397 찌르버드: stage 1, prev is 396 (evolves_at: 14)
      assert.equal(getMinWildLevel('397'), 14);
    });

    it('stage 2 returns stage-1 evolves_at', () => {
      // 398 찌르호크: stage 2, prev is 397 (evolves_at: 34)
      assert.equal(getMinWildLevel('398'), 34);
    });

    it('cross-gen evolution falls back to 1', () => {
      // 407 Roserade: stage 2, line=["406","407"] — line[1] is itself
      assert.equal(getMinWildLevel('407'), 1);
      // 424 Ambipom: stage 1, line=["424"] — line[0] is itself
      assert.equal(getMinWildLevel('424'), 1);
    });

    it('stage-1 pokemon never spawns below pre-evo evolves_at', () => {
      const state = makeState();
      const config = makeConfig({ current_region: '1' });
      for (let i = 0; i < 200; i++) {
        const wild = selectWildPokemon(state, config);
        if (!wild) continue;
        const evoMin = getMinWildLevel(wild.name);
        assert.ok(
          wild.level >= evoMin,
          `${wild.name} appeared at Lv.${wild.level} but evoMin is ${evoMin}`,
        );
      }
    });
  });

  describe('processEncounter (with battle)', () => {
    it('returns BattleResult with expected fields', () => {
      const state = makeState();
      const config = makeConfig();
      let result = null;
      for (let i = 0; i < 200; i++) {
        result = processEncounter(state, config);
        if (result) break;
      }
      assert.ok(result !== null, 'Should get at least one encounter in 200 tries');
      assert.equal(typeof result!.won, 'boolean');
      assert.equal(typeof result!.attacker, 'string');
      assert.equal(typeof result!.defender, 'string');
      assert.equal(typeof result!.xpReward, 'number');
    });

    it('catches new pokemon on victory', () => {
      const state = makeState();
      const config = makeConfig();
      let caught = false;
      for (let i = 0; i < 500; i++) {
        const result = processEncounter(state, config);
        if (result?.caught) {
          caught = true;
          assert.ok(state.unlocked.includes(result.defender));
          assert.ok(state.pokedex[result.defender]?.caught);
          break;
        }
      }
      assert.ok(caught, 'Should catch at least one pokemon in 500 attempts');
    });

    it('increments encounter_count and battle_count', () => {
      const state = makeState();
      const config = makeConfig();
      let encounters = 0;
      for (let i = 0; i < 200; i++) {
        if (processEncounter(state, config)) encounters++;
      }
      assert.equal(state.encounter_count, encounters);
      assert.equal(state.battle_count, encounters);
    });
  });

  describe('formatBattleMessage', () => {
    it('formats victory message', () => {
      const msg = formatBattleMessage({
        attacker: '387', defender: '396', defenderLevel: 5,
        winRate: 0.6, won: true, xpReward: 65, caught: true, typeMultiplier: 1.0,
      });
      assert.ok(msg.includes('찌르꼬'), `expected '찌르꼬' in: ${msg}`);
      assert.ok(msg.includes('승리'));
      assert.ok(msg.includes('포획'));
    });

    it('formats defeat message', () => {
      const msg = formatBattleMessage({
        attacker: '387', defender: '396', defenderLevel: 5,
        winRate: 0.3, won: false, xpReward: 16, caught: false, typeMultiplier: 1.0,
      });
      assert.ok(msg.includes('패배'));
    });
  });
});
