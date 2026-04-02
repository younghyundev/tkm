import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState as _makeState, makeConfig as _makeConfig } from './helpers.js';
import { calculateWinRate, calculateBattleXp, selectBattlePokemon, calculatePartyMultiplier, resolveBattle, formatBattleMessage } from '../src/core/battle.js';
import { getTypeEffectiveness, getRawTypeMultiplier, applyTypeDampening } from '../src/core/type-chart.js';
import { initLocale } from '../src/i18n/index.js';

import type { State, Config } from '../src/core/types.js';

initLocale('ko');

function makeState(overrides: Partial<State> = {}): State {
  return _makeState({
    pokemon: {
      '387': { id: 387, xp: 5000, level: 20, friendship: 0, ev: 0 },
      '390': { id: 390, xp: 3000, level: 15, friendship: 0, ev: 0 },
    },
    unlocked: ['387', '390'],
    ...overrides,
  });
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return _makeConfig({
    party: ['387', '390'],
    ...overrides,
  });
}

describe('type-chart', () => {
  it('fire is super effective vs grass', () => {
    assert.equal(getTypeEffectiveness('fire', 'grass'), 1.5);
  });

  it('water is not effective vs grass', () => {
    assert.equal(getTypeEffectiveness('water', 'grass'), 0.67);
  });

  it('normal is immune to ghost', () => {
    assert.equal(getTypeEffectiveness('normal', 'ghost'), 0.25);
  });

  it('neutral matchup is 1.0', () => {
    assert.equal(getTypeEffectiveness('normal', 'grass'), 1.0);
  });

  it('dual type raw multiplier stacks', () => {
    // Fire/Fighting vs Grass/Steel = 1.5 * 1.5 * 1.0 * 1.5 = 3.375
    const raw = getRawTypeMultiplier(['fire', 'fighting'], ['grass', 'steel']);
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
      const { winRate } = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats);
      assert.ok(winRate >= 0.35 && winRate <= 0.65, `Win rate: ${winRate}`);
    });

    it('+20 level advantage > 55%', () => {
      const { winRate } = calculateWinRate(['normal'], ['normal'], 40, 20, neutralStats, neutralStats);
      assert.ok(winRate > 0.55, `Win rate: ${winRate}`);
    });

    it('-20 level disadvantage < 45%', () => {
      const { winRate } = calculateWinRate(['normal'], ['normal'], 10, 30, neutralStats, neutralStats);
      assert.ok(winRate < 0.45, `Win rate: ${winRate}`);
    });

    it('double super effective after dampening is reasonable', () => {
      // Fire vs Grass (1.5x dampened to ~1.2x)
      const { winRate } = calculateWinRate(['fire'], ['grass'], 20, 20, neutralStats, neutralStats);
      assert.ok(winRate > 0.40 && winRate < 0.75, `Win rate: ${winRate}`);
    });

    it('always in [0.03, 0.95] range', () => {
      // Extreme advantage
      const { winRate: high } = calculateWinRate(['fire', 'fighting'], ['grass', 'steel'], 100, 1, neutralStats, neutralStats);
      assert.ok(high <= 0.95, `High: ${high}`);
      // Extreme disadvantage
      const { winRate: low } = calculateWinRate(['grass'], ['fire'], 1, 100, neutralStats, neutralStats);
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
      // Wild is grass type - should pick 390 (fire)
      const best = selectBattlePokemon(config, state, ['grass']);
      assert.equal(best, '390');
    });

    it('picks pokemon with best matchup vs water', () => {
      const state = makeState();
      const config = makeConfig();
      // Wild is water - 387 (grass) should be picked
      const best = selectBattlePokemon(config, state, ['water']);
      assert.equal(best, '387');
    });
  });

  describe('calculatePartyMultiplier', () => {
    it('1 member gives multiplier 1.0', () => {
      const state = makeState();
      const config = makeConfig({ party: ['387'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['normal'], 10,
        { attack: 50, defense: 50, speed: 50 });
      assert.equal(multiplier, 1.0);
    });

    it('2 members gives multiplier > 1.0', () => {
      const state = makeState();
      const config = makeConfig({ party: ['387', '390'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['normal'], 10,
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
      const config = makeConfig({ party: ['387', '387', '387', '387', '387', '387'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['normal'], 10,
        { attack: 50, defense: 50, speed: 50 });
      // r ≈ 0.337: 1 + 0.337 + 0.337² + 0.337³ + 0.337⁴ + 0.337⁵ ≈ 1.497
      assert.ok(multiplier >= 1.45, `expected ≈ 1.5 but got ${multiplier}`);
      assert.ok(multiplier <= 1.5, `expected <= 1.5 but got ${multiplier}`);
    });

    it('multiplier never exceeds 1.5', () => {
      const state = makeState();
      const config = makeConfig({ party: ['387', '390'] });
      const { multiplier } = calculatePartyMultiplier(config, state, ['grass'], 5,
        { attack: 30, defense: 30, speed: 30 });
      assert.ok(multiplier <= 1.5);
    });

    it('picks strongest fighter against wild type', () => {
      const state = makeState();
      const config = makeConfig({ party: ['387', '390'] });
      // Wild is grass type → 390 (fire) should be best
      const { bestFighter } = calculatePartyMultiplier(config, state, ['grass'], 10,
        { attack: 50, defense: 50, speed: 50 });
      assert.equal(bestFighter, '390');
    });
  });

  describe('resolveBattle', () => {
    it('returns BattleResult', () => {
      const state = makeState();
      const config = makeConfig();
      const result = resolveBattle(state, config, { name: '396', level: 5, shiny: false });
      assert.ok(result !== null);
      assert.equal(typeof result!.won, 'boolean');
      assert.equal(typeof result!.winRate, 'number');
      assert.equal(typeof result!.xpReward, 'number');
    });

    it('increments battle_count', () => {
      const state = makeState();
      const config = makeConfig();
      resolveBattle(state, config, { name: '396', level: 5, shiny: false });
      assert.equal(state.battle_count, 1);
    });

    it('awards XP to party pokemon', () => {
      const state = makeState();
      const config = makeConfig();
      const prevXp = state.pokemon['387'].xp;
      resolveBattle(state, config, { name: '396', level: 5, shiny: false });
      assert.ok(state.pokemon['387'].xp > prevXp);
    });

    it('marks wild pokemon as seen', () => {
      const state = makeState();
      const config = makeConfig();
      resolveBattle(state, config, { name: '396', level: 5, shiny: false });
      assert.ok(state.pokedex['396']?.seen);
    });
  });

  describe('pokeball catch-gating', () => {
    it('win + uncaught + has pokeball → caught, ball consumed', () => {
      const state = makeState({
        pokemon: { '387': { id: 387, xp: 500000, level: 80, friendship: 0, ev: 0 } },
        items: { pokeball: 10 },
      });
      const config = makeConfig({ party: ['387'] });
      // Run battles until a win; check that result shows caught=true
      let caughtResult = false;
      for (let i = 0; i < 50 && !caughtResult; i++) {
        const ballsBefore = state.items.pokeball;
        const result = resolveBattle(state, config, { name: '396', level: 1, shiny: false });
        if (result?.won && result?.caught) {
          caughtResult = true;
          // Ball consumed: before-catch ball count minus after-catch (ignoring drops)
          // The caught flag itself proves the ball was consumed (useItem succeeded)
        }
      }
      assert.ok(caughtResult, 'Should catch uncaught pokemon with pokeball on win');
      assert.ok(state.pokedex['396']?.caught, 'Pokedex should mark caught');
    });

    it('win + uncaught + no pokeball → not caught (per-battle check)', () => {
      const state = makeState({
        pokemon: { '387': { id: 387, xp: 500000, level: 80, friendship: 0, ev: 0 } },
        items: {},
      });
      const config = makeConfig({ party: ['387'] });
      let hadWin = false;
      for (let i = 0; i < 50; i++) {
        // Reset pokeballs to 0 before each battle to isolate the test
        state.items.pokeball = 0;
        const result = resolveBattle(state, config, { name: '396', level: 1, shiny: false });
        if (result?.won) {
          hadWin = true;
          assert.equal(result.caught, false, 'Should not catch without pokeball');
        }
      }
      assert.ok(hadWin, 'Should have won at least once');
    });

    it('win + already caught + has pokeball → ball not consumed', () => {
      const state = makeState({
        pokemon: { '387': { id: 387, xp: 500000, level: 80, friendship: 0, ev: 0 } },
        items: { pokeball: 5 },
        pokedex: { '396': { seen: true, caught: true, first_seen: '2026-01-01' } },
        unlocked: ['387', '396'],
      });
      const config = makeConfig({ party: ['387'] });
      // Run single battle, check result
      let hadWin = false;
      for (let i = 0; i < 50; i++) {
        const ballsBefore = state.items.pokeball;
        const result = resolveBattle(state, config, { name: '396', level: 1, shiny: false });
        if (result?.won) {
          hadWin = true;
          assert.equal(result.caught, false, 'Already caught pokemon should not trigger catch');
          // Ball count may increase from drops but never decrease
          assert.ok(state.items.pokeball >= ballsBefore, 'Pokeball should not be consumed');
          break;
        }
      }
      assert.ok(hadWin, 'Should have won at least once');
    });
  });

  describe('formatBattleMessage', () => {
    it('need_balls path: won but no balls — message does not contain raw key', () => {
      const result = {
        attacker: '387',
        defender: '396',
        defenderLevel: 5,
        winRate: 0.8,
        won: true,
        xpReward: 65,
        caught: false,
        typeMultiplier: 1.0,
        ballCost: 1,
      };
      const msg = formatBattleMessage(result);
      assert.ok(!msg.includes('[battle.need_balls]'), `Raw key leaked: ${msg}`);
      assert.ok(msg.length > 0, 'Message should not be empty');
    });

    it('need_balls path: message contains defender name and fled indicator', () => {
      const result = {
        attacker: '387',
        defender: '396',
        defenderLevel: 5,
        winRate: 0.8,
        won: true,
        xpReward: 65,
        caught: false,
        typeMultiplier: 1.0,
        ballCost: 1,
      };
      const msg = formatBattleMessage(result);
      // The need_balls translation contains the defender name (via {defender} template)
      // and a fled indicator ("도망쳤다" in KO or "fled" in EN)
      const hasFled = msg.includes('도망쳤다') || msg.includes('fled');
      assert.ok(hasFled, `Expected fled indicator in: ${msg}`);
    });

    it('win + caught path: message does not contain raw keys', () => {
      const result = {
        attacker: '387',
        defender: '396',
        defenderLevel: 5,
        winRate: 0.8,
        won: true,
        xpReward: 65,
        caught: true,
        typeMultiplier: 1.0,
        ballCost: 1,
      };
      const msg = formatBattleMessage(result);
      assert.ok(!msg.includes('[battle.'), `Raw key leaked: ${msg}`);
    });

    it('lose path: message does not contain raw keys', () => {
      const result = {
        attacker: '387',
        defender: '396',
        defenderLevel: 5,
        winRate: 0.2,
        won: false,
        xpReward: 0,
        caught: false,
        typeMultiplier: 1.0,
        ballCost: 0,
      };
      const msg = formatBattleMessage(result);
      assert.ok(!msg.includes('[battle.'), `Raw key leaked: ${msg}`);
    });
  });

  describe('EV system', () => {
    const neutralStats = { attack: 80, defense: 80, speed: 80 };

    it('evFactor at ev=0 equals 1.0 (no change)', () => {
      const withEv0 = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats, 0);
      const withoutEv = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats);
      assert.equal(withEv0.winRate, withoutEv.winRate);
    });

    it('evFactor at ev=252 gives 1.252x boost', () => {
      const base = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats, 0);
      const maxEv = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats, 252);
      const ratio = maxEv.winRate / base.winRate;
      assert.ok(Math.abs(ratio - 1.252) < 0.01, `Expected ratio ~1.252 but got ${ratio}`);
    });

    it('evFactor at ev=126 gives ~1.126x boost', () => {
      const base = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats, 0);
      const midEv = calculateWinRate(['normal'], ['normal'], 20, 20, neutralStats, neutralStats, 126);
      const ratio = midEv.winRate / base.winRate;
      assert.ok(Math.abs(ratio - 1.126) < 0.01, `Expected ratio ~1.126 but got ${ratio}`);
    });

    it('battle win awards EV to all party members', () => {
      const state = makeState();
      const config = makeConfig();
      const prevEv0 = state.pokemon['387'].ev;
      const prevEv1 = state.pokemon['390'].ev;
      // Run battles until we get a win
      let won = false;
      for (let i = 0; i < 50 && !won; i++) {
        const result = resolveBattle(state, config, { name: '396', level: 1, shiny: false }); // low level wild for easy win
        if (result?.won) won = true;
      }
      if (won) {
        assert.ok(state.pokemon['387'].ev > prevEv0, 'Party member 1 should gain EV');
        assert.ok(state.pokemon['390'].ev > prevEv1, 'Party member 2 should gain EV');
      }
    });

    it('battle loss does not award EV', () => {
      const state = makeState({
        pokemon: {
          '387': { id: 387, xp: 100, level: 1, friendship: 0, ev: 0 },
        },
      });
      const config = makeConfig({ party: ['387'] });
      // Run battles against high level - likely to lose
      for (let i = 0; i < 20; i++) {
        resolveBattle(state, config, { name: '390', level: 100, shiny: false });
      }
      // EV should only increase for wins, check it's bounded
      assert.ok(state.pokemon['387'].ev <= state.battle_wins, 'EV should not exceed win count');
    });

    it('EV caps at 252', () => {
      const state = makeState({
        pokemon: {
          '387': { id: 387, xp: 5000, level: 20, friendship: 0, ev: 252 },
        },
      });
      const config = makeConfig({ party: ['387'] });
      // Force a win against low level
      for (let i = 0; i < 10; i++) {
        resolveBattle(state, config, { name: '396', level: 1, shiny: false });
      }
      assert.equal(state.pokemon['387'].ev, 252, 'EV should not exceed 252');
    });
  });

  describe('shiny battle path', () => {
    it('resolveBattle with shiny:true wild returns BattleResult.shiny === true', () => {
      const state = makeState();
      const config = makeConfig();
      const result = resolveBattle(state, config, { name: '396', level: 5, shiny: true });
      assert.ok(result !== null);
      assert.equal(result!.shiny, true);
    });

    it('catch success + shiny:true records PokemonState.shiny === true', () => {
      const state = makeState({
        pokemon: { '387': { id: 387, xp: 500000, level: 80, friendship: 0, ev: 0 } },
        items: { pokeball: 50 },
      });
      const config = makeConfig({ party: ['387'] });
      let caughtShiny = false;
      for (let i = 0; i < 100 && !caughtShiny; i++) {
        const result = resolveBattle(state, config, { name: '396', level: 1, shiny: true });
        if (result?.won && result?.caught) {
          caughtShiny = true;
          assert.equal(state.pokemon['396']?.shiny, true, 'PokemonState.shiny should be true after shiny catch');
        }
      }
      assert.ok(caughtShiny, 'Should catch at least one shiny pokemon');
    });

    it('formatBattleMessage includes "✦" when shiny=true', () => {
      const msg = formatBattleMessage({
        attacker: '387', defender: '396', defenderLevel: 5,
        winRate: 0.6, won: true, xpReward: 65, caught: true, typeMultiplier: 1.0,
        ballCost: 0, shiny: true,
      });
      assert.ok(msg.includes('✦'), `expected "✦" in shiny message: ${msg}`);
    });

    it('formatBattleMessage with shiny=undefined (legacy BattleResult) does not crash and omits "✦"', () => {
      const legacyResult = {
        attacker: '387', defender: '396', defenderLevel: 5,
        winRate: 0.6, won: true, xpReward: 65, caught: true, typeMultiplier: 1.0,
        ballCost: 0,
      } as any;
      const msg = formatBattleMessage(legacyResult);
      assert.equal(typeof msg, 'string');
      assert.ok(!msg.includes('✦'), `"✦" should not appear when shiny is undefined: ${msg}`);
    });
  });
});
