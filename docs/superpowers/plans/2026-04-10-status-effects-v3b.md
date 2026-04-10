# Status Effects v3b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stat stages to the Tokenmon battle engine: a 7-stat `-6..+6` stage system on `BattlePokemon`, move-data driven buffs/debuffs, damage-move secondary stat drops, battle-engine integration for damage/accuracy/speed, and a gym AI heuristic that uses stat moves strategically.

**Architecture:** Extend the existing battle state directly instead of adding a separate volatile-effect engine. `BattlePokemon` stores `statStages`, a dedicated `src/core/stat-stages.ts` module owns formulas and message emission, `MoveData.statChanges` describes self/opponent stage effects, and `src/core/turn-battle.ts` remains the single integration point for damage, accuracy, turn order, switching, and post-hit stat changes.

**Tech Stack:** TypeScript, Node.js built-in test runner, JSON move data, existing i18n JSON dictionaries, current gym AI scorer.

---

## File Map

- `src/core/types.ts`: `StatStages`, `StatChange`, `BattlePokemon.statStages`, `MoveData.statChanges`
- `src/core/turn-battle.ts`: initialize stat stages, integrate damage/accuracy/speed, apply stat changes, reset on switch
- `src/core/stat-stages.ts`: new formulas + stage application helpers
- `src/core/gym-ai.ts`: stat-move heuristic
- `src/core/battle-state-io.ts`: normalize legacy saves missing `statStages`
- `src/i18n/en.json`: English stat-stage messages and names
- `src/i18n/ko.json`: Korean stat-stage messages and names
- `data/moves.json`: stat-buff/debuff moves and secondary stat-drop effects
- `test/status-effects.test.ts`: stat-stage helper tests
- `test/turn-battle.test.ts`: battle-flow integration tests
- `test/battle-state-migration.test.ts`: persisted battle-state migration coverage

### Task 1: Types

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/turn-battle.ts`
- Modify: `src/core/battle-state-io.ts`
- Modify: `test/turn-battle.test.ts`
- Modify: `test/battle-state-migration.test.ts`

- [ ] **Step 1: Add `StatStages` and `StatChange` to `src/core/types.ts`**

```ts
// src/core/types.ts
export interface StatStages {
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  accuracy: number;
  evasion: number;
}

export interface StatChange {
  target: 'self' | 'opponent';
  stat: keyof StatStages;
  stages: number;
  chance: number;
}
```

- [ ] **Step 2: Extend `MoveData` and `BattlePokemon`**

```ts
// src/core/types.ts
export interface MoveData {
  id: number;
  name: string;
  nameKo?: string;
  nameEn?: string;
  type: string;
  category: 'physical' | 'special' | 'status';
  power: number;
  accuracy: number | null;
  pp: number;
  effect?: { type: StatusCondition; chance: number };
  statChanges?: StatChange[];
}

export interface BattlePokemon {
  id: number;
  name: string;
  displayName: string;
  types: string[];
  level: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  moves: BattleMove[];
  fainted: boolean;
  statusCondition: StatusCondition | null;
  toxicCounter: number;
  sleepCounter: number;
  statStages: StatStages;
}
```

- [ ] **Step 3: Initialize `statStages` when constructing battle Pokemon**

```ts
// src/core/turn-battle.ts
import { createStatStages } from './stat-stages.js';

export function createBattlePokemon(
  input: CreateBattlePokemonInput,
  moves: MoveData[],
): BattlePokemon {
  // ...existing setup...
  return {
    // ...existing fields...
    statusCondition: null,
    toxicCounter: 0,
    sleepCounter: 0,
    statStages: createStatStages(),
  };
}
```

- [ ] **Step 4: Normalize legacy battle-state saves missing `statStages`**

```ts
// src/core/battle-state-io.ts
import { createStatStages } from './stat-stages.js';

