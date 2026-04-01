import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState as _makeState, makeConfig as _makeConfig } from './helpers.js';
import { calculateWinRate, calculateBattleXp, selectBattlePokemon, calculatePartyMultiplier, resolveBattle } from '../src/core/battle.js';
import { getTypeEffectiveness, getRawTypeMultiplier, applyTypeDampening } from '../src/core/type-chart.js';

import type { State, Config } from '../src/core/types.js';

function makeState(overrides: Partial<State> = {}): State {
  return _makeState({
    pokemon: {
      '모부기': { id: 387, xp: 5000, level: 20, friendship: 0, ev: 0 },
      '불꽃숭이': { id: 390, xp: 3000, level: 15, friendship: 0, ev: 0 },
    },
    unlocked: ['모부기', '불꽃숭이'],
    ...overrides,
  });
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return _makeConfig({
    party: ['모부기', '불꽃숭이'],
    ...overrides,
  });
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

  describe('calculatePartyMultiplier', () => {
    it('1 member gives multiplier 1.0', () => {
      const state = makeState();
      const config = makeConfig({ party: ['모부기'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['노말'], 10,
        { attack: 50, defense: 50, speed: 50 });
      assert.equal(multiplier, 1.0);
    });

    it('2 members gives multiplier > 1.0', () => {
      const state = makeState();
      const config = makeConfig({ party: ['모부기', '불꽃숭이'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['노말'], 10,
        { attack: 50, defense: 50, speed: 50 });
      assert.ok(multiplier > 1.0, `expected > 1.0 but got ${multiplier}`);
      assert.ok(multiplier <= 1.5, `expected <= 1.5 but got ${multiplier}`);
    });

    it('6 equal members gives multiplier ≈ 1.5', () => {
      const state = makeState({
        pokemon: {
          'A': { id: 1, xp: 5000, level: 20, friendship: 0, ev: 0 },
          'B': { id: 2, xp: 5000, level: 20, friendship: 0, ev: 0 },
          'C': { id: 3, xp: 5000, level: 20, friendship: 0, ev: 0 },
          'D': { id: 4, xp: 5000, level: 20, friendship: 0, ev: 0 },
          'E': { id: 5, xp: 5000, level: 20, friendship: 0, ev: 0 },
          'F': { id: 6, xp: 5000, level: 20, friendship: 0, ev: 0 },
        },
      });
      // Use same pokemon name repeated to simulate equal power
      // Since all have same level, the scores will be identical
      const config = makeConfig({ party: ['모부기', '모부기', '모부기', '모부기', '모부기', '모부기'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['노말'], 10,
        { attack: 50, defense: 50, speed: 50 });
      // r ≈ 0.337: 1 + 0.337 + 0.337² + 0.337³ + 0.337⁴ + 0.337⁵ ≈ 1.497
      assert.ok(multiplier >= 1.45, `expected ≈ 1.5 but got ${multiplier}`);
      assert.ok(multiplier <= 1.5, `expected <= 1.5 but got ${multiplier}`);
    });

    it('multiplier never exceeds 1.5', () => {
      const state = makeState();
      const config = makeConfig({ party: ['모부기', '불꽃숭이'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['풀'], 5,
        { attack: 30, defense: 30, speed: 30 });
      assert.ok(multiplier <= 1.5);
    });

    it('picks strongest fighter against wild type', () => {
      const state = makeState();
      const config = makeConfig({ party: ['모부기', '불꽃숭이'] });
      // Wild is grass type → 불꽃숭이 (fire) should be best
      const { bestFighter } = calculatePartyMultiplier(config, state, ['풀'], 10,
        { attack: 50, defense: 50, speed: 50 });
      assert.equal(bestFighter, '불꽃숭이');
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

  describe('EV system', () => {
    const neutralStats = { attack: 80, defense: 80, speed: 80 };

    it('evFactor at ev=0 equals 1.0 (no change)', () => {
      const withEv0 = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats, 0);
      const withoutEv = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats);
      assert.equal(withEv0.winRate, withoutEv.winRate);
    });

    it('evFactor at ev=252 gives 1.252x boost', () => {
      const base = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats, 0);
      const maxEv = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats, 252);
      const ratio = maxEv.winRate / base.winRate;
      assert.ok(Math.abs(ratio - 1.252) < 0.01, `Expected ratio ~1.252 but got ${ratio}`);
    });

    it('evFactor at ev=126 gives ~1.126x boost', () => {
      const base = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats, 0);
      const midEv = calculateWinRate(['노말'], ['노말'], 20, 20, neutralStats, neutralStats, 126);
      const ratio = midEv.winRate / base.winRate;
      assert.ok(Math.abs(ratio - 1.126) < 0.01, `Expected ratio ~1.126 but got ${ratio}`);
    });

    it('battle win awards EV to all party members', () => {
      const state = makeState();
      const config = makeConfig();
      const prevEv0 = state.pokemon['모부기'].ev;
      const prevEv1 = state.pokemon['불꽃숭이'].ev;
      // Run battles until we get a win
      let won = false;
      for (let i = 0; i < 50 && !won; i++) {
        const result = resolveBattle(state, config, '찌르꼬', 1); // low level wild for easy win
        if (result?.won) won = true;
      }
      if (won) {
        assert.ok(state.pokemon['모부기'].ev > prevEv0, 'Party member 1 should gain EV');
        assert.ok(state.pokemon['불꽃숭이'].ev > prevEv1, 'Party member 2 should gain EV');
      }
    });

    it('battle loss does not award EV', () => {
      const state = makeState({
        pokemon: {
          '모부기': { id: 387, xp: 100, level: 1, friendship: 0, ev: 0 },
        },
      });
      const config = makeConfig({ party: ['모부기'] });
      // Run battles against high level - likely to lose
      for (let i = 0; i < 20; i++) {
        resolveBattle(state, config, '불꽃숭이', 100);
      }
      // EV should only increase for wins, check it's bounded
      assert.ok(state.pokemon['모부기'].ev <= state.battle_wins, 'EV should not exceed win count');
    });

    it('EV caps at 252', () => {
      const state = makeState({
        pokemon: {
          '모부기': { id: 387, xp: 5000, level: 20, friendship: 0, ev: 252 },
        },
      });
      const config = makeConfig({ party: ['모부기'] });
      // Force a win against low level
      for (let i = 0; i < 10; i++) {
        resolveBattle(state, config, '찌르꼬', 1);
      }
      assert.equal(state.pokemon['모부기'].ev, 252, 'EV should not exceed 252');
    });
  });
});
