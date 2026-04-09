import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setActiveGenerationCache } from '../src/core/paths.js';
import { _resetForTesting, getCommonAchievementsDB, getAchievementsDB } from '../src/core/pokemon-data.js';
import { checkCommonAchievements } from '../src/core/achievements.js';
import { isCommonAchievement, recalculateCommonEffects } from '../src/core/migration.js';
import { initLocale } from '../src/i18n/index.js';
import type { CommonState } from '../src/core/types.js';
import { makeConfig } from './helpers.js';

// Pin active generation to gen4
setActiveGenerationCache('gen4');
initLocale('ko');

function makeCommonState(overrides: Partial<CommonState> = {}): CommonState {
  return {
    achievements: {},
    encounter_rate_bonus: 0,
    xp_bonus_multiplier: 0,
    items: {},
    max_party_size_bonus: 0,
    session_count: 0,
    total_tokens_consumed: 0,
    battle_count: 0,
    battle_wins: 0,
    catch_count: 0,
    evolution_count: 0,
    error_count: 0,
    permission_count: 0,
    ...overrides,
  };
}

describe('common achievement loading', () => {
  before(() => {
    _resetForTesting();
    setActiveGenerationCache('gen4');
  });

  it('getCommonAchievementsDB returns achievements from data/common/achievements.json', () => {
    const db = getCommonAchievementsDB();
    assert.ok(Array.isArray(db.achievements), 'achievements should be an array');
    assert.ok(db.achievements.length > 0, 'should have at least one common achievement');
  });

  it('common achievements count is 21', () => {
    const db = getCommonAchievementsDB();
    assert.equal(db.achievements.length, 21);
  });

  it('getAchievementsDB returns gen-specific only (not merged with common)', () => {
    const genDB = getAchievementsDB('gen4');

    // Gen-specific DB should have exactly 14 gen4 achievements
    assert.equal(genDB.achievements.length, 14,
      `gen4 should have 14 achievements, got ${genDB.achievements.length}`);
  });
});

describe('no ID overlap (except intentional)', () => {
  it('common IDs that overlap with gen4 are only the intentional ones', () => {
    const commonDB = getCommonAchievementsDB();
    const mergedDB = getAchievementsDB('gen4');

    const commonIds = new Set(commonDB.achievements.map(a => a.id));
    // gen4-specific IDs = those in merged that are NOT in common
    // overlapping = those in common that also appear in gen4 raw
    // We find overlapping by checking which common IDs were overwritten in gen4
    // The merged map uses gen4 wins on collision, so overlapping IDs are those
    // where both common and gen4 define the same ID.
    // We detect overlap: common IDs that also exist in merged (they always do),
    // but the gen4 raw file defines them too.
    // Simpler: just list the gen4 raw IDs and intersect with common IDs.
    const gen4RawIds = [
      'first_session',
      'first_error',
      'first_evolution',
      'hundred_k_tokens',
      'five_hundred_k_tokens',
      'hundred_sessions',
      'one_million_tokens',
      'two_million_tokens',
      'five_million_tokens',
      'pokedex_100',
    ];

    const overlapping = gen4RawIds.filter(id => commonIds.has(id));
    const intentionalOverlaps = ['hundred_k_tokens', 'five_hundred_k_tokens', 'hundred_sessions', 'one_million_tokens', 'two_million_tokens', 'five_million_tokens'];

    assert.deepEqual(
      overlapping.sort(),
      intentionalOverlaps.sort(),
      `unexpected overlaps: ${overlapping.filter(id => !intentionalOverlaps.includes(id)).join(', ')}`,
    );
  });
});

describe('encounter_rate_bonus immediate application', () => {
  it('first_battle_win triggers and increases encounter_rate_bonus by 0.02', () => {
    const commonState = makeCommonState({ battle_wins: 1 });
    const config = makeConfig();
    // makeState is a gen-State factory; checkCommonAchievements only needs a State for
    // potential future use — pass a minimal stub
    const stubState = { achievements: {}, unlocked: [], pokemon: {} } as any;

    checkCommonAchievements(commonState, config, stubState);

    assert.ok(commonState.achievements['first_battle_win'], 'first_battle_win should be marked achieved');
    assert.ok(
      Math.abs(commonState.encounter_rate_bonus - 0.02) < 1e-9,
      `encounter_rate_bonus should be 0.02, got ${commonState.encounter_rate_bonus}`,
    );
  });
});

describe('migration — isCommonAchievement', () => {
  it('first_battle_win is a common achievement', () => {
    assert.equal(isCommonAchievement('first_battle_win'), true);
  });

  it('first_session is not a common achievement (gen-specific)', () => {
    assert.equal(isCommonAchievement('first_session'), false);
  });

  it('nonexistent ID returns false', () => {
    assert.equal(isCommonAchievement('nonexistent_achievement_xyz'), false);
  });
});

describe('recalculateCommonEffects', () => {
  it('sums encounter_rate_bonus and xp_bonus_multiplier from achieved achievements', () => {
    // ten_sessions: xp_bonus 0.2 + encounter_rate_bonus 0.02
    // first_battle_win: encounter_rate_bonus 0.02
    const commonState = makeCommonState({
      achievements: {
        ten_sessions: true,
        first_battle_win: true,
      },
    });

    recalculateCommonEffects(commonState);

    assert.ok(
      Math.abs(commonState.xp_bonus_multiplier - 0.2) < 1e-9,
      `xp_bonus_multiplier should be 0.2, got ${commonState.xp_bonus_multiplier}`,
    );
    assert.ok(
      Math.abs(commonState.encounter_rate_bonus - 0.04) < 1e-9,
      `encounter_rate_bonus should be 0.04, got ${commonState.encounter_rate_bonus}`,
    );
  });

  it('recalculates to zero when no achievements are marked', () => {
    const commonState = makeCommonState({
      achievements: {},
      encounter_rate_bonus: 0.5,
      xp_bonus_multiplier: 0.3,
    });

    recalculateCommonEffects(commonState);

    assert.equal(commonState.encounter_rate_bonus, 0);
    assert.equal(commonState.xp_bonus_multiplier, 0);
  });

  it('sums correctly for multiple xp_bonus achievements', () => {
    // ten_sessions: xp_bonus 0.2, evolution_10: xp_bonus 0.1
    const commonState = makeCommonState({
      achievements: {
        ten_sessions: true,
        evolution_10: true,
      },
    });

    recalculateCommonEffects(commonState);

    assert.ok(
      Math.abs(commonState.xp_bonus_multiplier - 0.3) < 1e-9,
      `xp_bonus_multiplier should be 0.3, got ${commonState.xp_bonus_multiplier}`,
    );
  });
});