export function normalizeBattlePokemon(mon: BattlePokemon): void {
  if (mon.statusCondition === undefined) mon.statusCondition = null;
  if (mon.toxicCounter === undefined) mon.toxicCounter = 0;
  if (mon.sleepCounter === undefined || !Number.isFinite(mon.sleepCounter)) {
    mon.sleepCounter = 0;
  }
  if (mon.statStages === undefined) {
    mon.statStages = createStatStages();
  } else {
    mon.statStages.attack = Number.isFinite(mon.statStages.attack) ? mon.statStages.attack : 0;
    mon.statStages.defense = Number.isFinite(mon.statStages.defense) ? mon.statStages.defense : 0;
    mon.statStages.spAttack = Number.isFinite(mon.statStages.spAttack) ? mon.statStages.spAttack : 0;
    mon.statStages.spDefense = Number.isFinite(mon.statStages.spDefense) ? mon.statStages.spDefense : 0;
    mon.statStages.speed = Number.isFinite(mon.statStages.speed) ? mon.statStages.speed : 0;
    mon.statStages.accuracy = Number.isFinite(mon.statStages.accuracy) ? mon.statStages.accuracy : 0;
    mon.statStages.evasion = Number.isFinite(mon.statStages.evasion) ? mon.statStages.evasion : 0;
  }
}
```

- [ ] **Step 5: Update test helpers so every test Pokemon has stage storage**

```ts
// test/turn-battle.test.ts
import { createStatStages } from '../src/core/stat-stages.js';

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
    statStages: createStatStages(),
    ...overrides,
  };
}
```

- [ ] **Step 6: Extend migration tests for the new persisted field**

```ts
// test/battle-state-migration.test.ts
it('normalizeBattlePokemon backfills missing statStages to zeroes (v3b)', () => {
  const mon = makeLegacyPokemon();
  assert.equal((mon as any).statStages, undefined);
  normalizeBattlePokemon(mon);
  assert.deepEqual(mon.statStages, {
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  });
});
```

- [ ] **Step 7: Run the focused schema tests**

Run: `node --import tsx --test test/battle-state-migration.test.ts test/turn-battle.test.ts`  
Expected: PASS after later tasks complete

### Task 2: Stat Stages Module

**Files:**
- Add: `src/core/stat-stages.ts`
- Modify: `test/status-effects.test.ts`

- [ ] **Step 1: Create the stage factory and multiplier helpers**

```ts
// src/core/stat-stages.ts
import { t } from '../i18n/index.js';
import type { BattlePokemon, StatStages } from './types.js';

const MIN_STAGE = -6;
const MAX_STAGE = 6;

export function createStatStages(): StatStages {
  return {
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  };
}

export function getStatMultiplier(stage: number): number {
  return Math.max(2, 2 + stage) / Math.max(2, 2 - stage);
}

export function getAccEvaMultiplier(stage: number): number {
  return Math.max(3, 3 + stage) / Math.max(3, 3 - stage);
}
```

- [ ] **Step 2: Implement stat-name mapping and `applyStatChange()`**

```ts
// src/core/stat-stages.ts
const STAT_LABEL_KEYS: Record<keyof StatStages, string> = {
  attack: 'stat.name.attack',
  defense: 'stat.name.defense',
  spAttack: 'stat.name.sp_attack',
  spDefense: 'stat.name.sp_defense',
  speed: 'stat.name.speed',
  accuracy: 'stat.name.accuracy',
  evasion: 'stat.name.evasion',
};

export function applyStatChange(
  target: BattlePokemon,
  stat: keyof StatStages,
  delta: number,
  messages: string[],
): boolean {
  const current = target.statStages[stat];
  const next = Math.max(MIN_STAGE, Math.min(MAX_STAGE, current + delta));
  const statName = t(STAT_LABEL_KEYS[stat]);

  if (next === current) {
    messages.push(
      t(delta > 0 ? 'stat.cannot_rise' : 'stat.cannot_fall', {
        name: target.displayName,
        stat: statName,
      }),
    );
    return false;
  }

  target.statStages[stat] = next;
  const key =
    delta > 0
      ? (Math.abs(delta) >= 2 ? 'stat.rose_sharply' : 'stat.rose')
      : (Math.abs(delta) >= 2 ? 'stat.fell_harshly' : 'stat.fell');
  messages.push(t(key, { name: target.displayName, stat: statName }));
  return true;
}
```

- [ ] **Step 3: Implement reset helper**

```ts
// src/core/stat-stages.ts
export function resetStatStages(pokemon: BattlePokemon): void {
  pokemon.statStages = createStatStages();
}
```

- [ ] **Step 4: Add unit coverage for formulas, caps, and messages**

```ts
// test/status-effects.test.ts
import {
  applyStatChange,
  createStatStages,
  getAccEvaMultiplier,
  getStatMultiplier,
  resetStatStages,
} from '../src/core/stat-stages.js';

