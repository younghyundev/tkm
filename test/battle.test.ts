import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { State, Config } from '../src/core/types.js';
import { calculateWinRate, calculateBattleXp, selectBattlePokemon, resolveBattle } from '../src/core/battle.js';
import { getTypeEffectiveness, getRawTypeMultiplier, applyTypeDampening } from '../src/core/type-chart.js';

function makeState(overrides: Partial<State> = {}): State {
  return {
    pokemon: {
      '모부기': { id: 387, xp: 5000, level: 20 },
      '불꽃숭이': { id: 390, xp: 3000, level: 15 },
    },
    unlocked: ['모부기', '불꽃숭이'], achievements: {},
    total_tokens_consumed: 0, session_count: 0, error_count: 0,
    permission_count: 0, evolution_count: 0, last_session_id: null,
    xp_bonus_multiplier: 1.0, last_session_tokens: {}, pokedex: {},
    encounter_count: 0, catch_count: 0, battle_count: 0,
    battle_wins: 0, battle_losses: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    tokens_per_xp: 10000, party: ['모부기', '불꽃숭이'], starter_chosen: true,
    volume: 0.5, sprite_enabled: true, cry_enabled: true,
    xp_formula: 'medium_fast', xp_bonus_multiplier: 1.0,
    max_party_size: 6, peon_ping_integration: false,
    peon_ping_port: 19998, current_region: '쌍둥이잎 마을',
    ...overrides,
  };
}

describe('type-chart', () => {
  it('fire is super effective vs grass', () => {
    assert.equal(getTypeEffectiveness('불꽃', '풀'), 1.5);
  });

  it('water is not effective vs grass', () => {
    assert.equal(getTypeEffectiveness('물', '풀'), 0.67);
  });

  it('normal is immune to ghost', () => {
    assert.equal(getTypeEffectiveness('노말', '고스트'), 0.25);
  });

  it('neutral matchup is 1.0', () => {
    assert.equal(getTypeEffectiveness('노말', '풀'), 1.0);
  });

  it('dual type raw multiplier stacks', () => {
    // Fire/Fighting vs Grass/Steel = 1.5 * 1.5 * 1.0 * 1.5 = 3.375
    const raw = getRawTypeMultiplier(['불꽃', '격투'], ['풀', '강철']);
    assert.ok(raw > 3.0 && raw < 4.0, `Raw multiplier: ${raw}`);
  });

  it('dampening compresses extreme multipliers', () => {
    // Formula: 1 + (raw - 1) * 0.4
    assert.equal(applyTypeDampening(1.0), 1.0); // neutral unchanged
    assert.ok(Math.abs(applyTypeDampening(5.06) - 2.624) < 0.1); // compressed
    assert.ok(Math.abs(applyTypeDampening(0.45) - 0.78) < 0.05); // not-effective compressed
  });
});

describe('battle', () => {
  describe('calculateWinRate', () => {
    const neutralStats = { attack: 80, defense: 80, speed: 80 };

    it('equal level neutral types ≈ 50%', () => {
      const { winRate } = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats);
      assert.ok(winRate >= 0.35 && winRate <= 0.65, `Win rate: ${winRate}`);
    });

    it('+20 level advantage > 55%', () => {
      const { winRate } = calculateWinRate(['노말'], ['노말'], 40, 20, neutralStats, neutralStats);
      assert.ok(winRate > 0.55, `Win rate: ${winRate}`);
    });

    it('-20 level disadvantage < 45%', () => {
      const { winRate } = calculateWinRate(['노말'], ['노말'], 10, 30, neutralStats, neutralStats);
      assert.ok(winRate < 0.45, `Win rate: ${winRate}`);
    });

    it('double super effective after dampening is reasonable', () => {
      // Fire vs Grass (1.5x dampened to ~1.2x)
      const { winRate } = calculateWinRate(['불꽃'], ['풀'], 20, 20, neutralStats, neutralStats);
      assert.ok(winRate > 0.40 && winRate < 0.75, `Win rate: ${winRate}`);
    });

    it('always in [0.03, 0.95] range', () => {
      // Extreme advantage
      const { winRate: high } = calculateWinRate(['불꽃', '격투'], ['풀', '강철'], 100, 1, neutralStats, neutralStats);
      assert.ok(high <= 0.95, `High: ${high}`);
      // Extreme disadvantage
      const { winRate: low } = calculateWinRate(['풀'], ['불꽃'], 1, 100, neutralStats, neutralStats);
      assert.ok(low >= 0.03, `Low: ${low}`);
    });
  });

  describe('calculateBattleXp', () => {
    it('scales with wild level', () => {
      const xp10 = calculateBattleXp(10, 'common', false, 1.0, true);
      const xp50 = calculateBattleXp(50, 'common', false, 1.0, true);
      assert.ok(xp50 > xp10);
    });

    it('rarity bonus applies', () => {
      const common = calculateBattleXp(20, 'common', false, 1.0, true);
      const legendary = calculateBattleXp(20, 'legendary', false, 1.0, true);
      assert.ok(legendary > common);
    });

    it('defeat gives no XP', () => {
      const defeat = calculateBattleXp(20, 'common', false, 1.0, false);
      assert.equal(defeat, 0);
    });

    it('type disadvantage bonus', () => {
      const normal = calculateBattleXp(20, 'common', false, 1.0, true);
      const bonus = calculateBattleXp(20, 'common', true, 1.0, true);
      assert.ok(bonus > normal);
    });
  });

  describe('selectBattlePokemon', () => {
    it('picks pokemon with type advantage', () => {
      const state = makeState();
      const config = makeConfig();
      // Wild is grass type - should pick 불꽃숭이 (fire)
      const best = selectBattlePokemon(config, state, ['풀']);
      assert.equal(best, '불꽃숭이');
    });

    it('picks pokemon with best matchup vs water', () => {
      const state = makeState();
      const config = makeConfig();
      // Wild is water - 모부기 (grass) should be picked
      const best = selectBattlePokemon(config, state, ['물']);
      assert.equal(best, '모부기');
    });
  });

  describe('resolveBattle', () => {
    it('returns BattleResult', () => {
      const state = makeState();
      const config = makeConfig();
      const result = resolveBattle(state, config, '찌르꼬', 5);
      assert.ok(result !== null);
      assert.equal(typeof result!.won, 'boolean');
      assert.equal(typeof result!.winRate, 'number');
      assert.equal(typeof result!.xpReward, 'number');
    });

    it('increments battle_count', () => {
      const state = makeState();
      const config = makeConfig();
      resolveBattle(state, config, '찌르꼬', 5);
      assert.equal(state.battle_count, 1);
    });

    it('awards XP to party pokemon', () => {
      const state = makeState();
      const config = makeConfig();
      const prevXp = state.pokemon['모부기'].xp;
      resolveBattle(state, config, '찌르꼬', 5);
      assert.ok(state.pokemon['모부기'].xp > prevXp);
    });

    it('marks wild pokemon as seen', () => {
      const state = makeState();
      const config = makeConfig();
      resolveBattle(state, config, '찌르꼬', 5);
      assert.ok(state.pokedex['찌르꼬']?.seen);
    });
  });
});
