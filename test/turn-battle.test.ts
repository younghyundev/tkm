import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initLocale } from '../src/i18n/index.js';
import {
  calculateHp,
  calculateStat,
  createBattlePokemon,
  calculateDamage,
  getEffectivenessMessage,
  checkAccuracy,
  createBattleState,
  getActivePokemon,
  hasAlivePokemon,
  resolveTurn,
} from '../src/core/turn-battle.js';
import { addVolatileStatus } from '../src/core/volatile-status.js';
import { selectAiMove } from '../src/core/gym-ai.js';
import { createStatStages } from '../src/core/stat-stages.js';
import type { BattlePokemon, BattleMove, MoveData, BattleState, StatusCondition } from '../src/core/types.js';

initLocale('ko');

// ── Test helpers ──

function makeMoveData(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: 1,
    name: 'tackle',
    nameKo: '몸통박치기',
    nameEn: 'Tackle',
    type: 'normal',
    category: 'physical',
    power: 40,
    accuracy: 100,
    pp: 35,
    ...overrides,
  };
}

function makeFireMove(overrides: Partial<MoveData> = {}): MoveData {
  return makeMoveData({
    id: 2,
    name: 'ember',
    nameKo: '불꽃세례',
    nameEn: 'Ember',
    type: 'fire',
    category: 'special',
    power: 40,
    accuracy: 100,
    pp: 25,
    ...overrides,
  });
}

function makeWaterMove(overrides: Partial<MoveData> = {}): MoveData {
  return makeMoveData({
    id: 3,
    name: 'water_gun',
    nameKo: '물대포',
    nameEn: 'Water Gun',
    type: 'water',
    category: 'special',
    power: 40,
    accuracy: 100,
    pp: 25,
    ...overrides,
  });
}

function makeTestPokemon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    id: 1,
    name: '1',
    displayName: 'Attacker',
    types: ['normal'],
    level: 50,
    maxHp: 120,
    currentHp: 120,
    attack: 60,
    defense: 50,
    spAttack: 55,
    spDefense: 50,
    speed: 70,
    moves: [{ data: makeMoveData(), currentPp: 35 }],
    fainted: false,
    statusCondition: null,
    toxicCounter: 0,
    sleepCounter: 0,
    volatileStatuses: [],
    statStages: createStatStages(),
    ...overrides,
  };
}

// ── Tests ──

describe('calculateHp', () => {
  it('calculates HP for base 45 level 50', () => {
    assert.equal(calculateHp(45, 50), 105);
  });

  it('calculates HP for base 100 level 100', () => {
    // floor((2 * 100 * 100) / 100) + 100 + 10 = 200 + 100 + 10 = 310
    assert.equal(calculateHp(100, 100), 310);
  });
});

describe('calculateStat', () => {
  it('calculates stat for base 55 level 50', () => {
    assert.equal(calculateStat(55, 50), 60);
  });

  it('calculates stat for base 100 level 100', () => {
    // floor((2 * 100 * 100) / 100) + 5 = 200 + 5 = 205
    assert.equal(calculateStat(100, 100), 205);
  });
});

describe('createBattlePokemon', () => {
  it('creates a BattlePokemon with correct stats', () => {
    const moves: MoveData[] = [makeMoveData()];
    const bp = createBattlePokemon(
      {
        id: 4,
        types: ['fire'],
        level: 50,
        baseStats: { hp: 39, attack: 52, defense: 43, speed: 65 },
        displayName: 'Charmander',
      },
      moves,
    );
    assert.equal(bp.maxHp, calculateHp(39, 50));
    assert.equal(bp.currentHp, bp.maxHp);
    assert.equal(bp.attack, calculateStat(52, 50));
    assert.equal(bp.defense, calculateStat(43, 50));
    // sp_attack/sp_defense fallback to attack/defense
    assert.equal(bp.spAttack, calculateStat(52, 50));
    assert.equal(bp.spDefense, calculateStat(43, 50));
    assert.equal(bp.speed, calculateStat(65, 50));
    assert.equal(bp.moves.length, 1);
    assert.equal(bp.moves[0].currentPp, 35);
    assert.equal(bp.fainted, false);
    assert.equal(bp.displayName, 'Charmander');
  });

  it('uses sp_attack/sp_defense when provided', () => {
    const bp = createBattlePokemon(
      {
        id: 4,
        types: ['fire'],
        level: 50,
        baseStats: { hp: 39, attack: 52, defense: 43, speed: 65, sp_attack: 80, sp_defense: 70 },
      },
      [makeMoveData()],
    );
    assert.equal(bp.spAttack, calculateStat(80, 50));
    assert.equal(bp.spDefense, calculateStat(70, 50));
  });

  it('initializes status counters to zero', () => {
    const bp = createBattlePokemon(
      {
        id: 4,
        types: ['fire'],
        level: 50,
        baseStats: { hp: 39, attack: 52, defense: 43, speed: 65 },
        displayName: 'Charmander',
      },
      [makeMoveData()],
    );

    assert.equal(bp.statusCondition, null);
    assert.equal(bp.toxicCounter, 0);
    assert.equal(bp.sleepCounter, 0);
    assert.deepEqual((bp as any).volatileStatuses, []);
    assert.deepEqual(bp.statStages, createStatStages());
  });
});

describe('calculateDamage', () => {
  it('returns 0 for status moves (power 0)', () => {
    const attacker = makeTestPokemon();
    const defender = makeTestPokemon({ displayName: 'Defender' });
    const statusMove: BattleMove = {
      data: makeMoveData({ power: 0 }),
      currentPp: 10,
    };
    assert.equal(calculateDamage(attacker, defender, statusMove), 0);
  });

  it('STAB bonus produces higher damage than non-STAB', () => {
    const attacker = makeTestPokemon({ types: ['fire'], attack: 100, spAttack: 100 });
    const defender = makeTestPokemon({ types: ['normal'], defense: 50, spDefense: 50 });
    const fireMove: BattleMove = { data: makeFireMove(), currentPp: 25 };
    const normalMove: BattleMove = {
      data: makeMoveData({ type: 'water', category: 'special', power: 40 }),
      currentPp: 25,
    };

    // Run many trials to compare average damage
    let stabTotal = 0;
    let nonStabTotal = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      stabTotal += calculateDamage(attacker, defender, fireMove);
      nonStabTotal += calculateDamage(attacker, defender, normalMove);
    }
    assert.ok(
      stabTotal > nonStabTotal,
      `STAB avg ${stabTotal / trials} should exceed non-STAB avg ${nonStabTotal / trials}`,
    );
  });

  it('type effectiveness 2x (water vs fire)', () => {
    const attacker = makeTestPokemon({ types: ['water'], spAttack: 80 });
    const defender = makeTestPokemon({ types: ['fire'], spDefense: 50 });
    const waterMove: BattleMove = { data: makeWaterMove(), currentPp: 25 };

    // Non-effective baseline: same move against normal type
    const neutralDef = makeTestPokemon({ types: ['normal'], spDefense: 50 });

    let seTotal = 0;
    let neutralTotal = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      seTotal += calculateDamage(attacker, defender, waterMove);
      neutralTotal += calculateDamage(attacker, neutralDef, waterMove);
    }
    // Super effective should be roughly 2x neutral
    const ratio = seTotal / neutralTotal;
    assert.ok(ratio > 1.8 && ratio < 2.2, `SE/neutral ratio ${ratio} should be ~2.0`);
  });

  it('always returns at least 1 damage for powered moves', () => {
    const attacker = makeTestPokemon({ attack: 1 });
    const defender = makeTestPokemon({ defense: 999 });
    const move: BattleMove = { data: makeMoveData({ power: 10 }), currentPp: 10 };
    const dmg = calculateDamage(attacker, defender, move);
    assert.ok(dmg >= 1);
  });
});