it('getStatMultiplier matches the battle-stage formula at +2 and -6', () => {
  assert.equal(getStatMultiplier(2), 2);
  assert.equal(getStatMultiplier(-6), 0.25);
});

it('getAccEvaMultiplier matches the accuracy/evasion formula at +1 and +6', () => {
  assert.equal(getAccEvaMultiplier(1), 4 / 3);
  assert.equal(getAccEvaMultiplier(6), 3);
});

it('applyStatChange clamps at +6 and emits cap messaging', () => {
  const mon = makePokemon({ statStages: { ...createStatStages(), attack: 6 } });
  const msgs: string[] = [];
  const changed = applyStatChange(mon, 'attack', 2, msgs);
  assert.equal(changed, false);
  assert.equal(mon.statStages.attack, 6);
  assert.match(msgs[0], /higher/i);
});
```

- [ ] **Step 5: Run the stat-stage helper tests**

Run: `node --import tsx --test test/status-effects.test.ts`  
Expected: PASS after i18n keys exist

### Task 3: i18n Messages

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/ko.json`

- [ ] **Step 1: Add English stat-stage messages**

```json
"stat.rose": "{name}'s {stat} rose!",
"stat.rose_sharply": "{name}'s {stat} rose sharply!",
"stat.fell": "{name}'s {stat} fell!",
"stat.fell_harshly": "{name}'s {stat} fell harshly!",
"stat.cannot_rise": "{name}'s {stat} won't go any higher!",
"stat.cannot_fall": "{name}'s {stat} won't go any lower!",
"stat.name.attack": "Attack",
"stat.name.defense": "Defense",
"stat.name.sp_attack": "Sp. Atk",
"stat.name.sp_defense": "Sp. Def",
"stat.name.speed": "Speed",
"stat.name.accuracy": "Accuracy",
"stat.name.evasion": "Evasion"
```

- [ ] **Step 2: Add Korean stat-stage messages**

```json
"stat.rose": "{name}의 {stat}이(가) 올라갔다!",
"stat.rose_sharply": "{name}의 {stat}이(가) 크게 올라갔다!",
"stat.fell": "{name}의 {stat}이(가) 내려갔다!",
"stat.fell_harshly": "{name}의 {stat}이(가) 크게 내려갔다!",
"stat.cannot_rise": "{name}의 {stat}은(는) 더이상 올라가지 않는다!",
"stat.cannot_fall": "{name}의 {stat}은(는) 더이상 내려가지 않는다!",
"stat.name.attack": "공격",
"stat.name.defense": "방어",
"stat.name.sp_attack": "특수공격",
"stat.name.sp_defense": "특수방어",
"stat.name.speed": "스피드",
"stat.name.accuracy": "명중률",
"stat.name.evasion": "회피율"
```

- [ ] **Step 3: Verify the dictionaries still parse**

Run: `node --import tsx -e "import en from './src/i18n/en.json' with { type: 'json' }; import ko from './src/i18n/ko.json' with { type: 'json' }; console.log(Object.keys(en).length, Object.keys(ko).length)"`  
Expected: two counts printed, no JSON parse error

### Task 4: Move Data

**Files:**
- Modify: `data/moves.json`

- [ ] **Step 1: Add `statChanges` to existing debuff and damaging moves**

```json
"94": {
  "id": 94,
  "name": "psychic",
  "nameKo": "사이코키네시스",
  "nameEn": "Psychic",
  "type": "psychic",
  "category": "special",
  "power": 90,
  "accuracy": 100,
  "pp": 10,
  "statChanges": [
    { "target": "opponent", "stat": "spDefense", "stages": -1, "chance": 10 }
  ]
}
```

