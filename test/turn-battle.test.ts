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
  it('returns true for always-hit moves (accuracy <= 0)', () => {
    const move: BattleMove = { data: makeMoveData({ accuracy: 0 }), currentPp: 10 };
    // Should always return true
    for (let i = 0; i < 50; i++) {
      assert.equal(checkAccuracy(move), true);
    }
  });

  it('returns boolean for normal accuracy moves', () => {
    const move: BattleMove = { data: makeMoveData({ accuracy: 50 }), currentPp: 10 };
    const result = checkAccuracy(move);
    assert.equal(typeof result, 'boolean');
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
    const switchIdx = result.messages.findIndex((m) => m.includes('교체'));
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

  it('toxic counter resets on switch', () => {
    const p1 = makeTestPokemon({ displayName: 'Toxic', statusCondition: 'badly_poisoned' as StatusCondition, toxicCounter: 5 });
    const p2 = makeTestPokemon({ displayName: 'Fresh', statusCondition: null, toxicCounter: 0 });
    const opp = makeTestPokemon({ displayName: 'O', statusCondition: null, toxicCounter: 0 });
    const state = createBattleState([p1, p2], [opp]);
    resolveTurn(state, { type: 'switch', pokemonIndex: 1 }, { type: 'move', moveIndex: 0 });
    assert.equal(p1.toxicCounter, 1);
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
    const player = makeTestPokemon({
      displayName: 'Frozen',
      speed: 999,
      statusCondition: 'freeze' as StatusCondition,
      moves: [{
        data: makeMoveData({
          name: 'scald',
          nameKo: '열탕',
          type: 'water',
          category: 'special',
          power: 80,
          accuracy: 100,
          pp: 15,
        }),
        currentPp: 15,
      }],
    });
    const opp = makeTestPokemon({ displayName: 'Opp', sleepCounter: 0 });
    const state = createBattleState([player], [opp]);

    resolveTurn(state, { type: 'move', moveIndex: 0 }, { type: 'move', moveIndex: 0 });

    assert.equal(player.statusCondition, null);
    assert.equal(player.moves[0].currentPp, 14);
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
});
