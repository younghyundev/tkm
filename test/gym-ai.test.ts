import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initLocale } from '../src/i18n/index.js';
import { selectAiMove, selectAiAction } from '../src/core/gym-ai.js';
import { addVolatileStatus } from '../src/core/volatile-status.js';
import { createBattlePokemon } from '../src/core/turn-battle.js';
import type { MoveData } from '../src/core/types.js';
import type { BattlePokemon, StatusCondition } from '../src/core/types.js';

initLocale('ko');

// ── Test move data ──

const thunderbolt: MoveData = {
  id: 85,
  name: 'thunderbolt',
  nameKo: '10만볼트',
  nameEn: 'Thunderbolt',
  type: 'electric',
  category: 'special',
  power: 90,
  accuracy: 100,
  pp: 15,
};

const tackle: MoveData = {
  id: 33,
  name: 'tackle',
  nameKo: '몸통박치기',
  nameEn: 'Tackle',
  type: 'normal',
  category: 'physical',
  power: 40,
  accuracy: 100,
  pp: 35,
};

const thunderWave: MoveData = {
  id: 86, name: 'thunder-wave', nameKo: '전기자석파', nameEn: 'Thunder Wave',
  type: 'electric', category: 'status' as any, power: 0, accuracy: 90, pp: 20,
  effect: { type: 'paralysis' as StatusCondition, chance: 100 },
};

const weakTackle: MoveData = {
  id: 133,
  name: 'weak-tackle',
  nameKo: '약한몸통박치기',
  nameEn: 'Weak Tackle',
  type: 'normal',
  category: 'physical',
  power: 10,
  accuracy: 100,
  pp: 35,
};

const weakScratch: MoveData = {
  id: 10,
  name: 'scratch',
  nameKo: '할퀴기',
  nameEn: 'Scratch',
  type: 'normal',
  category: 'physical',
  power: 10,
  accuracy: 100,
  pp: 35,
};

const confuseRay: MoveData = {
  id: 109,
  name: 'confuse-ray',
  nameKo: '이상한빛',
  nameEn: 'Confuse Ray',
  type: 'ghost',
  category: 'status' as any,
  power: 0,
  accuracy: 100,
  pp: 10,
  volatileEffect: { type: 'confusion', chance: 100, minTurns: 2, maxTurns: 5 },
};

const leechSeed: MoveData = {
  id: 920,
  name: 'leech-seed',
  nameKo: '씨뿌리기',
  nameEn: 'Leech Seed',
  type: 'grass',
  category: 'status' as any,
  power: 0,
  accuracy: 90,
  pp: 10,
  volatileEffect: { type: 'leech_seed', chance: 100 },
};

const recover: MoveData = {
  id: 105,
  name: 'recover',
  nameKo: '회복',
  nameEn: 'Recover',
  type: 'normal',
  category: 'status' as any,
  power: 0,
  accuracy: null,
  pp: 5,
  moveEffect: { type: 'heal', fraction: 0.5 },
};

const rest: MoveData = {
  id: 156,
  name: 'rest',
  nameKo: '잠자기',
  nameEn: 'Rest',
  type: 'psychic',
  category: 'status' as any,
  power: 0,
  accuracy: null,
  pp: 5,
  moveEffect: { type: 'rest' },
};

const absorb: MoveData = {
  id: 71,
  name: 'absorb',
  nameKo: '흡수',
  nameEn: 'Absorb',
  type: 'grass',
  category: 'special',
  power: 40,
  accuracy: 100,
  pp: 25,
  moveEffect: { type: 'drain', fraction: 0.5 },
};

const razorLeaf: MoveData = {
  id: 75,
  name: 'razor-leaf',
  nameKo: '잎날가르기',
  nameEn: 'Razor Leaf',
  type: 'grass',
  category: 'physical',
  power: 40,
  accuracy: 100,
  pp: 25,
};

// ── Helpers ──