```json
"196": {
  "id": 196,
  "name": "icy-wind",
  "nameKo": "얼다바람",
  "nameEn": "Icy Wind",
  "type": "ice",
  "category": "special",
  "power": 55,
  "accuracy": 95,
  "pp": 15,
  "statChanges": [
    { "target": "opponent", "stat": "speed", "stages": -1, "chance": 100 }
  ]
}
```

- [ ] **Step 2: Add self-buff status moves with explicit stage arrays**

```json
"14": {
  "id": 14,
  "name": "swords-dance",
  "nameKo": "칼춤",
  "nameEn": "Swords Dance",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": null,
  "pp": 20,
  "statChanges": [
    { "target": "self", "stat": "attack", "stages": 2, "chance": 100 }
  ]
}
```

```json
"349": {
  "id": 349,
  "name": "dragon-dance",
  "nameKo": "용의춤",
  "nameEn": "Dragon Dance",
  "type": "dragon",
  "category": "status",
  "power": 0,
  "accuracy": null,
  "pp": 20,
  "statChanges": [
    { "target": "self", "stat": "attack", "stages": 1, "chance": 100 },
    { "target": "self", "stat": "speed", "stages": 1, "chance": 100 }
  ]
}
```

- [ ] **Step 3: Add opponent-debuff status moves**

```json
"45": {
  "id": 45,
  "name": "growl",
  "nameKo": "울음소리",
  "nameEn": "Growl",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": 100,
  "pp": 40,
  "statChanges": [
    { "target": "opponent", "stat": "attack", "stages": -1, "chance": 100 }
  ]
}
```

```json
"230": {
  "id": 230,
  "name": "sweet-scent",
  "nameKo": "달콤한향기",
  "nameEn": "Sweet Scent",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": 100,
  "pp": 20,
  "statChanges": [
    { "target": "opponent", "stat": "evasion", "stages": -2, "chance": 100 }
  ]
}
```

- [ ] **Step 4: Verify move-data integrity and schema shape**

Run: `node --import tsx -e "import moves from './data/moves.json' with { type: 'json' }; for (const name of ['swords-dance','nasty-plot','dragon-dance','calm-mind','iron-defense','agility','growl','tail-whip','leer','string-shot','charm','screech','scary-face','sweet-scent','seed-bomb','crunch','icy-wind','rock-smash','psychic','flash-cannon','mystical-fire','acid-spray','bug-buzz','aurora-beam','shadow-ball']) { const move = Object.values(moves).find((m: any) => m.name === name); if (!move) throw new Error('missing ' + name); } console.log('move-data-ok')"`  
Expected: `move-data-ok`

### Task 5: Battle Engine Damage Integration

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Apply stage multipliers inside `calculateDamage()`**

```ts
// src/core/turn-battle.ts
import { getStatMultiplier } from './stat-stages.js';

function calculateDamage(attacker: BattlePokemon, defender: BattlePokemon, move: MoveData): number {
  const isPhysical = move.category === 'physical';
  const attackStat = isPhysical ? attacker.attack : attacker.spAttack;
  const defenseStat = isPhysical ? defender.defense : defender.spDefense;
  const attackStage = isPhysical ? attacker.statStages.attack : attacker.statStages.spAttack;
  const defenseStage = isPhysical ? defender.statStages.defense : defender.statStages.spDefense;

  const effectiveAttack =
    attackStat *
    getStatMultiplier(attackStage) *
    (isPhysical ? getBurnAttackMultiplier(attacker) : 1);
  const effectiveDefense = defenseStat * getStatMultiplier(defenseStage);

  // keep the existing STAB / type / random / base-damage math
}
```

- [ ] **Step 2: Add damage regression coverage**

