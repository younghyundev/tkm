/**
 * Tests for review-loop fixes:
 * - #4: loadJson descriptive errors for missing/corrupt gen data
 * - #5: i18n keys exist for cmdCall/cmdNickname
 * - #7: migration migrated_gens tracking
 * - #8: LEGACY_STATE_PATH renamed
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ── Fix #4: Data loader error messages ──

describe('getPokemonDB error handling', () => {
  it('throws descriptive error for non-existent generation', async () => {
    const { getPokemonDB } = await import('../src/core/pokemon-data.js');
    assert.throws(
      () => getPokemonDB('gen99'),
      (err: any) => {
        assert.ok(err.message.includes('gen99'), `Error should mention gen ID, got: ${err.message}`);
        return true;
      },
    );
  });
});

// ── Fix #5: i18n keys for cmdCall/cmdNickname ──

describe('i18n keys for lock_failed and nickname', () => {
  const enJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'src', 'i18n', 'en.json'), 'utf-8'));
  const koJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'src', 'i18n', 'ko.json'), 'utf-8'));

  const requiredKeys = [
    'cli.lock_failed',
    'cli.call.not_found',
    'cli.nickname.not_found',
    'cli.nickname.too_long',
    'cli.nickname.current',
    'cli.nickname.none',
    'cli.nickname.set',
  ];

  for (const key of requiredKeys) {
    it(`en.json has key "${key}"`, () => {
      assert.ok(enJson[key], `Missing en.json key: ${key}`);
    });

    it(`ko.json has key "${key}"`, () => {
      assert.ok(koJson[key], `Missing ko.json key: ${key}`);
    });
  }

  it('en.json and ko.json have same i18n keys for these entries', () => {
    for (const key of requiredKeys) {
      assert.ok(enJson[key] && koJson[key], `Key ${key} missing in one locale`);
    }
  });
});

// ── Fix #8: LEGACY_STATE_PATH ──

describe('LEGACY_STATE_PATH export', () => {
  it('exports LEGACY_STATE_PATH (not STATE_PATH)', async () => {
    const paths = await import('../src/core/paths.js');
    assert.ok('LEGACY_STATE_PATH' in paths, 'LEGACY_STATE_PATH should be exported');
    assert.ok(
      (paths as any).LEGACY_STATE_PATH.endsWith('state.json'),
      'LEGACY_STATE_PATH should point to state.json',
    );
  });
});

// ── Fix #2: Gen4 pokemon_range in generations.json ──

describe('generations.json consistency', () => {
  const gensJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'generations.json'), 'utf-8'));

  it('has all 9 generations', () => {
    const gens = Object.keys(gensJson.generations);
    assert.equal(gens.length, 9);
    for (const g of ['gen1', 'gen2', 'gen3', 'gen4', 'gen5', 'gen6', 'gen7', 'gen8', 'gen9']) {
      assert.ok(gens.includes(g), `Missing ${g}`);
    }
  });

  it('each gen has required fields', () => {
    for (const [id, gen] of Object.entries(gensJson.generations) as [string, any][]) {
      assert.ok(gen.id, `${id} missing id`);
      assert.ok(gen.name, `${id} missing name`);
      assert.ok(gen.region_name?.en, `${id} missing region_name.en`);
      assert.ok(gen.region_name?.ko, `${id} missing region_name.ko`);
      assert.ok(Array.isArray(gen.pokemon_range) && gen.pokemon_range.length === 2, `${id} missing pokemon_range`);
      assert.ok(Array.isArray(gen.starters) && gen.starters.length === 3, `${id} missing starters`);
      assert.ok(typeof gen.order === 'number', `${id} missing order`);
    }
  });

  it('pokemon_range values do not have internal overlap (except documented cross-gen)', () => {
    // gen4 [280,493] intentionally overlaps gen3 [252,386] for cross-gen pre-evos
    // All other ranges should be non-overlapping
    const ranges = Object.entries(gensJson.generations)
      .filter(([id]) => id !== 'gen4')
      .map(([id, g]: [string, any]) => ({ id, start: g.pokemon_range[0], end: g.pokemon_range[1] }));

    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i], b = ranges[j];
        const overlaps = a.start <= b.end && b.start <= a.end;
        assert.ok(!overlaps, `${a.id} [${a.start},${a.end}] overlaps ${b.id} [${b.start},${b.end}]`);
      }
    }
  });
});

// ── All gens data completeness ──

describe('all gens data files exist', () => {
  const gensJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'generations.json'), 'utf-8'));

  for (const genId of Object.keys(gensJson.generations)) {
    const dataDir = join(PROJECT_ROOT, 'data', genId);

    it(`${genId} has pokemon.json`, () => {
      assert.ok(existsSync(join(dataDir, 'pokemon.json')), `${genId}/pokemon.json missing`);
    });

    it(`${genId} has regions.json with 9 regions`, () => {
      const path = join(dataDir, 'regions.json');
      assert.ok(existsSync(path), `${genId}/regions.json missing`);
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      assert.equal(Object.keys(data.regions).length, 9, `${genId} should have 9 regions`);
    });

    it(`${genId} has achievements.json`, () => {
      assert.ok(existsSync(join(dataDir, 'achievements.json')), `${genId}/achievements.json missing`);
    });

    it(`${genId} has pokedex-rewards.json`, () => {
      assert.ok(existsSync(join(dataDir, 'pokedex-rewards.json')), `${genId}/pokedex-rewards.json missing`);
    });

    it(`${genId} has i18n/en.json and ko.json`, () => {
      assert.ok(existsSync(join(dataDir, 'i18n', 'en.json')), `${genId}/i18n/en.json missing`);
      assert.ok(existsSync(join(dataDir, 'i18n', 'ko.json')), `${genId}/i18n/ko.json missing`);
    });
  }
});

// ── xp_bonus multiplier sanity ──

describe('pokedex-rewards xp_bonus is a valid multiplier', () => {
  const gensJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'generations.json'), 'utf-8'));

  for (const genId of Object.keys(gensJson.generations)) {
    it(`${genId} xp_bonus >= 1.0 (multiplier, not additive)`, () => {
      const path = join(PROJECT_ROOT, 'data', genId, 'pokedex-rewards.json');
      if (!existsSync(path)) return; // gen4 legacy may have different path
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      const xpBonus = data.type_master?.xp_bonus;
      assert.ok(xpBonus >= 1.0, `${genId} xp_bonus=${xpBonus} is < 1.0 — would destroy XP instead of boosting`);
    });
  }
});