function makeAttacker() {
  return createBattlePokemon(
    { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
    [thunderbolt, tackle],
  );
}

function makeWaterDefender() {
  return createBattlePokemon(
    { id: 120, types: ['water'], level: 30, baseStats: { hp: 30, attack: 45, defense: 55, speed: 85, sp_attack: 70, sp_defense: 25 } },
    [tackle],
  );
}

function makeAttackerWithStatus() {
  return createBattlePokemon(
    { id: 25, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
    [thunderbolt, thunderWave],
  );
}

function makeAttackerWithConfuseRay() {
  return createBattlePokemon(
    { id: 94, types: ['ghost'], level: 30, baseStats: { hp: 60, attack: 65, defense: 60, speed: 110, sp_attack: 130, sp_defense: 75 } },
    [weakTackle, confuseRay],
  );
}

function makeAttackerWithLeechSeed() {
  return createBattlePokemon(
    { id: 1, types: ['grass'], level: 30, baseStats: { hp: 45, attack: 49, defense: 49, speed: 45, sp_attack: 65, sp_defense: 65 } },
    [weakTackle, leechSeed],
  );
}

function makeRecoveryAttacker() {
  return createBattlePokemon(
    { id: 133, types: ['normal'], level: 30, baseStats: { hp: 55, attack: 55, defense: 50, speed: 55, sp_attack: 45, sp_defense: 65 } },
    [weakScratch, recover],
  );
}

function makeRestAttacker() {
  return createBattlePokemon(
    { id: 143, types: ['normal'], level: 30, baseStats: { hp: 160, attack: 110, defense: 65, speed: 30, sp_attack: 65, sp_defense: 110 } },
    [weakScratch, rest],
  );
}

function makeDrainAttacker() {
  return createBattlePokemon(
    { id: 1, types: ['grass'], level: 30, baseStats: { hp: 45, attack: 49, defense: 49, speed: 45, sp_attack: 65, sp_defense: 65 } },
    [razorLeaf, absorb],
  );
}

// ── Tests ──

describe('selectAiMove', () => {
  it('prefers super-effective STAB move against water defender', () => {
    const runs = 100;
    let thunderboltCount = 0;
    for (let i = 0; i < runs; i++) {
      const attacker = makeAttacker();
      const defender = makeWaterDefender();
      const idx = selectAiMove(attacker, defender);
      if (idx === 0) thunderboltCount++;
    }
    // Thunderbolt (index 0) is electric vs water = 2x, + STAB 1.5 → score = 90*1.5*2 = 270
    // Tackle (index 1) is normal vs water = 1x, no STAB → score = 40*1*1 = 40
    // 80% best + 20% random (50% chance of idx 0) → expected ~90%
    assert.ok(
      thunderboltCount > 60,
      `Expected thunderbolt picked >60 times, got ${thunderboltCount}`,
    );
  });

  it('skips moves with 0 PP', () => {
    const attacker = makeAttacker();
    const defender = makeWaterDefender();
    // Drain all PP from thunderbolt (index 0)
    attacker.moves[0].currentPp = 0;
    const idx = selectAiMove(attacker, defender);
    assert.equal(idx, 1, 'Should pick tackle (index 1) when thunderbolt has 0 PP');
  });

  it('returns 0 when all moves have 0 PP', () => {
    const attacker = makeAttacker();
    const defender = makeWaterDefender();
    attacker.moves[0].currentPp = 0;
    attacker.moves[1].currentPp = 0;
    const idx = selectAiMove(attacker, defender);
    assert.equal(idx, 0, 'Should return 0 (struggle) when no moves usable');
  });
});

describe('selectAiAction', () => {
  it('returns TurnAction with type move', () => {
    const attacker = makeAttacker();
    const defender = makeWaterDefender();
    const action = selectAiAction(attacker, defender);
    assert.equal(action.type, 'move');
    assert.ok('moveIndex' in action, 'Action should have moveIndex');
    assert.equal(typeof action.moveIndex, 'number');
  });
});

describe('selectAiMove with status moves', () => {
  it('uses status move when opponent has no status', () => {
    let statusCount = 0;
    for (let i = 0; i < 200; i++) {
      const idx = selectAiMove(makeAttackerWithStatus(), makeWaterDefender());
      if (idx === 1) statusCount++;
    }
    assert.ok(statusCount > 0, `Status move should be used sometimes, got ${statusCount}/200`);
  });

  it('never uses status move when opponent already has status', () => {
    let statusCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = makeWaterDefender();
      (defender as BattlePokemon).statusCondition = 'paralysis';
      if (selectAiMove(makeAttackerWithStatus(), defender) === 1) statusCount++;
    }
    assert.equal(statusCount, 0, 'Should never pick status move when opponent has status');
  });

  it('never uses status move when opponent is immune', () => {
    let statusCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = createBattlePokemon(
        { id: 26, types: ['electric'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
        [tackle],
      );
      if (selectAiMove(makeAttackerWithStatus(), defender) === 1) statusCount++;
    }
    assert.equal(statusCount, 0, 'Should never pick status move when opponent is type-immune');
  });

  it('never uses Thunder Wave against Ground-type (move-type immunity)', () => {
    // Ground is status-vulnerable to paralysis but immune to Electric moves.
    // The AI should recognize move-type immunity, not just status-type immunity.
    let statusCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = createBattlePokemon(
        { id: 50, types: ['ground'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
        [tackle],
      );
      if (selectAiMove(makeAttackerWithStatus(), defender) === 1) statusCount++;
    }
    assert.equal(statusCount, 0, 'Should never pick Thunder Wave against Ground (move-type immune)');
  });
});

describe('selectAiMove with volatile-status moves', () => {
  it('never uses confuse-ray when the opponent is already confused', () => {
    let confusionCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = makeWaterDefender();
      defender.volatileStatuses = [];
      addVolatileStatus(defender, { type: 'confusion', turnsRemaining: 3 }, []);
      if (selectAiMove(makeAttackerWithConfuseRay(), defender) === 1) confusionCount++;
    }
    assert.equal(confusionCount, 0, 'Should never pick Confuse Ray against an already-confused target');
  });

  it('uses leech-seed sometimes against non-grass targets', () => {
    let leechSeedCount = 0;
    for (let i = 0; i < 200; i++) {
      if (selectAiMove(makeAttackerWithLeechSeed(), makeWaterDefender()) === 1) leechSeedCount++;
    }
    assert.ok(leechSeedCount > 0, `Leech Seed should be used sometimes, got ${leechSeedCount}/200`);
  });

  it('never uses leech-seed against grass targets', () => {
    let leechSeedCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = createBattlePokemon(
        { id: 43, types: ['grass'], level: 30, baseStats: { hp: 45, attack: 50, defense: 55, speed: 30, sp_attack: 75, sp_defense: 65 } },
        [tackle],
      );
      if (selectAiMove(makeAttackerWithLeechSeed(), defender) === 1) leechSeedCount++;
    }
    assert.equal(leechSeedCount, 0, 'Should never pick Leech Seed against Grass-type targets');
  });

  it('never uses leech-seed when the opponent is already seeded', () => {
    let leechSeedCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = makeWaterDefender();
      defender.volatileStatuses = [];
      addVolatileStatus(defender, { type: 'leech_seed', sourceSide: 'player' }, []);
      if (selectAiMove(makeAttackerWithLeechSeed(), defender) === 1) leechSeedCount++;
    }
    assert.equal(leechSeedCount, 0, 'Should never pick Leech Seed when the target is already seeded');
  });
});