```ts
// test/turn-battle.test.ts
it('damage increases with positive attack stages', () => {
  const move = makeMoveData({ category: 'physical', power: 80 });
  const neutral = calculateDamage(
    makeTestPokemon({ statStages: createStatStages() }),
    makeTestPokemon({ displayName: 'Defender', statStages: createStatStages() }),
    move,
  );
  const boosted = calculateDamage(
    makeTestPokemon({ statStages: { ...createStatStages(), attack: 2 } }),
    makeTestPokemon({ displayName: 'Defender', statStages: createStatStages() }),
    move,
  );
  assert.ok(boosted > neutral);
});
```

- [ ] **Step 3: Verify defense drops matter as well**

```ts
// test/turn-battle.test.ts
it('damage increases when the defender has negative defense stages', () => {
  const move = makeMoveData({ category: 'special', power: 90 });
  const neutral = calculateDamage(
    makeTestPokemon({ statStages: createStatStages() }),
    makeTestPokemon({ displayName: 'Defender', statStages: createStatStages() }),
    move,
  );
  const dropped = calculateDamage(
    makeTestPokemon({ statStages: createStatStages() }),
    makeTestPokemon({
      displayName: 'Defender',
      statStages: { ...createStatStages(), spDefense: -2 },
    }),
    move,
  );
  assert.ok(dropped > neutral);
});
```

- [ ] **Step 4: Run battle-engine damage tests**

Run: `node --import tsx --test test/turn-battle.test.ts --test-name-pattern "damage|attack stages|defense stages|burn"`  
Expected: PASS

### Task 6: Battle Engine Accuracy + Speed Integration

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Update `checkAccuracy()` to use attacker accuracy and defender evasion**

```ts
// src/core/turn-battle.ts
import { getAccEvaMultiplier, getStatMultiplier } from './stat-stages.js';

function checkAccuracy(attacker: BattlePokemon, defender: BattlePokemon, move: MoveData): boolean {
  if (move.accuracy === null) return true;
  const hitChance =
    move.accuracy *
    getAccEvaMultiplier(attacker.statStages.accuracy) /
    getAccEvaMultiplier(defender.statStages.evasion);
  return Math.random() * 100 < hitChance;
}
```

- [ ] **Step 2: Thread the new `checkAccuracy(attacker, defender, move)` signature through `executeMove()`**

```ts
// src/core/turn-battle.ts
if (!checkAccuracy(attacker, defender, move.data)) {
  messages.push(t('battle.miss', { name: attacker.displayName }));
  return;
}
```

- [ ] **Step 3: Apply speed stages in turn-order resolution**

```ts
// src/core/turn-battle.ts
const playerSpeed =
  player.speed *
  getStatMultiplier(player.statStages.speed) *
  getParalysisSpeedMultiplier(player);
const opponentSpeed =
  opponent.speed *
  getStatMultiplier(opponent.statStages.speed) *
  getParalysisSpeedMultiplier(opponent);
```

- [ ] **Step 4: Add accuracy/evasion and speed tests**

```ts
// test/turn-battle.test.ts
it('accuracy stages improve hit chance and evasion stages reduce it', () => {
  const move = makeMoveData({ accuracy: 75 });
  const attacker = makeTestPokemon({ statStages: { ...createStatStages(), accuracy: 2 } });
  const defender = makeTestPokemon({
    displayName: 'Defender',
    statStages: { ...createStatStages(), evasion: 0 },
  });
  const hit = checkAccuracy(attacker, defender, move);
  assert.equal(typeof hit, 'boolean');
});

it('speed stages can flip turn order', () => {
  const slowButBoosted = makeTestPokemon({
    speed: 50,
    statStages: { ...createStatStages(), speed: 2 },
  });
  const fastButDropped = makeTestPokemon({
    displayName: 'Faster',
    speed: 90,
    statStages: { ...createStatStages(), speed: -2 },
  });
  assert.ok(
    50 * getStatMultiplier(2) > 90 * getStatMultiplier(-2),
    'boosted slower mon should now move first',
  );
});
```

- [ ] **Step 5: Run the accuracy/speed test slice**

Run: `node --import tsx --test test/turn-battle.test.ts --test-name-pattern "accuracy|evasion|speed|turn order"`  
Expected: PASS

### Task 7: Battle Engine Effect Application

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Add a helper that resolves `statChanges` after a successful hit or status move**