describe('getEffectivenessMessage', () => {
  it('returns effect_super for water vs fire', () => {
    assert.equal(getEffectivenessMessage('water', ['fire']), 'effect_super');
  });

  it('returns effect_not_very for water vs grass', () => {
    assert.equal(getEffectivenessMessage('water', ['grass']), 'effect_not_very');
  });

  it('returns effect_immune for normal vs ghost', () => {
    assert.equal(getEffectivenessMessage('normal', ['ghost']), 'effect_immune');
  });

  it('returns null for neutral matchup', () => {
    assert.equal(getEffectivenessMessage('normal', ['normal']), null);
  });
});

describe('checkAccuracy', () => {
  it('returns true for always-hit moves (accuracy null)', () => {
    const attacker = makeTestPokemon();
    const defender = makeTestPokemon({ displayName: 'Defender' });
    const move = makeMoveData({ accuracy: null });
    // Should always return true
    for (let i = 0; i < 50; i++) {
      assert.equal(checkAccuracy(attacker, defender, move), true);
    }
  });

  it('returns boolean for normal accuracy moves', () => {
    const attacker = makeTestPokemon();
    const defender = makeTestPokemon({ displayName: 'Defender' });
    const move = makeMoveData({ accuracy: 50 });
    const result = checkAccuracy(attacker, defender, move);
    assert.equal(typeof result, 'boolean');
  });

  it('accuracy stages improve hit chance and evasion stages reduce it', () => {
    const attacker = makeTestPokemon();
    const defender = makeTestPokemon({ displayName: 'Defender' });
    const move = makeMoveData({ accuracy: 50 });
    const originalRandom = Math.random;

    try {
      Math.random = () => 0.7;
      assert.equal(checkAccuracy(attacker, defender, move), false);

      attacker.statStages.accuracy = 2;
      assert.equal(checkAccuracy(attacker, defender, move), true);

      attacker.statStages.accuracy = 0;
      defender.statStages.evasion = 2;
      assert.equal(checkAccuracy(attacker, defender, move), false);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('createBattleState', () => {
  it('creates a valid initial battle state', () => {
    const p1 = makeTestPokemon({ displayName: 'Player1' });
    const o1 = makeTestPokemon({ displayName: 'Opp1' });
    const state = createBattleState([p1], [o1]);
    assert.equal(state.player.pokemon.length, 1);
    assert.equal(state.opponent.pokemon.length, 1);
    assert.equal(state.player.activeIndex, 0);
    assert.equal(state.opponent.activeIndex, 0);
    assert.equal(state.turn, 0);
    assert.equal(state.phase, 'select_action');
    assert.equal(state.winner, null);
  });
});

describe('getActivePokemon / hasAlivePokemon', () => {
  it('getActivePokemon returns the pokemon at activeIndex', () => {
    const p1 = makeTestPokemon({ displayName: 'A' });
    const p2 = makeTestPokemon({ displayName: 'B' });
    const team = { pokemon: [p1, p2], activeIndex: 1 };
    assert.equal(getActivePokemon(team).displayName, 'B');
  });

  it('hasAlivePokemon returns true when at least one alive', () => {
    const p1 = makeTestPokemon({ fainted: true });
    const p2 = makeTestPokemon({ fainted: false });
    assert.equal(hasAlivePokemon({ pokemon: [p1, p2], activeIndex: 0 }), true);
  });

  it('hasAlivePokemon returns false when all fainted', () => {
    const p1 = makeTestPokemon({ fainted: true });
    assert.equal(hasAlivePokemon({ pokemon: [p1], activeIndex: 0 }), false);
  });
});

describe('resolveTurn', () => {
  let state: BattleState;

  beforeEach(() => {
    const playerPoke = makeTestPokemon({
      displayName: '피카츄',
      types: ['electric'],
      speed: 90,
      maxHp: 200,
      currentHp: 200,
      moves: [
        { data: makeMoveData({ nameKo: '전광석화', type: 'normal', power: 40 }), currentPp: 30 },
        { data: makeMoveData({ nameKo: '10만볼트', type: 'electric', power: 90, category: 'special' }), currentPp: 15 },
      ],
    });
    const opponentPoke = makeTestPokemon({
      displayName: '파이리',
      types: ['fire'],
      speed: 60,
      maxHp: 150,
      currentHp: 150,
      moves: [
        { data: makeFireMove({ nameKo: '불꽃세례' }), currentPp: 25 },
      ],
    });
    state = createBattleState([playerPoke], [opponentPoke]);
  });

  it('faster pokemon attacks first', () => {
    // Player speed 90 > opponent speed 60 → player attacks first
    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );
    // First message should be from player (피카츄)
    assert.ok(
      result.messages[0].includes('피카츄'),
      `First message "${result.messages[0]}" should be from faster pokemon 피카츄`,
    );
  });

  it('switch has priority over move', () => {
    // Add a second player pokemon for switching
    const backup = makeTestPokemon({
      displayName: '이상해씨',
      types: ['grass'],
      speed: 40,
    });
    state.player.pokemon.push(backup);

    const result = resolveTurn(
      state,
      { type: 'switch', pokemonIndex: 1 },
      { type: 'move', moveIndex: 0 },
    );
    // Switch message should come before attack message
    const switchIdx = result.messages.findIndex((m) => m.includes('이상해씨'));
    const attackIdx = result.messages.findIndex((m) => m.includes('파이리'));
    assert.ok(switchIdx >= 0, 'Should have switch message');
    assert.ok(attackIdx >= 0, 'Should have attack message');
    assert.ok(switchIdx < attackIdx, 'Switch should happen before move');
  });

  it('fainted pokemon triggers phase change to fainted_switch', () => {
    // Give player a backup pokemon; set active HP low to guarantee faint
    const backup = makeTestPokemon({ displayName: '꼬부기', types: ['water'] });
    state.player.pokemon.push(backup);
    // Set player active to 1 HP so opponent's attack faints them
    getActivePokemon(state.player).currentHp = 1;

    // Opponent goes first to faint the player by giving them higher speed
    getActivePokemon(state.opponent).speed = 999;

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.ok(result.playerFainted, 'Player pokemon should have fainted');
    assert.equal(state.phase, 'fainted_switch');
  });

  it('surrender ends battle with winner = opponent', () => {
    const result = resolveTurn(
      state,
      { type: 'surrender' },
      { type: 'move', moveIndex: 0 },
    );
    assert.equal(state.phase, 'battle_end');
    assert.equal(state.winner, 'opponent');
    assert.ok(result.messages.some((m) => m.includes('항복')));
  });

  it('struggle when all moves have 0 PP', () => {
    // Drain all PP
    const playerPoke = getActivePokemon(state.player);
    for (const move of playerPoke.moves) {
      move.currentPp = 0;
    }

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.ok(
      result.messages.some((m) => m.includes('발버둥')),
      'Should contain struggle message',
    );
  });

  it('opponent fainted with no more pokemon = player wins', () => {
    // Set opponent to 1 HP
    getActivePokemon(state.opponent).currentHp = 1;

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.ok(result.opponentFainted, 'Opponent should have fainted');
    assert.equal(state.phase, 'battle_end');
    assert.equal(state.winner, 'player');
  });

  it('opponent fainted with backup stays select_action', () => {
    // Add backup opponent
    const backup = makeTestPokemon({ displayName: '꼬부기', types: ['water'] });
    state.opponent.pokemon.push(backup);
    // Set active opponent to 1 HP
    getActivePokemon(state.opponent).currentHp = 1;

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.ok(result.opponentFainted, 'Opponent active should faint');
    assert.equal(state.phase, 'select_action');
    assert.equal(state.winner, null);
  });

  it('PP decrements on move use', () => {
    const playerPoke = getActivePokemon(state.player);
    const ppBefore = playerPoke.moves[0].currentPp;

    resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(playerPoke.moves[0].currentPp, ppBefore - 1);
  });

  it('healing moves restore floor(maxHp * fraction) without dealing damage', () => {
    const player = makeTestPokemon({
      displayName: '힐러',
      speed: 999,
      maxHp: 120,
      currentHp: 55,
      moves: [{
        data: makeMoveData({
          name: 'recover',
          nameKo: '회복',
          power: 0,
          moveEffect: { type: 'heal', fraction: 0.5 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', maxHp: 80, currentHp: 80 });
    const healState = createBattleState([player], [opp]);

    resolveTurn(
      healState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(player.currentHp, 115);
    assert.equal(opp.currentHp, 80);
  });

  it('healing moves fail at full HP', () => {
    const player = makeTestPokemon({
      displayName: '힐러',
      speed: 999,
      maxHp: 120,
      currentHp: 120,
      moves: [{
        data: makeMoveData({
          name: 'recover',
          nameKo: '회복',
          power: 0,
          moveEffect: { type: 'heal', fraction: 0.5 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', maxHp: 80, currentHp: 80 });
    const healState = createBattleState([player], [opp]);

    const result = resolveTurn(
      healState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(player.currentHp, 120);
    assert.equal(opp.currentHp, 80);
    assert.ok(result.messages.some((m) => m.includes('가득')));
  });

  it('Rest heals to full and applies deterministic sleep', () => {
    const player = makeTestPokemon({
      displayName: '잠꾸러기',
      speed: 999,
      maxHp: 120,
      currentHp: 45,
      statusCondition: 'burn' as StatusCondition,
      moves: [{
        data: makeMoveData({
          id: 156,
          name: 'rest',
          nameKo: '잠자기',
          power: 0,
          moveEffect: { type: 'rest' },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp' });
    const restState = createBattleState([player], [opp]);

    resolveTurn(
      restState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(player.currentHp, 120);
    assert.equal(player.statusCondition, 'sleep');
    assert.equal(player.sleepCounter, 2);
  });

  it('Rest cures status at full HP but fails when the user is already healthy and full', () => {
    const statusedFullHpUser = makeTestPokemon({
      displayName: '실패잠자기',
      speed: 999,
      maxHp: 120,
      currentHp: 120,
      statusCondition: 'burn' as StatusCondition,
      moves: [{
        data: makeMoveData({
          id: 156,
          name: 'rest',
          nameKo: '잠자기',
          power: 0,
          moveEffect: { type: 'rest' },
        }),
        currentPp: 10,
      }],
    });
    const statusedRestState = createBattleState(
      [statusedFullHpUser],
      [makeTestPokemon({ displayName: 'Opp' })],
    );

    const successResult = resolveTurn(
      statusedRestState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(statusedFullHpUser.currentHp, 120);
    assert.equal(statusedFullHpUser.statusCondition, 'sleep');
    assert.equal(statusedFullHpUser.sleepCounter, 2);
    assert.ok(successResult.messages.some((m) => m.includes('잠들')));

    const healthyFullHpUser = makeTestPokemon({
      displayName: '성공잠자기',
      speed: 999,
      maxHp: 120,
      currentHp: 120,
      statusCondition: null,
      moves: [{
        data: makeMoveData({
          id: 156,
          name: 'rest',
          nameKo: '잠자기',
          power: 0,
          moveEffect: { type: 'rest' },
        }),
        currentPp: 10,
      }],
    });
    const healthyFullHpState = createBattleState(
      [healthyFullHpUser],
      [makeTestPokemon({ displayName: 'Opp' })],
    );

    const failedResult = resolveTurn(
      healthyFullHpState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(healthyFullHpUser.statusCondition, null);
    assert.equal(healthyFullHpUser.sleepCounter, 0);
    assert.ok(failedResult.messages.some((m) => m.includes('가득')));
  });

  it('recoil damage uses max(1, floor(actual damage * fraction))', () => {
    const player = makeTestPokemon({
      displayName: '반동러',
      speed: 999,
      maxHp: 120,
      currentHp: 120,
      attack: 95,
      moves: [{
        data: makeMoveData({
          name: 'take-down',
          nameKo: '돌진',
          power: 90,
          moveEffect: { type: 'recoil', fraction: 0.25 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({
      displayName: 'Opp',
      maxHp: 140,
      currentHp: 140,
      defense: 55,
    });
    const recoilState = createBattleState([player], [opp]);

    resolveTurn(
      recoilState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    const damageDealt = 140 - opp.currentHp;
    const expectedRecoil = Math.max(1, Math.floor(damageDealt * 0.25));
    assert.equal(player.currentHp, 120 - expectedRecoil);
  });

  it('recoil can faint the user', () => {
    const player = makeTestPokemon({
      displayName: '유리대포',
      speed: 999,
      maxHp: 120,
      currentHp: 1,
      attack: 95,
      moves: [{
        data: makeMoveData({
          name: 'double-edge',
          nameKo: '몸통박치기',
          power: 90,
          moveEffect: { type: 'recoil', fraction: 0.25 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', maxHp: 140, currentHp: 140 });
    const recoilState = createBattleState([player], [opp]);

    resolveTurn(
      recoilState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(player.currentHp, 0);
    assert.equal(player.fainted, true);
  });

  it('recoil still happens if the defender faints', () => {
    const player = makeTestPokemon({
      displayName: '반동러',
      speed: 999,
      maxHp: 120,
      currentHp: 120,
      attack: 95,
      moves: [{
        data: makeMoveData({
          name: 'take-down',
          nameKo: '돌진',
          power: 90,
          moveEffect: { type: 'recoil', fraction: 0.25 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', currentHp: 1, maxHp: 140 });
    const recoilState = createBattleState([player], [opp]);

    resolveTurn(
      recoilState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(opp.fainted, true);
    assert.equal(player.currentHp, 119);
  });

  it('drain heals max(1, floor(actual damage * fraction))', () => {
    const player = makeTestPokemon({
      displayName: '흡수러',
      speed: 999,
      maxHp: 120,
      currentHp: 40,
      spAttack: 95,
      moves: [{
        data: makeMoveData({
          name: 'mega-drain',
          nameKo: '메가드레인',
          type: 'grass',
          category: 'special',
          power: 75,
          moveEffect: { type: 'drain', fraction: 0.5 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({
      displayName: 'Opp',
      types: ['water'],
      maxHp: 140,
      currentHp: 140,
      spDefense: 55,
    });
    const drainState = createBattleState([player], [opp]);

    resolveTurn(
      drainState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    const damageDealt = 140 - opp.currentHp;
    const expectedHeal = Math.max(1, Math.floor(damageDealt * 0.5));
    assert.equal(player.currentHp, Math.min(120, 40 + expectedHeal));
  });

  it('drain healing is capped at max HP', () => {
    const player = makeTestPokemon({
      displayName: '흡수러',
      speed: 999,
      maxHp: 120,
      currentHp: 110,
      spAttack: 95,
      moves: [{
        data: makeMoveData({
          name: 'mega-drain',
          nameKo: '메가드레인',
          type: 'grass',
          category: 'special',
          power: 75,
          moveEffect: { type: 'drain', fraction: 0.5 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({
      displayName: 'Opp',
      types: ['water'],
      maxHp: 140,
      currentHp: 140,
      spDefense: 55,
    });
    const drainState = createBattleState([player], [opp]);

    resolveTurn(
      drainState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(player.currentHp, 120);
  });

  it('drain does not heal when the move deals 0 damage', () => {
    const player = makeTestPokemon({
      displayName: '흡수러',
      speed: 999,
      maxHp: 120,
      currentHp: 60,
      moves: [{
        data: makeMoveData({
          name: 'drain-punch',
          nameKo: '드레인펀치',
          type: 'normal',
          power: 75,
          moveEffect: { type: 'drain', fraction: 0.5 },
        }),
        currentPp: 10,
      }],
    });
    const opp = makeTestPokemon({
      displayName: 'Opp',
      types: ['ghost'],
      maxHp: 140,
      currentHp: 140,
    });
    const drainState = createBattleState([player], [opp]);

    resolveTurn(
      drainState,
      { type: 'move', moveIndex: 0 },
      { type: 'switch', pokemonIndex: 0 },
    );

    assert.equal(player.currentHp, 60);
    assert.equal(opp.currentHp, 140);
  });

  it('turn counter increments', () => {
    assert.equal(state.turn, 0);
    resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );
    assert.equal(state.turn, 1);
  });

  it('invalid moveIndex does not crash (triggers struggle)', () => {
    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 99 },
      { type: 'move', moveIndex: 0 },
    );
    // Should not throw; player uses struggle due to invalid index
    assert.ok(
      result.messages.some((m) => m.includes('발버둥')),
      'Invalid moveIndex should trigger struggle',
    );
  });

  it('invalid switchIndex does not crash', () => {
    const result = resolveTurn(
      state,
      { type: 'switch', pokemonIndex: -1 },
      { type: 'move', moveIndex: 0 },
    );
    // Should not throw; invalid switch is silently skipped
    assert.ok(Array.isArray(result.messages));
  });

  it('type-immune debuff move does not apply stat changes to defender', () => {
    // Regression for v3b R3 HIGH: growl into a Ghost target was logging
    // immunity but still dropping the defender's attack stage.
    const growlMove: BattleMove = {
      data: {
        ...makeMoveData({ type: 'normal', category: 'physical', power: 0, accuracy: 100 }),
        statChanges: [{ target: 'opponent', stat: 'attack', stages: -1, chance: 100 }],
      } as any,
      currentPp: 40,
    };
    const player = makeTestPokemon({
      displayName: 'Growler',
      speed: 999,
      moves: [growlMove],
    });
    const ghostDefender = makeTestPokemon({
      displayName: 'Ghost',
      types: ['ghost'],
      speed: 1,
    });
    const ghostState = createBattleState([player], [ghostDefender]);
    resolveTurn(
      ghostState,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );
    assert.equal(
      ghostDefender.statStages.attack,
      0,
      'Ghost defender should not have attack stage dropped by Normal-type debuff',
    );
  });

  it('type-immune debuff with <100 accuracy reports immunity, not miss', () => {
    // Regression for v3b R4: Screech (85 acc, normal-type, opponent debuff)
    // into Ghost should report immunity even when the accuracy roll would
    // have failed. Previously the accuracy gate ran first and emitted "miss".
    const screechMove: BattleMove = {
      data: {
        ...makeMoveData({ type: 'normal', category: 'physical', power: 0, accuracy: 85 }),
        statChanges: [{ target: 'opponent', stat: 'defense', stages: -2, chance: 100 }],
      } as any,
      currentPp: 40,
    };
    const player = makeTestPokemon({
      displayName: 'Screecher',
      speed: 999,
      moves: [screechMove],
    });
    const ghostDefender = makeTestPokemon({
      displayName: 'Ghost',
      types: ['ghost'],
      speed: 1,
    });
    const screechState = createBattleState([player], [ghostDefender]);
    const origRandom = Math.random;
    try {
      // Force a "miss" roll: 0.9 * 100 = 90, 90 < 85 is false → miss
      Math.random = () => 0.9;
      const result = resolveTurn(
        screechState,
        { type: 'move', moveIndex: 0 },
        { type: 'move', moveIndex: 0 },
      );
      assert.equal(ghostDefender.statStages.defense, 0, 'No debuff applied');
      assert.ok(
        result.messages.some((m) => m.includes('효과가 없') || m.toLowerCase().includes('no effect')),
        `Should report immunity, not miss. Messages: ${JSON.stringify(result.messages)}`,
      );
      assert.ok(
        !result.messages.some((m) => m.includes('빗나갔') || m.toLowerCase().includes('miss')),
        `Should NOT report miss when target is type-immune`,
      );
    } finally {
      Math.random = origRandom;
    }
  });

  it('type-immune debuff still applies self-buff component if present', () => {
    // Defensive: a hypothetical move that buffs self AND debuffs opponent.
    // The opponent debuff should be blocked by type immunity, but the
    // self-buff should still land because immunity does not affect self.
    const dualMove: BattleMove = {
      data: {
        ...makeMoveData({ type: 'normal', category: 'physical', power: 0, accuracy: 100 }),
        statChanges: [
          { target: 'self', stat: 'attack', stages: 1, chance: 100 },
          { target: 'opponent', stat: 'defense', stages: -1, chance: 100 },
        ],
      } as any,
      currentPp: 10,
    };
    const player = makeTestPokemon({
      displayName: 'Dual',
      speed: 999,
      moves: [dualMove],
    });
    const ghostDefender = makeTestPokemon({
      displayName: 'Ghost',
      types: ['ghost'],
      speed: 1,
    });
    const dualState = createBattleState([player], [ghostDefender]);
    resolveTurn(
      dualState,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );
    assert.equal(player.statStages.attack, 1, 'Self-buff should still apply');
    assert.equal(ghostDefender.statStages.defense, 0, 'Opponent debuff should be blocked');
  });

  it('same-slot switch does NOT reset stat stages (no-op cleanse exploit)', () => {
    // Regression: a "switch" action targeting the already-active Pokemon must
    // not act as a free, priority cleanse for stat-stage debuffs. The bug
    // would let a debuffed mon erase its own stages by issuing a no-op switch.
    const player = getActivePokemon(state.player);
    player.statStages.attack = -3;
    player.statStages.defense = -2;

    const result = resolveTurn(
      state,
      { type: 'switch', pokemonIndex: state.player.activeIndex },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(player.statStages.attack, -3, 'attack stage should remain unchanged');
    assert.equal(player.statStages.defense, -2, 'defense stage should remain unchanged');
    assert.ok(
      !result.messages.some((m) => m.includes('교체') || m.toLowerCase().includes('switch')),
      'No switch message should be emitted for a no-op switch',
    );
  });
});

describe('calculateDamage edge cases', () => {
  it('zero defense stat produces finite damage', () => {
    const attacker = makeTestPokemon({ attack: 60 });
    const defender = makeTestPokemon({ defense: 0 });
    const move: BattleMove = { data: makeMoveData({ power: 40 }), currentPp: 10 };
    const dmg = calculateDamage(attacker, defender, move);
    assert.ok(Number.isFinite(dmg), `Damage should be finite, got ${dmg}`);
    assert.ok(dmg >= 1, `Damage should be at least 1, got ${dmg}`);
  });

  it('immune type matchup deals exactly 0 damage', () => {
    const attacker = makeTestPokemon({ types: ['normal'], attack: 100 });
    const defender = makeTestPokemon({ types: ['ghost'], defense: 50 });
    const move: BattleMove = { data: makeMoveData({ type: 'normal', power: 40 }), currentPp: 10 };
    const dmg = calculateDamage(attacker, defender, move);
    assert.equal(dmg, 0, `Immune matchup should deal 0 damage, got ${dmg}`);
  });

  it('damage increases with positive attack stages', () => {
    const attacker = makeTestPokemon({ attack: 100 });
    const defender = makeTestPokemon({ defense: 60, displayName: 'Defender' });
    const move: BattleMove = { data: makeMoveData({ power: 60 }), currentPp: 10 };
    const originalRandom = Math.random;

    try {
      Math.random = () => 0;
      const neutralDamage = calculateDamage(attacker, defender, move);
      attacker.statStages.attack = 2;
      const boostedDamage = calculateDamage(attacker, defender, move);
      assert.ok(
        boostedDamage > neutralDamage,
        `Expected +2 attack stages to increase damage (${neutralDamage} -> ${boostedDamage})`,
      );
    } finally {
      Math.random = originalRandom;
    }
  });

  it('damage increases when the defender has negative defense stages', () => {
    const attacker = makeTestPokemon({ attack: 100 });
    const defender = makeTestPokemon({ defense: 80, displayName: 'Defender' });
    const move: BattleMove = { data: makeMoveData({ power: 60 }), currentPp: 10 };
    const originalRandom = Math.random;

    try {
      Math.random = () => 0;
      const neutralDamage = calculateDamage(attacker, defender, move);
      defender.statStages.defense = -2;
      const droppedDefenseDamage = calculateDamage(attacker, defender, move);
      assert.ok(
        droppedDefenseDamage > neutralDamage,
        `Expected -2 defense stages to increase damage (${neutralDamage} -> ${droppedDefenseDamage})`,
      );
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('resolveTurn with status effects', () => {
  it('paralyzed pokemon has reduced effective speed in turn order', () => {
    const player = makeTestPokemon({ displayName: 'Fast', types: ['normal'], speed: 110, statusCondition: null, toxicCounter: 0 });
    const opponent = makeTestPokemon({ displayName: 'Slow', types: ['normal'], speed: 200, statusCondition: 'paralysis' as StatusCondition, toxicCounter: 0 });
    const state = createBattleState([player], [opponent]);
    const result = resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    // Opponent effective speed = 200 * 0.5 = 100 < 110, player goes first
    assert.ok(result.messages[0].includes('Fast'), `Player should act first, got: ${result.messages[0]}`);
  });

  it('speed stages can flip turn order', () => {
    const player = makeTestPokemon({ displayName: 'Boosted', speed: 80 });
    player.statStages.speed = 2;
    const opponent = makeTestPokemon({ displayName: 'Base', speed: 100 });
    const state = createBattleState([player], [opponent]);

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.ok(
      result.messages[0].includes('Boosted'),
      `Expected boosted speed stages to flip turn order, got ${result.messages[0]}`,
    );
  });

  it('burn halves physical damage', () => {
    const player = makeTestPokemon({ displayName: 'Burned', types: ['normal'], attack: 100, statusCondition: null, toxicCounter: 0 });
    const defender = makeTestPokemon({ displayName: 'Def', types: ['normal'], defense: 50, statusCondition: null, toxicCounter: 0 });
    const move: BattleMove = { data: makeMoveData({ power: 80, category: 'physical' }), currentPp: 10 };

    let normalTotal = 0;
    for (let i = 0; i < 200; i++) normalTotal += calculateDamage(player, defender, move);

    player.statusCondition = 'burn';
    let burnedTotal = 0;
    for (let i = 0; i < 200; i++) burnedTotal += calculateDamage(player, defender, move);

    const ratio = burnedTotal / normalTotal;
    assert.ok(ratio > 0.4 && ratio < 0.6, `Burn ratio should be ~0.5, got ${ratio}`);
  });

  it('end-of-turn poison damage applied after moves', () => {
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0 });
    const opp = makeTestPokemon({ displayName: 'O', maxHp: 160, currentHp: 160, statusCondition: 'poison' as StatusCondition, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    // Poison damage = floor(160/8) = 20, plus move damage
    assert.ok(opp.currentHp < 160 - 20, `Should take move + poison damage`);
  });

  it('pokemon can faint from end-of-turn poison', () => {
    const player = makeTestPokemon({ displayName: 'P', statusCondition: null, toxicCounter: 0, moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', maxHp: 160, currentHp: 1, statusCondition: 'poison' as StatusCondition, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(opp.fainted, true);
    assert.equal(opp.currentHp, 0);
  });

  it('secondary effect applies status on hit', () => {
    const effectMove = makeMoveData({ type: 'fire', category: 'special', power: 40 });
    (effectMove as any).effect = { type: 'burn', chance: 100 };
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: effectMove, currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', types: ['water'], statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(opp.statusCondition, 'burn');
  });

  it('status buff moves apply to the user', () => {
    const buffMove = makeMoveData({
      name: 'swords-dance',
      nameKo: '칼춤',
      power: 0,
      statChanges: [{ target: 'self', stat: 'attack', stages: 2, chance: 100 }],
    });
    const player = makeTestPokemon({
      displayName: 'P',
      speed: 999,
      moves: [{ data: buffMove, currentPp: 10 }],
    });
    const opp = makeTestPokemon({ displayName: 'O' });
    const state = createBattleState([player], [opp]);

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(player.statStages.attack, 2);
  });

  it('damaging moves can apply post-hit secondary stat drops', () => {
    const debuffMove = makeMoveData({
      name: 'crunch',
      nameKo: '깨물어부수기',
      power: 80,
      statChanges: [{ target: 'opponent', stat: 'defense', stages: -1, chance: 100 }],
    });
    const player = makeTestPokemon({
      displayName: 'P',
      speed: 999,
      attack: 100,
      moves: [{ data: debuffMove, currentPp: 10 }],
    });
    const opp = makeTestPokemon({ displayName: 'O', defense: 60 });
    const state = createBattleState([player], [opp]);

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(opp.statStages.defense, -1);
  });

  it('confusion self-hit happens before accuracy check', () => {
    const haymaker = makeMoveData({
      name: 'haymaker',
      nameKo: '헤이메이커',
      power: 120,
      accuracy: 0,
    });
    const player = makeTestPokemon({
      displayName: 'Confused',
      speed: 999,
      moves: [{ data: haymaker, currentPp: 5 }],
      volatileStatuses: [{ type: 'confusion', turnsRemaining: 2 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Target',
      speed: 1,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const state = createBattleState([player], [opp]);
    const origRandom = Math.random;

    try {
      Math.random = () => 0;
      const result = resolveTurn(
        state,
        { type: 'move', moveIndex: 0 },
        { type: 'move', moveIndex: 0 },
      );

      assert.ok(player.currentHp < player.maxHp, 'Confused attacker should self-hit');
      assert.equal(opp.currentHp, opp.maxHp, 'Defender should take no damage');
      assert.equal(player.moves[0].currentPp, 5, 'Self-hit should not spend PP');
      assert.ok(
        !result.messages.some((message) => message.includes('빗나갔다')),
        `Expected self-hit to stop the accuracy path, got ${JSON.stringify(result.messages)}`,
      );
    } finally {
      Math.random = origRandom;
    }
  });

  it('second mover loses its turn when flinched by the first mover', () => {
    const airSlash = makeMoveData({
      name: 'air-slash',
      nameKo: '에어슬래시',
      type: 'flying',
      category: 'special',
      power: 40,
      volatileEffect: { type: 'flinch', chance: 100 },
    });
    const player = makeTestPokemon({
      displayName: 'Fast',
      speed: 999,
      moves: [{ data: airSlash, currentPp: 15 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Slow',
      speed: 1,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 10 }],
    });
    const state = createBattleState([player], [opp]);

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(player.currentHp, player.maxHp, 'Flinched target should not attack back');
    assert.equal(opp.moves[0].currentPp, 10, 'Flinched turn should not consume PP');
    assert.deepEqual(opp.volatileStatuses, [], 'Flinch should be consumed on the skipped turn');
    assert.ok(
      result.messages.length >= 2,
      `Expected both the hit and the skipped turn to be logged, got ${JSON.stringify(result.messages)}`,
    );
  });

  it('slower flinch move does not stop a faster target that already acted', () => {
    const bite = makeMoveData({
      name: 'bite',
      nameKo: '물기',
      type: 'dark',
      power: 60,
      volatileEffect: { type: 'flinch', chance: 100 },
    });
    const player = makeTestPokemon({
      displayName: 'Slow',
      speed: 1,
      moves: [{ data: bite, currentPp: 25 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Fast',
      speed: 999,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 10 }],
    });
    const state = createBattleState([player], [opp]);

    resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.ok(player.currentHp < player.maxHp, 'Faster target should already have acted');
    assert.equal(opp.moves[0].currentPp, 9, 'Faster target should spend PP on its move');
    assert.equal(
      opp.volatileStatuses.some((status) => status.type === 'flinch'),
      false,
      'Late flinch should not persist on a target that already moved',
    );
  });

  it('damaging moves can apply volatile secondary effects', () => {
    const dynamicPunch = makeMoveData({
      name: 'dynamic-punch',
      nameKo: '폭발펀치',
      type: 'fighting',
      power: 80,
      accuracy: 100,
      volatileEffect: { type: 'confusion', chance: 100 },
    });
    const player = makeTestPokemon({
      displayName: 'Slow',
      speed: 1,
      moves: [{ data: dynamicPunch, currentPp: 5 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Fast',
      speed: 999,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const state = createBattleState([player], [opp]);

    resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(opp.volatileStatuses.length, 1);
    assert.equal(opp.volatileStatuses[0].type, 'confusion');
  });

  it('a pokemon can hold confusion, flinch, and leech-seed at once', () => {
    const target = makeTestPokemon({ displayName: 'Stacked' });
    const messages: string[] = [];

    addVolatileStatus(target, { type: 'confusion', turnsRemaining: 3 }, messages);
    addVolatileStatus(target, { type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }, messages);
    addVolatileStatus(target, { type: 'flinch' }, messages);

    assert.deepEqual(
      target.volatileStatuses.map((status) => status.type).sort(),
      ['confusion', 'flinch', 'leech_seed'],
    );
  });

  it('leech-seed drains 1/8 maxHp at end of turn and heals the source side', () => {
    const player = makeTestPokemon({
      displayName: 'Seeder',
      maxHp: 160,
      currentHp: 100,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Drained',
      maxHp: 160,
      currentHp: 160,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    addVolatileStatus(opp, { type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }, []);
    const state = createBattleState([player], [opp]);

    resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(opp.currentHp, 140);
    assert.equal(player.currentHp, 120);
  });

  it('leech-seed healing is capped at maxHp', () => {
    const player = makeTestPokemon({
      displayName: 'Seeder',
      maxHp: 160,
      currentHp: 155,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Drained',
      maxHp: 160,
      currentHp: 160,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    addVolatileStatus(opp, { type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }, []);
    const state = createBattleState([player], [opp]);

    resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(player.currentHp, player.maxHp);
    assert.equal(opp.currentHp, 140);
  });

  it('grass types reject leech-seed', () => {
    const leechSeed = makeMoveData({
      name: 'leech-seed',
      nameKo: '씨뿌리기',
      type: 'grass',
      power: 0,
      accuracy: 100,
      volatileEffect: { type: 'leech_seed', chance: 100 },
    });
    const player = makeTestPokemon({
      displayName: 'Seeder',
      speed: 999,
      moves: [{ data: leechSeed, currentPp: 10 }],
    });
    const opp = makeTestPokemon({
      displayName: 'GrassTarget',
      types: ['grass'],
      speed: 1,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const state = createBattleState([player], [opp]);

    const result = resolveTurn(
      state,
      { type: 'move', moveIndex: 0 },
      { type: 'move', moveIndex: 0 },
    );

    assert.equal(opp.volatileStatuses.some((status) => status.type === 'leech_seed'), false);
    assert.ok(
      result.messages.some((message) => message.includes('효과가 없다')),
      `Expected grass immunity log, got ${JSON.stringify(result.messages)}`,
    );
  });

  it('toxic counter resets on switch', () => {
    const p1 = makeTestPokemon({ displayName: 'Toxic', statusCondition: 'badly_poisoned' as StatusCondition, toxicCounter: 5 });
    const p2 = makeTestPokemon({ displayName: 'Fresh', statusCondition: null, toxicCounter: 0 });
    const opp = makeTestPokemon({ displayName: 'O', statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([p1, p2], [opp]);
    resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });
    assert.equal(p1.toxicCounter, 1);
  });

  it('switch resets stat stages on the incoming pokemon', () => {
    const p1 = makeTestPokemon({ displayName: 'Lead' });
    const p2 = makeTestPokemon({ displayName: 'Bench' });
    p2.statStages.attack = 3;
    p2.statStages.speed = -2;
    const opp = makeTestPokemon({ displayName: 'O' });
    const state = createBattleState([p1, p2], [opp]);

    resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });

    assert.deepEqual(p2.statStages, createStatStages());
  });

  it('switching out clears confusion and leech-seed from the departing pokemon', () => {
    const p1 = makeTestPokemon({ displayName: 'Lead' });
    const p2 = makeTestPokemon({ displayName: 'Bench' });
    const opp = makeTestPokemon({ displayName: 'Opp' });
    addVolatileStatus(p1, { type: 'confusion', turnsRemaining: 3 }, []);
    addVolatileStatus(p1, { type: 'leech_seed', sourceSide: 'opponent', sourceSlot: 0 }, []);
    const state = createBattleState([p1, p2], [opp]);

    resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });

    assert.deepEqual(p1.volatileStatuses, []);
  });

  it('seeder switch-out clears leech_seed on opponent and stops healing replacement', () => {
    // Regression for v3c R3 HIGH: leech-seed was bound to sourceSide only.
    // After the seeder switched out, the target kept draining and the
    // replacement mon on the seeder side would receive the healing instead.
    const seeder = makeTestPokemon({
      displayName: 'Seeder',
      speed: 999,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const bench = makeTestPokemon({
      displayName: 'Bench',
      currentHp: 10,
      maxHp: 160,
    });
    const target = makeTestPokemon({
      displayName: 'Target',
      speed: 1,
      maxHp: 160,
      currentHp: 160,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    addVolatileStatus(target, { type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }, []);

    const state = createBattleState([seeder, bench], [target]);
    resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });

    assert.equal(
      target.volatileStatuses.some((s) => s.type === 'leech_seed'),
      false,
      'Target should no longer be seeded after seeder switched out',
    );
    assert.equal(bench.currentHp, 10, 'Bench (replacement) must not be healed by stale leech-seed');
  });

  it('sourceSlot mismatch blocks healing even if leech_seed survives cleanup', () => {
    // Defense in depth: if a stale entry with sourceSlot=0 reaches
    // applyLeechSeedEndOfTurn while the active slot is 1 (bench), the
    // target must still drain but no mon should be healed.
    const seeder = makeTestPokemon({ displayName: 'Seeder' });
    const bench = makeTestPokemon({ displayName: 'Bench', currentHp: 10, maxHp: 160, moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }] });
    const target = makeTestPokemon({ displayName: 'Target', currentHp: 160, maxHp: 160, speed: 1, moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }] });
    addVolatileStatus(target, { type: 'leech_seed', sourceSide: 'player', sourceSlot: 0 }, []);
    const state = createBattleState([seeder, bench], [target]);
    state.player.activeIndex = 1;

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.ok(target.currentHp < 160, 'Target should still take drain damage');
    assert.equal(bench.currentHp, 10, 'Bench (wrong slot) must not receive leech-seed heal');
  });

  it('legacy leech_seed without sourceSlot cannot heal after resume', () => {
    // Regression for v3c R4 HIGH: a legacy entry without sourceSlot must
    // still drain the target but never heal any mon. The normalizer drops
    // such entries during load, but this test bypasses that to validate
    // the end-of-turn ownership guard as a second line of defense.
    const seeder = makeTestPokemon({
      displayName: 'Seeder',
      currentHp: 10,
      maxHp: 160,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const target = makeTestPokemon({
      displayName: 'Target',
      currentHp: 160,
      maxHp: 160,
      speed: 1,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    target.volatileStatuses.push({ type: 'leech_seed', sourceSide: 'player' } as any);
    const state = createBattleState([seeder], [target]);

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.ok(target.currentHp < 160, 'Target should still take drain damage');
    assert.equal(seeder.currentHp, 10, 'Seeder must not be healed from a legacy seed entry');
  });

  it('switching out also clears flinch if it was still present', () => {
    const p1 = makeTestPokemon({ displayName: 'Lead' });
    const p2 = makeTestPokemon({ displayName: 'Bench' });
    const opp = makeTestPokemon({ displayName: 'Opp' });
    addVolatileStatus(p1, { type: 'flinch' }, []);
    const state = createBattleState([p1, p2], [opp]);

    resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });

    assert.deepEqual(p1.volatileStatuses, []);
  });

  it('move-type immune target does not receive status from secondary effect', () => {
    // Thunderbolt (electric) vs Ground-type — should not paralyze
    const effectMove = makeMoveData({ type: 'electric', category: 'special', power: 90 });
    (effectMove as any).effect = { type: 'paralysis', chance: 100 };
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: effectMove, currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', types: ['ground'], statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(opp.statusCondition, null, 'Ground type should not be paralyzed by Electric move');
  });

  it('steel type does not receive poison from a non-poison move secondary effect', () => {
    // Hypothetical grass-type move (no type-immunity vs steel) with poison effect —
    // steel status immunity should still block the poison application.
    const effectMove = makeMoveData({ type: 'grass', category: 'special', power: 60 });
    (effectMove as any).effect = { type: 'poison', chance: 100 };
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: effectMove, currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', types: ['steel'], statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(opp.statusCondition, null, 'Steel type should not be poisoned regardless of move type');
  });

  it('steel type does not receive badly_poisoned from a non-poison move', () => {
    // Hypothetical grass-type status move with badly_poisoned effect — steel
    // status immunity must still block it.
    const toxicMove = makeMoveData({ type: 'grass', category: 'physical', power: 0, accuracy: 100 });
    (toxicMove as any).effect = { type: 'badly_poisoned', chance: 100 };
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: toxicMove, currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', types: ['steel'], statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(opp.statusCondition, null, 'Steel type should not be badly poisoned regardless of move type');
  });

  it('move-type immune target does not receive status from status move', () => {
    // Thunder Wave (electric status) vs Ground-type — should not paralyze
    const statusMove = makeMoveData({ type: 'electric', category: 'physical', power: 0, accuracy: 90 });
    (statusMove as any).effect = { type: 'paralysis', chance: 100 };
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: statusMove, currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', types: ['ground'], statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(opp.statusCondition, null, 'Ground type should not be paralyzed by Thunder Wave');
  });

  it('no-PP turn always resolves through Struggle, even when paralyzed', () => {
    // Paralyzed pokemon with 0 PP should still use Struggle and take recoil
    // damage — paralysis must not let a no-PP turn skip the mandatory Struggle path.
    const player = makeTestPokemon({
      displayName: 'Exhausted',
      maxHp: 100,
      currentHp: 100,
      speed: 999,
      statusCondition: 'paralysis' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 0 }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);

    // Track over many trials — expected: Struggle runs on every turn (no paralysis skip)
    // so recoil (1/4 max HP = 25) is applied each time.
    let recoilHits = 0;
    for (let i = 0; i < 50; i++) {
      player.currentHp = 100;
      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
      if (player.currentHp < 100) recoilHits++;
    }
    assert.ok(recoilHits >= 40, `Struggle recoil should run on most no-PP turns, got ${recoilHits}/50`);
  });

  it('paralysis does not waste PP when fully paralyzed', () => {
    // A normal chosen move skipped by full paralysis must not decrement PP.
    // Force deterministic paralysis by monkey-patching Math.random via many trials.
    const player = makeTestPokemon({
      displayName: 'Paralyzed',
      speed: 999,
      statusCondition: 'paralysis' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);

    // Run many trials and confirm that on turns where player message contains
    // the immobile message, PP did NOT decrement.
    const origRandom = Math.random;
    try {
      // Force paralysis skip by making Math.random return 0 (< 0.25)
      Math.random = () => 0;
      const ppBefore = player.moves[0].currentPp;
      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
      assert.equal(player.moves[0].currentPp, ppBefore, 'PP should not decrement on full paralysis');
    } finally {
      Math.random = origRandom;
    }
  });

  it('sleep skips the turn without consuming PP', () => {
    const player = makeTestPokemon({
      displayName: 'Sleeper',
      speed: 999,
      statusCondition: 'sleep' as StatusCondition,
      sleepCounter: 2,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', sleepCounter: 0 });
    const state = createBattleState([player], [opp]);

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(player.moves[0].currentPp, 10);
    assert.equal(player.sleepCounter, 1);
  });

  it('wake-up turn still skips the move', () => {
    const player = makeTestPokemon({
      displayName: 'Sleeper',
      speed: 999,
      statusCondition: 'sleep' as StatusCondition,
      sleepCounter: 1,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', sleepCounter: 0 });
    const state = createBattleState([player], [opp]);

    const result = resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(player.statusCondition, null);
    assert.equal(player.moves[0].currentPp, 10);
    assert.ok(result.messages.some((m) => m.includes('깨어났다')));
  });

  it('freeze skips the turn without consuming PP when thaw roll fails', () => {
    const player = makeTestPokemon({
      displayName: 'Frozen',
      speed: 999,
      statusCondition: 'freeze' as StatusCondition,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', sleepCounter: 0 });
    const state = createBattleState([player], [opp]);
    const origRandom = Math.random;

    try {
      Math.random = () => 0.9;
      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
      assert.equal(player.moves[0].currentPp, 10);
      assert.equal(player.statusCondition, 'freeze');
    } finally {
      Math.random = origRandom;
    }
  });

  it('freeze exception moves act normally and thaw the user', () => {
    const thawMoves = [
      { name: 'scald', nameKo: '열탕', type: 'water', category: 'special' as const, power: 80, pp: 15 },
      { name: 'pyro-ball', nameKo: '화염볼', type: 'fire', category: 'physical' as const, power: 120, pp: 5 },
      { name: 'matcha-gotcha', nameKo: '말차고차', type: 'grass', category: 'special' as const, power: 80, pp: 15 },
    ];

    for (const thawMove of thawMoves) {
      const player = makeTestPokemon({
        displayName: 'Frozen',
        speed: 999,
        statusCondition: 'freeze' as StatusCondition,
        moves: [{
          data: makeMoveData({
            name: thawMove.name,
            nameKo: thawMove.nameKo,
            type: thawMove.type,
            category: thawMove.category,
            power: thawMove.power,
            accuracy: 100,
            pp: thawMove.pp,
          }),
          currentPp: thawMove.pp,
        }],
      });
      const opp = makeTestPokemon({ displayName: 'Opp', sleepCounter: 0 });
      const state = createBattleState([player], [opp]);

      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

      assert.equal(player.statusCondition, null, `${thawMove.name} should thaw the user`);
      assert.equal(player.moves[0].currentPp, thawMove.pp - 1, `${thawMove.name} should consume PP`);
    }
  });

  it('fire-type attacks thaw frozen defenders before damage', () => {
    const player = makeTestPokemon({
      displayName: 'Fire',
      speed: 999,
      moves: [{ data: makeFireMove({ power: 60 }), currentPp: 25 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Frozen Target',
      types: ['grass'],
      statusCondition: 'freeze' as StatusCondition,
      currentHp: 100,
    });
    const state = createBattleState([player], [opp]);

    const result = resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(opp.statusCondition, null);
    assert.ok(opp.currentHp < 100, 'Damage should still apply after thaw');
    assert.ok(result.messages.some((m) => m.includes('녹았다')));
  });

  it('ice-type targets remain immune to freeze secondary effects', () => {
    const effectMove = makeMoveData({ type: 'ice', category: 'special', power: 90 });
    (effectMove as any).effect = { type: 'freeze', chance: 100 };
    const player = makeTestPokemon({
      displayName: 'P',
      speed: 999,
      moves: [{ data: effectMove, currentPp: 10 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Ice Target',
      types: ['ice'],
      statusCondition: null,
    });
    const state = createBattleState([player], [opp]);

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(opp.statusCondition, null);
  });

  it('simultaneous end-of-turn double KO results in opponent win (player loses)', () => {
    // Both last mons are poisoned at 1 HP. End-of-turn poison damage faints
    // both simultaneously. Mainline rule: player loses a double KO.
    const player = makeTestPokemon({
      displayName: 'P',
      speed: 999,
      maxHp: 160,
      currentHp: 1,
      statusCondition: 'poison' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({
      displayName: 'O',
      speed: 1,
      maxHp: 160,
      currentHp: 1,
      statusCondition: 'poison' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 0 }), currentPp: 10 }],
    });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(state.phase, 'battle_end');
    assert.equal(state.winner, 'opponent', 'Double KO should award opponent (player loses)');
    assert.equal(player.fainted, true);
    assert.equal(opp.fainted, true);
  });

  it('end-of-turn status damage does not run after opponent KO (last mon)', () => {
    // Player KOs opponent's only pokemon while burned at 1 HP — player should win,
    // not faint from burn tick after battle is already decided.
    const player = makeTestPokemon({
      displayName: 'Burned',
      speed: 999,
      attack: 200,
      maxHp: 100,
      currentHp: 1,
      statusCondition: 'burn' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 100, category: 'special' }), currentPp: 10 }],
    });
    const opp = makeTestPokemon({
      displayName: 'Victim',
      speed: 1,
      maxHp: 50,
      currentHp: 1,
      defense: 1,
      statusCondition: null,
      toxicCounter: 0,
    });
    const state = createBattleState([player], [opp]);
    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    assert.equal(state.winner, 'player', 'Player should win after KOing last mon');
    assert.equal(player.fainted, false, 'Player should not faint from post-turn burn tick after battle decided');
    assert.equal(state.phase, 'battle_end');
  });

  it('sleep blocks Struggle turn (no-PP asleep pokemon cannot act)', () => {
    // Sleep must consume the turn even when the attacker has no PP and would
    // otherwise be forced into Struggle. Assertion: opponent took no damage
    // from the sleeper, proving the sleeper never acted.
    const player = makeTestPokemon({
      displayName: 'Sleeper',
      speed: 999,
      statusCondition: 'sleep' as StatusCondition,
      toxicCounter: 0,
      sleepCounter: 3,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 0 }],
    });
    // Opponent has no usable moves either — guarantees opp does NOT attack
    // the sleeper, so sleeper's HP should remain at maxHp (no opp damage, no
    // struggle recoil on the sleeper side because sleeper never acted).
    const opp = makeTestPokemon({
      displayName: 'O',
      speed: 1,
      statusCondition: 'sleep' as StatusCondition,
      toxicCounter: 0,
      sleepCounter: 3,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 0 }],
    });
    const state = createBattleState([player], [opp]);
    const result = resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
    // Neither mon should take damage — both were asleep and blocked from acting.
    assert.equal(player.currentHp, player.maxHp, 'Sleeper should not take struggle recoil');
    assert.equal(opp.currentHp, opp.maxHp, 'Neither mon should have dealt damage');
    assert.ok(
      result.messages.some((m) => m.includes('잠') || m.toLowerCase().includes('sleep')),
      `Expected sleep message, got: ${JSON.stringify(result.messages)}`,
    );
  });

  it('freeze blocks Struggle turn (no-PP frozen pokemon cannot act)', () => {
    // Freeze must consume the turn even when Struggle would be forced.
    // Pin Math.random to 0.9 so thaw roll (<0.2) never fires.
    const player = makeTestPokemon({
      displayName: 'Frozen',
      speed: 999,
      statusCondition: 'freeze' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 0 }],
    });
    // Opponent also frozen with no PP — so neither side should act
    const opp = makeTestPokemon({
      displayName: 'O',
      speed: 1,
      statusCondition: 'freeze' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 0 }],
    });
    const state = createBattleState([player], [opp]);
    const origRandom = Math.random;
    try {
      Math.random = () => 0.9;
      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
      assert.equal(player.currentHp, player.maxHp, 'Neither mon should have taken damage');
      assert.equal(opp.currentHp, opp.maxHp, 'Neither mon should have dealt damage');
      assert.equal(player.statusCondition, 'freeze', 'Player should still be frozen');
      assert.equal(opp.statusCondition, 'freeze', 'Opponent should still be frozen');
    } finally {
      Math.random = origRandom;
    }
  });

  it('will-o-wisp does not thaw a frozen defender (non-damaging fire status)', () => {
    // Regression: a non-damaging fire move must not thaw a frozen target and
    // then apply a new burn in the same action. Pin Math.random to 0.5 so
    // the defender's own thaw roll (<0.2) does not fire.
    const wow = makeMoveData({ type: 'fire', category: 'physical', power: 0, accuracy: 85 });
    (wow as any).effect = { type: 'burn', chance: 100 };
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: wow, currentPp: 10 }] });
    // Opponent is frozen, has no PP (so they would Struggle but sleep/freeze
    // check fires first). Types set to water so fire is not immune.
    const opp = makeTestPokemon({
      displayName: 'O',
      types: ['water'],
      speed: 1,
      statusCondition: 'freeze' as StatusCondition,
      toxicCounter: 0,
      moves: [{ data: makeMoveData({ power: 40 }), currentPp: 0 }],
    });
    const state = createBattleState([player], [opp]);
    const origRandom = Math.random;
    try {
      Math.random = () => 0.5;
      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
      assert.equal(opp.statusCondition, 'freeze', 'Freeze should not be cleared by non-damaging fire move');
    } finally {
      Math.random = origRandom;
    }
  });

  it('damaging fire move (flamethrower) still thaws a frozen defender', () => {
    const flamethrower = makeMoveData({ type: 'fire', category: 'special', power: 90 });
    const player = makeTestPokemon({ displayName: 'P', speed: 999, statusCondition: null, toxicCounter: 0, moves: [{ data: flamethrower, currentPp: 10 }] });
    const opp = makeTestPokemon({ displayName: 'O', types: ['water'], statusCondition: 'freeze' as StatusCondition, toxicCounter: 0 });
    const state = createBattleState([player], [opp]);
    const origRandom = Math.random;
    try {
      Math.random = () => 0;
      resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });
      assert.equal(opp.statusCondition, null, 'Frozen defender should be thawed by damaging fire move');
      assert.ok(opp.currentHp < opp.maxHp, 'Damage should still apply');
    } finally {
      Math.random = origRandom;
    }
  });

  it('AI prefers self-buff setup when its own stages are low', () => {
    const attacker = makeTestPokemon({
      moves: [
        {
          data: makeMoveData({
            name: 'swords-dance',
            category: 'status',
            power: 0,
            accuracy: null,
            statChanges: [{ target: 'self', stat: 'attack', stages: 2, chance: 100 }],
          }),
          currentPp: 20,
        },
        { data: makeMoveData({ name: 'tackle', power: 40 }), currentPp: 35 },
      ],
    });
    const defender = makeTestPokemon({ displayName: 'Defender', currentHp: 120 });
    const origRandom = Math.random;
    try {
      Math.random = () => 0;
      const choice = selectAiMove(attacker, defender);
      assert.equal(choice, 0);
    } finally {
      Math.random = origRandom;
    }
  });

  it('AI gives zero setup score when already capped', () => {
    const attacker = makeTestPokemon({
      statStages: { ...createStatStages(), attack: 6 },
      moves: [
        {
          data: makeMoveData({
            name: 'swords-dance',
            category: 'status',
            power: 0,
            accuracy: null,
            statChanges: [{ target: 'self', stat: 'attack', stages: 2, chance: 100 }],
          }),
          currentPp: 20,
        },
        { data: makeMoveData({ name: 'slash', power: 70 }), currentPp: 20 },
      ],
    });
    const choice = selectAiMove(attacker, makeTestPokemon({ displayName: 'Defender' }));
    assert.equal(choice, 1);
  });
});