describe('selectAiMove with stat-change moves (debuff scoring)', () => {
  // Regression for v3b R2: opponent debuff scoring was inverted, so the AI
  // valued redundant drops on already-debuffed targets and ignored buffed
  // ones. The fix uses headroom toward -6 instead of raw stage.

  const growl: MoveData = {
    id: 45, name: 'growl', nameKo: '울음소리', nameEn: 'Growl',
    type: 'normal', category: 'status' as any, power: 0, accuracy: 100, pp: 40,
    statChanges: [{ target: 'opponent', stat: 'attack', stages: -1, chance: 100 }],
  } as any;

  function makeNormalDefender(): BattlePokemon {
    return createBattlePokemon(
      { id: 100, types: ['normal'], level: 30, baseStats: { hp: 80, attack: 60, defense: 50, speed: 50, sp_attack: 50, sp_defense: 50 } },
      [tackle],
    );
  }

  function makeAttackerWithDebuff(): BattlePokemon {
    return createBattlePokemon(
      { id: 25, types: ['normal'], level: 30, baseStats: { hp: 35, attack: 55, defense: 40, speed: 90, sp_attack: 50, sp_defense: 50 } },
      [weakTackle, growl],
    );
  }

  it('never uses debuff against a target already at -6 in the relevant stat', () => {
    let debuffCount = 0;
    for (let i = 0; i < 100; i++) {
      const defender = makeNormalDefender();
      defender.statStages.attack = -6;
      if (selectAiMove(makeAttackerWithDebuff(), defender) === 1) debuffCount++;
    }
    assert.equal(debuffCount, 0, 'Should never pick growl when target attack is already at -6');
  });

  it('prioritizes debuff against a buffed target over a weak attack', () => {
    // weakTackle scores ~10 (10 * 1 * 1). growl against +6 attack scores
    // 40 * 12/12 = 40. So debuff should be picked the vast majority of the
    // time (80% best + 20% random tiebreak).
    let debuffCount = 0;
    for (let i = 0; i < 200; i++) {
      const defender = makeNormalDefender();
      defender.statStages.attack = 6;
      if (selectAiMove(makeAttackerWithDebuff(), defender) === 1) debuffCount++;
    }
    assert.ok(
      debuffCount > 150,
      `Expected debuff vs +6 attacker to be picked >150/200, got ${debuffCount}`,
    );
  });

  it('never uses normal-type debuff against Ghost (move-type immune)', () => {
    // Regression for v3b R3: AI was scoring growl normally against Ghost,
    // even though normal-type moves cannot land on Ghost types.
    let debuffCount = 0;
    for (let i = 0; i < 100; i++) {
      const ghostDefender = createBattlePokemon(
        { id: 92, types: ['ghost'], level: 30, baseStats: { hp: 30, attack: 35, defense: 30, speed: 80, sp_attack: 100, sp_defense: 35 } },
        [tackle],
      );
      if (selectAiMove(makeAttackerWithDebuff(), ghostDefender) === 1) debuffCount++;
    }
    assert.equal(debuffCount, 0, 'AI should never pick growl against Ghost-type');
  });

  it('debuff scoring decays as defender approaches -6 (monotonic with headroom)', () => {
    // Compare selection rates at stages -3 vs +3 to verify the headroom-based
    // scoring (not the inverted raw-stage one). +3 should yield more debuff
    // selections than -3.
    let countAtMinus3 = 0;
    let countAtPlus3 = 0;
    for (let i = 0; i < 200; i++) {
      const defA = makeNormalDefender();
      defA.statStages.attack = -3;
      if (selectAiMove(makeAttackerWithDebuff(), defA) === 1) countAtMinus3++;

      const defB = makeNormalDefender();
      defB.statStages.attack = 3;
      if (selectAiMove(makeAttackerWithDebuff(), defB) === 1) countAtPlus3++;
    }
    assert.ok(
      countAtPlus3 > countAtMinus3,
      `Buffed (+3) should be debuffed more often than already-debuffed (-3): +3=${countAtPlus3} vs -3=${countAtMinus3}`,
    );
  });
});