```ts
// src/core/turn-battle.ts
import { applyStatChange, resetStatStages } from './stat-stages.js';

function applyMoveStatChanges(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: MoveData,
  messages: string[],
): void {
  for (const change of move.statChanges ?? []) {
    if (Math.random() * 100 >= change.chance) continue;
    const target = change.target === 'self' ? attacker : defender;
    applyStatChange(target, change.stat, change.stages, messages);
  }
}
```

- [ ] **Step 2: Call the helper at the right point in `executeMove()`**

```ts
// src/core/turn-battle.ts
if (move.data.power > 0 && damage > 0 && !defender.fainted) {
  applyMoveStatChanges(attacker, defender, move.data, messages);
}

if (move.data.power === 0) {
  applyMoveStatChanges(attacker, defender, move.data, messages);
}
```

- [ ] **Step 3: Reset stages on the switching-in Pokemon**

```ts
// src/core/turn-battle.ts
function executeSwitch(team: BattleTeam, nextIndex: number, messages: string[]): void {
  team.activeIndex = nextIndex;
  const active = team.pokemon[nextIndex];
  active.toxicCounter = active.statusCondition === 'badly_poisoned' ? active.toxicCounter : 0;
  resetStatStages(active);
  messages.push(t('battle.switch', { name: active.displayName }));
}
```

- [ ] **Step 4: Add integration tests for self-buffs, debuffs, secondaries, and switch reset**

```ts
// test/turn-battle.test.ts
it('status buff moves apply to the user', () => {
  const attacker = makeTestPokemon({
    moves: [{
      data: makeMoveData({
        name: 'swords-dance',
        category: 'status',
        power: 0,
        accuracy: null,
        statChanges: [{ target: 'self', stat: 'attack', stages: 2, chance: 100 }],
      }),
      currentPp: 20,
    }],
  });
  const defender = makeTestPokemon({ displayName: 'Defender' });
  executeMove(attacker, defender, 0, []);
  assert.equal(attacker.statStages.attack, 2);
});

it('damaging moves can apply post-hit secondary stat drops', () => {
  const attacker = makeTestPokemon({
    moves: [{
      data: makeMoveData({
        name: 'icy-wind',
        category: 'special',
        power: 55,
        statChanges: [{ target: 'opponent', stat: 'speed', stages: -1, chance: 100 }],
      }),
      currentPp: 15,
    }],
  });
  const defender = makeTestPokemon({ displayName: 'Defender' });
  executeMove(attacker, defender, 0, []);
  assert.equal(defender.statStages.speed, -1);
});
```

- [ ] **Step 5: Run the effect-application test slice**

Run: `node --import tsx --test test/turn-battle.test.ts --test-name-pattern "buff|debuff|secondary|switch resets"`  
Expected: PASS

### Task 8: Gym AI Enhancement

**Files:**
- Modify: `src/core/gym-ai.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Add helpers that identify stat-only setup moves**

```ts
// src/core/gym-ai.ts
function getHpRatio(pokemon: BattlePokemon): number {
  return pokemon.maxHp > 0 ? pokemon.currentHp / pokemon.maxHp : 0;
}

function averageStages(mon: BattlePokemon, stats: Array<keyof BattlePokemon['statStages']>): number {
  return stats.reduce((sum, stat) => sum + mon.statStages[stat], 0) / stats.length;
}
```

- [ ] **Step 2: Score self-buffs and opponent-debuffs using the requested heuristic**

```ts
// src/core/gym-ai.ts
function scoreStatChangeMove(attacker: BattlePokemon, defender: BattlePokemon, move: BattlePokemon['moves'][number]): number {
  const changes = move.data.statChanges ?? [];
  if (changes.length === 0) return 0;

  const selfChanges = changes.filter((c) => c.target === 'self' && c.stages > 0);
  if (selfChanges.length > 0) {
    const stats = selfChanges.map((c) => c.stat);
    if (stats.every((stat) => attacker.statStages[stat] >= 6)) return 0;
    const currentStageAverage = averageStages(attacker, stats);
    return Math.max(0, 50 * (1 - currentStageAverage / 6));
  }

  const opponentChanges = changes.filter((c) => c.target === 'opponent' && c.stages < 0);
  if (opponentChanges.length > 0) {
    if (getHpRatio(defender) <= 0.5) return 0;
    const targetStat = opponentChanges[0].stat;
    if (defender.statStages[targetStat] <= -6) return 0;
    const normalized = Math.max(0, Math.min(1, defender.statStages[targetStat] / 6));
    return 40 * (1 - normalized);
  }

  return 0;
}
```

- [ ] **Step 3: Keep damage-with-secondary-drop moves on the normal damage path**

```ts
// src/core/gym-ai.ts
if (move.data.power === 0 && move.data.statChanges?.length) {
  return { index, score: scoreStatChangeMove(attacker, defender, move) };
}