describe('selectAiMove with moveEffect heuristics', () => {
  it('prefers healing moves at low HP', () => {
    let healCount = 0;
    for (let i = 0; i < 200; i++) {
      const attacker = makeRecoveryAttacker();
      const defender = makeWaterDefender();
      attacker.currentHp = Math.floor(attacker.maxHp * 0.25);
      if (selectAiMove(attacker, defender) === 1) healCount++;
    }

    assert.ok(healCount > 150, `Expected heal move >150/200 at low HP, got ${healCount}`);
  });

  it('skips healing moves when HP is above 80%', () => {
    let healCount = 0;
    for (let i = 0; i < 100; i++) {
      const attacker = makeRecoveryAttacker();
      const defender = makeWaterDefender();
      attacker.currentHp = Math.ceil(attacker.maxHp * 0.9);
      if (selectAiMove(attacker, defender) === 1) healCount++;
    }

    assert.equal(healCount, 0, 'Should never pick healing move above 80% HP');
  });

  it('prefers Rest at low HP when not statused', () => {
    let restCount = 0;
    for (let i = 0; i < 200; i++) {
      const attacker = makeRestAttacker();
      const defender = makeWaterDefender();
      attacker.currentHp = Math.floor(attacker.maxHp * 0.25);
      if (selectAiMove(attacker, defender) === 1) restCount++;
    }

    assert.ok(restCount > 150, `Expected Rest >150/200 at low HP, got ${restCount}`);
  });

  it('prefers Rest at low HP when already statused (doubles as cure)', () => {
    // Regression for v3d R1: Rest was hard-gated away from statused users,
    // but the battle engine sets statusCondition = null on Rest, so Rest
    // doubles as a status cure. AI should value Rest MORE when statused.
    let restCount = 0;
    for (let i = 0; i < 200; i++) {
      const attacker = makeRestAttacker();
      const defender = makeWaterDefender();
      attacker.currentHp = Math.floor(attacker.maxHp * 0.25);
      attacker.statusCondition = 'burn';
      if (selectAiMove(attacker, defender) === 1) restCount++;
    }

    assert.ok(restCount > 150, `Expected Rest >150/200 when burned at low HP, got ${restCount}`);
  });

  it('skips Rest when above 60% HP', () => {
    let restCount = 0;
    for (let i = 0; i < 100; i++) {
      const attacker = makeRestAttacker();
      const defender = makeWaterDefender();
      attacker.currentHp = Math.ceil(attacker.maxHp * 0.75);
      if (selectAiMove(attacker, defender) === 1) restCount++;
    }

    assert.equal(restCount, 0, 'Should never pick Rest above 60% HP');
  });

  it('above-cutoff Rest is not chosen even when every alternative scores 0', () => {
    // Regression for v3d R2 HIGH: the all-zero fallback used to pick
    // scored[0] unconditionally, which let a high-HP attacker self-sleep
    // when the other moves all scored 0 (e.g., Thunder Wave into Ground).
    // After the DISABLED_SCORE fix, the fallback must prefer the
    // zero-scored non-disabled move over Rest.
    const attacker = createBattlePokemon(
      { id: 143, types: ['normal'], level: 30, baseStats: { hp: 160, attack: 110, defense: 65, speed: 30, sp_attack: 65, sp_defense: 110 } },
      [rest, thunderWave],
    );
    attacker.currentHp = Math.ceil(attacker.maxHp * 0.75); // > 60%, Rest disabled
    const groundDefender = createBattlePokemon(
      { id: 50, types: ['ground'], level: 30, baseStats: { hp: 30, attack: 55, defense: 25, speed: 95, sp_attack: 35, sp_defense: 45 } },
      [tackle],
    );

    let restCount = 0;
    for (let i = 0; i < 100; i++) {
      if (selectAiMove(attacker, groundDefender) === 0) restCount++;
    }
    assert.equal(
      restCount,
      0,
      'Above-cutoff Rest must not win the all-zero fallback against a type-immune debuff target',
    );
  });

  it('gives drain moves a score bonus over similar damaging moves', () => {
    let drainCount = 0;
    for (let i = 0; i < 200; i++) {
      const attacker = makeDrainAttacker();
      const defender = makeWaterDefender();
      if (selectAiMove(attacker, defender) === 1) drainCount++;
    }

    assert.ok(drainCount > 150, `Expected drain move >150/200, got ${drainCount}`);
  });
});