const stab = attacker.types.includes(move.data.type) ? 1.5 : 1.0;
const power = move.data.power || 0;
return { index, score: power * stab * typeEff };
```

- [ ] **Step 4: Add AI regression tests**

```ts
// test/turn-battle.test.ts
it('AI prefers self-buff setup when its own stages are low', async () => {
  const { selectAiMove } = await import('../src/core/gym-ai.js');
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
  const choice = selectAiMove(attacker, defender);
  assert.equal(choice, 0);
});

it('AI gives zero setup score when already capped', async () => {
  const { selectAiMove } = await import('../src/core/gym-ai.js');
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
```

- [ ] **Step 5: Run AI coverage**

Run: `node --import tsx --test test/turn-battle.test.ts --test-name-pattern "AI"`  
Expected: PASS

### Task 9: Final Verification

**Files:**
- Verify: `src/core/types.ts`
- Verify: `src/core/stat-stages.ts`
- Verify: `src/core/turn-battle.ts`
- Verify: `src/core/gym-ai.ts`
- Verify: `src/core/battle-state-io.ts`
- Verify: `src/i18n/en.json`
- Verify: `src/i18n/ko.json`
- Verify: `data/moves.json`
- Verify: `test/status-effects.test.ts`
- Verify: `test/turn-battle.test.ts`
- Verify: `test/battle-state-migration.test.ts`

- [ ] **Step 1: Run the full targeted test suite**

Run: `node --import tsx --test test/status-effects.test.ts test/turn-battle.test.ts test/battle-state-migration.test.ts`

- [ ] **Step 2: Run TypeScript checking**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Re-verify the move catalog for every v3b move**

Run: `node --import tsx -e "import moves from './data/moves.json' with { type: 'json' }; const expected = ['swords-dance','nasty-plot','dragon-dance','calm-mind','iron-defense','agility','growl','tail-whip','leer','string-shot','charm','screech','scary-face','sweet-scent','seed-bomb','crunch','icy-wind','rock-smash','psychic','flash-cannon','mystical-fire','acid-spray','bug-buzz','aurora-beam','shadow-ball']; for (const name of expected) { const move = Object.values(moves).find((m: any) => m.name === name); if (!move) throw new Error('missing ' + name); if (!('statChanges' in (move as any))) throw new Error('missing statChanges for ' + name); } console.log('verified', expected.length)"`  
Expected: `verified 25`

- [ ] **Step 4: Acceptance checklist**

- [ ] Stat stages clamp to `[-6, +6]`
- [ ] Battle-stat multiplier formula is correct for `-6..+6`
- [ ] Accuracy/evasion multiplier formula is correct
- [ ] Damage uses attack/defense or special attack/special defense stages
- [ ] Accuracy uses attacker accuracy and defender evasion stages
- [ ] Turn order uses speed stages
- [ ] Switching resets stat stages
- [ ] Self-buff status moves apply to self
- [ ] Opponent-debuff status moves apply to opponent
- [ ] Damaging secondary stat drops resolve correctly
- [ ] Cap messages appear at `+6` and `-6`
- [ ] AI uses setup early when stages are low
- [ ] AI avoids useless setup at cap
- [ ] English and Korean messages exist for all stat-stage strings
- [ ] Legacy battle-state migration backfills `statStages`
