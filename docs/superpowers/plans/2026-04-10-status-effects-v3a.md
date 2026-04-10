# Status Effects v3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sleep and Freeze to the existing v2 Tokenmon battle status system, including engine rules, move data, UI labels, i18n, and regression tests.

**Architecture:** Extend the existing v2 non-volatile status pipeline instead of introducing a new subsystem. Sleep and freeze remain pure `statusCondition`-driven effects, with `sleepCounter` stored on `BattlePokemon`, pre-move skip helpers in `src/core/status-effects.ts`, and narrow battle-engine integration inside `executeMove()`.

**Tech Stack:** TypeScript, Node.js built-in test runner, JSON move data, existing i18n JSON dictionaries, battle TUI renderer.

---

## File Map

- `src/core/types.ts`: status union + `BattlePokemon.sleepCounter`
- `src/core/status-effects.ts`: sleep/freeze rules, immunities, exception moves, status application helpers
- `src/core/turn-battle.ts`: pre-move sleep/freeze integration and fire-thaw battle flow
- `src/core/gym-ai.ts`: confirm no heuristic change is needed
- `src/i18n/en.json`: English messages and labels
- `src/i18n/ko.json`: Korean messages and labels
- `src/battle-tui/renderer.ts`: battle log status color rendering
- `src/status-line.ts`: compact status badges
- `data/moves.json`: new sleep moves + freeze secondary effects
- `test/status-effects.test.ts`: unit coverage for sleep/freeze helpers
- `test/turn-battle.test.ts`: battle-flow regressions

### Task 1: Extend Types

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Extend `StatusCondition` in `src/core/types.ts`**

```ts
// src/core/types.ts
export type StatusCondition =
  | 'burn'
  | 'poison'
  | 'badly_poisoned'
  | 'paralysis'
  | 'sleep'
  | 'freeze';
```

- [ ] **Step 2: Extend `BattlePokemon` with `sleepCounter`**

```ts
// src/core/types.ts
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
}
```

- [ ] **Step 3: Initialize `sleepCounter` in `createBattlePokemon()`**

```ts
// src/core/turn-battle.ts
export function createBattlePokemon(
  input: CreateBattlePokemonInput,
  moves: MoveData[],
): BattlePokemon {
  const { id, types, level, baseStats } = input;
  const maxHp = calculateHp(baseStats.hp, level);

  const spAttackBase = baseStats.sp_attack ?? baseStats.attack;
  const spDefenseBase = baseStats.sp_defense ?? baseStats.defense;

  return {
    id,
    name: String(id),
    displayName: input.displayName ?? String(id),
    types,
    level,
    maxHp,
    currentHp: maxHp,
    attack: calculateStat(baseStats.attack, level),
    defense: calculateStat(baseStats.defense, level),
    spAttack: calculateStat(spAttackBase, level),
    spDefense: calculateStat(spDefenseBase, level),
    speed: calculateStat(baseStats.speed, level),
    moves: moves.map((m) => ({ data: m, currentPp: m.pp })),
    fainted: false,
    statusCondition: null,
    toxicCounter: 0,
    sleepCounter: 0,
  };
}
```

- [ ] **Step 4: Update `makeTestPokemon()` to include `sleepCounter`**

```ts
// test/turn-battle.test.ts
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
```

- [ ] **Step 5: Add type-level regression tests for the new default field**

```ts
// test/turn-battle.test.ts
describe('createBattlePokemon', () => {
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
```

- [ ] **Step 6: Run the focused tests**

Run: `node --import tsx --test test/turn-battle.test.ts`  
Expected: PASS after the remaining plan tasks are complete

### Task 2: Status Effects Module Updates

**Files:**
- Modify: `src/core/status-effects.ts`
- Modify: `test/status-effects.test.ts`

- [ ] **Step 1: Replace `src/core/status-effects.ts` with the full updated implementation**

```ts
// src/core/status-effects.ts
import { t } from '../i18n/index.js';
import type { BattleMove, BattlePokemon, StatusCondition } from './types.js';

const STATUS_IMMUNITIES: Record<StatusCondition, string[]> = {
  poison: ['poison', 'steel'],
  badly_poisoned: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
  sleep: [],
  freeze: ['ice'],
};

export const FROZEN_EXCEPTION_MOVES = new Set([
  'flame-wheel',
  'sacred-fire',
  'scald',
  'flare-blitz',
  'steam-eruption',
  'burn-up',
]);

export function isStatusImmune(pokemon: BattlePokemon, status: StatusCondition): boolean {
  const immuneTypes = STATUS_IMMUNITIES[status];
  return pokemon.types.some((type) => immuneTypes.includes(type));
}

export function tryApplyStatus(target: BattlePokemon, status: StatusCondition, messages: string[]): boolean {
  if (target.fainted) return false;
  if (target.statusCondition !== null) {
    messages.push(t('status.already', { name: target.displayName }));
    return false;
  }
  if (isStatusImmune(target, status)) {
    messages.push(t('status.immune', { name: target.displayName }));
    return false;
  }

  target.statusCondition = status;

  if (status === 'badly_poisoned') {
    target.toxicCounter = 1;
  }

  if (status === 'sleep') {
    target.sleepCounter = Math.floor(Math.random() * 3) + 1;
  } else {
    target.sleepCounter = 0;
  }

  messages.push(t(`status.${status}.inflicted`, { name: target.displayName }));
  return true;
}

export function getParalysisSpeedMultiplier(pokemon: BattlePokemon): number {
  return pokemon.statusCondition === 'paralysis' ? 0.5 : 1.0;
}

export function getBurnAttackMultiplier(pokemon: BattlePokemon): number {
  return pokemon.statusCondition === 'burn' ? 0.5 : 1.0;
}

export function checkSleepSkip(pokemon: BattlePokemon, messages: string[]): boolean {
  if (pokemon.statusCondition !== 'sleep') return false;

  pokemon.sleepCounter = Math.max(0, pokemon.sleepCounter - 1);

  if (pokemon.sleepCounter === 0) {
    pokemon.statusCondition = null;
    messages.push(t('status.sleep.wake', { name: pokemon.displayName }));
    return true;
  }

  messages.push(t('status.sleep.still_asleep', { name: pokemon.displayName }));
  return true;
}

export function checkFreezeSkip(
  pokemon: BattlePokemon,
  move: BattleMove,
  messages: string[],
): boolean {
  if (pokemon.statusCondition !== 'freeze') return false;

  if (FROZEN_EXCEPTION_MOVES.has(move.data.name)) {
    pokemon.statusCondition = null;
    messages.push(t('status.freeze.thawed', { name: pokemon.displayName }));
    return false;
  }

  if (Math.random() < 0.2) {
    pokemon.statusCondition = null;
    messages.push(t('status.freeze.thawed', { name: pokemon.displayName }));
    return false;
  }

  messages.push(t('status.freeze.still_frozen', { name: pokemon.displayName }));
  return true;
}

export function checkParalysisSkip(pokemon: BattlePokemon, messages: string[]): boolean {
  if (pokemon.statusCondition !== 'paralysis') return false;
  if (Math.random() < 0.25) {
    messages.push(t('status.paralysis.immobile', { name: pokemon.displayName }));
    return true;
  }
  return false;
}

export function applyEndOfTurnEffects(pokemon: BattlePokemon, messages: string[]): boolean {
  if (pokemon.fainted || pokemon.statusCondition === null) return false;
  let damage = 0;
  switch (pokemon.statusCondition) {
    case 'burn':
      damage = Math.max(1, Math.floor(pokemon.maxHp / 16));
      messages.push(t('status.burn.damage', { name: pokemon.displayName }));
      break;
    case 'poison':
      damage = Math.max(1, Math.floor(pokemon.maxHp / 8));
      messages.push(t('status.poison.damage', { name: pokemon.displayName }));
      break;
    case 'badly_poisoned':
      damage = Math.max(1, Math.floor((pokemon.maxHp * pokemon.toxicCounter) / 16));
      messages.push(t('status.poison.damage', { name: pokemon.displayName }));
      pokemon.toxicCounter++;
      break;
    case 'paralysis':
    case 'sleep':
    case 'freeze':
      return false;
  }
  if (damage > 0) {
    pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
    if (pokemon.currentHp <= 0) {
      pokemon.fainted = true;
      messages.push(t('status.fainted_by_status', { name: pokemon.displayName }));
      return true;
    }
  }
  return false;
}

export function rollMoveEffect(
  move: { effect?: { type: StatusCondition; chance: number } },
  target: BattlePokemon,
  messages: string[],
): void {
  if (!move.effect) return;
  if (Math.random() * 100 >= move.effect.chance) return;
  tryApplyStatus(target, move.effect.type, messages);
}
```

- [ ] **Step 2: Update the test helper in `test/status-effects.test.ts`**

```ts
// test/status-effects.test.ts
function makePokemon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    id: 1, name: '1', displayName: 'Test', types: ['normal'], level: 50,
    maxHp: 160, currentHp: 160, attack: 60, defense: 50, spAttack: 55,
    spDefense: 50, speed: 70, moves: [], fainted: false,
    statusCondition: null, toxicCounter: 0, sleepCounter: 0, ...overrides,
  };
}
```

- [ ] **Step 3: Update imports and add full helper coverage in `test/status-effects.test.ts`**

```ts
// test/status-effects.test.ts
import {
  isStatusImmune,
  tryApplyStatus,
  checkParalysisSkip,
  checkSleepSkip,
  checkFreezeSkip,
  FROZEN_EXCEPTION_MOVES,
  getBurnAttackMultiplier,
  getParalysisSpeedMultiplier,
  applyEndOfTurnEffects,
} from '../src/core/status-effects.js';
```

```ts
// test/status-effects.test.ts
describe('isStatusImmune', () => {
  it('ice type immune to freeze', () => {
    assert.equal(isStatusImmune(makePokemon({ types: ['ice'] }), 'freeze'), true);
  });

  it('normal type not immune to sleep', () => {
    assert.equal(isStatusImmune(makePokemon({ types: ['normal'] }), 'sleep'), false);
  });
});

describe('tryApplyStatus', () => {
  it('inits sleepCounter for sleep in the 1..3 range', () => {
    const mon = makePokemon();
    const origRandom = Math.random;
    try {
      Math.random = () => 0.6; // floor(1.8) + 1 = 2
      assert.equal(tryApplyStatus(mon, 'sleep', []), true);
      assert.equal(mon.statusCondition, 'sleep');
      assert.equal(mon.sleepCounter, 2);
    } finally {
      Math.random = origRandom;
    }
  });

  it('blocks freeze on ice types', () => {
    const mon = makePokemon({ types: ['ice'] });
    assert.equal(tryApplyStatus(mon, 'freeze', []), false);
    assert.equal(mon.statusCondition, null);
  });
});

describe('checkSleepSkip', () => {
  it('sleeping pokemon stays asleep when counter remains above zero', () => {
    const mon = makePokemon({ statusCondition: 'sleep', sleepCounter: 3 });
    const messages: string[] = [];
    assert.equal(checkSleepSkip(mon, messages), true);
    assert.equal(mon.statusCondition, 'sleep');
    assert.equal(mon.sleepCounter, 2);
    assert.ok(messages.some((m) => m.includes('잠들어')));
  });

  it('sleeping pokemon wakes when counter reaches zero but still skips turn', () => {
    const mon = makePokemon({ statusCondition: 'sleep', sleepCounter: 1 });
    const messages: string[] = [];
    assert.equal(checkSleepSkip(mon, messages), true);
    assert.equal(mon.statusCondition, null);
    assert.equal(mon.sleepCounter, 0);
    assert.ok(messages.some((m) => m.includes('깨어났다')));
  });
});

describe('checkFreezeSkip', () => {
  it('frozen pokemon skips when thaw roll fails', () => {
    const mon = makePokemon({ statusCondition: 'freeze' });
    const move = { data: { name: 'tackle' } } as any;
    const messages: string[] = [];
    const origRandom = Math.random;
    try {
      Math.random = () => 0.9;
      assert.equal(checkFreezeSkip(mon, move, messages), true);
      assert.equal(mon.statusCondition, 'freeze');
      assert.ok(messages.some((m) => m.includes('얼어붙어')));
    } finally {
      Math.random = origRandom;
    }
  });

  it('frozen pokemon thaws on successful thaw roll', () => {
    const mon = makePokemon({ statusCondition: 'freeze' });
    const move = { data: { name: 'tackle' } } as any;
    const messages: string[] = [];
    const origRandom = Math.random;
    try {
      Math.random = () => 0.1;
      assert.equal(checkFreezeSkip(mon, move, messages), false);
      assert.equal(mon.statusCondition, null);
      assert.ok(messages.some((m) => m.includes('녹았다')));
    } finally {
      Math.random = origRandom;
    }
  });

  it('exception moves can be used while frozen and thaw the user', () => {
    const mon = makePokemon({ statusCondition: 'freeze' });
    const move = { data: { name: 'scald' } } as any;
    const messages: string[] = [];
    assert.ok(FROZEN_EXCEPTION_MOVES.has('scald'));
    assert.equal(checkFreezeSkip(mon, move, messages), false);
    assert.equal(mon.statusCondition, null);
    assert.ok(messages.some((m) => m.includes('녹았다')));
  });
});
```

- [ ] **Step 4: Run the focused unit suite**

Run: `node --import tsx --test test/status-effects.test.ts`  
Expected: PASS after the corresponding i18n keys exist

### Task 3: i18n Messages

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/ko.json`

- [ ] **Step 1: Add English sleep/freeze keys**

```json
"status.sleep.inflicted": "{name} fell asleep!",
"status.sleep.wake": "{name} woke up!",
"status.sleep.still_asleep": "{name} is fast asleep!",
"status.freeze.inflicted": "{name} was frozen solid!",
"status.freeze.thawed": "{name} thawed out!",
"status.freeze.still_frozen": "{name} is frozen solid!",
"status.label.sleep": "SLP",
"status.label.freeze": "FRZ",
"status.name.sleep": "sleep",
"status.name.freeze": "freeze"
```

- [ ] **Step 2: Add Korean sleep/freeze keys**

```json
"status.sleep.inflicted": "{name:은/는} 잠들었다!",
"status.sleep.wake": "{name:은/는} 잠에서 깨어났다!",
"status.sleep.still_asleep": "{name:은/는} 곤히 잠들어 있다!",
"status.freeze.inflicted": "{name:은/는} 얼어붙었다!",
"status.freeze.thawed": "{name:은/는} 얼음이 녹았다!",
"status.freeze.still_frozen": "{name:은/는} 얼어붙어 움직일 수 없다!",
"status.label.sleep": "수면",
"status.label.freeze": "빙결",
"status.name.sleep": "수면",
"status.name.freeze": "빙결"
```

- [ ] **Step 3: Place the keys into the existing status section**

Use the existing ordering style around:

```json
"status.paralysis.inflicted": "...",
"status.burn.inflicted": "...",
"status.poison.inflicted": "...",
"status.badly_poisoned.inflicted": "...",
"status.already": "...",
"status.immune": "...",
"status.fainted_by_status": "...",
"status.name.burn": "...",
"status.name.poison": "...",
"status.name.paralysis": "...",
"status.label.burn": "...",
"status.label.poison": "...",
"status.label.badly_poisoned": "...",
"status.label.paralysis": "..."
```

- [ ] **Step 4: Validate JSON formatting**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('src/i18n/en.json','utf8')); JSON.parse(require('node:fs').readFileSync('src/i18n/ko.json','utf8'))"`  
Expected: no output, exit code 0

### Task 4: Move Data

**Files:**
- Modify: `data/moves.json`

- [ ] **Step 1: Add the missing sleep-inducing status moves**

```json
"47": {
  "id": 47,
  "name": "sing",
  "nameKo": "노래하기",
  "nameEn": "Sing",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": 55,
  "pp": 15,
  "effect": {
    "type": "sleep",
    "chance": 100
  }
},
"79": {
  "id": 79,
  "name": "sleep-powder",
  "nameKo": "수면가루",
  "nameEn": "Sleep Powder",
  "type": "grass",
  "category": "status",
  "power": 0,
  "accuracy": 75,
  "pp": 15,
  "effect": {
    "type": "sleep",
    "chance": 100
  }
},
"95": {
  "id": 95,
  "name": "hypnosis",
  "nameKo": "최면술",
  "nameEn": "Hypnosis",
  "type": "psychic",
  "category": "status",
  "power": 0,
  "accuracy": 60,
  "pp": 20,
  "effect": {
    "type": "sleep",
    "chance": 100
  }
},
"142": {
  "id": 142,
  "name": "lovely-kiss",
  "nameKo": "악마의키스",
  "nameEn": "Lovely Kiss",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": 75,
  "pp": 10,
  "effect": {
    "type": "sleep",
    "chance": 100
  }
},
"147": {
  "id": 147,
  "name": "spore",
  "nameKo": "버섯포자",
  "nameEn": "Spore",
  "type": "grass",
  "category": "status",
  "power": 0,
  "accuracy": 100,
  "pp": 15,
  "effect": {
    "type": "sleep",
    "chance": 100
  }
}
```

- [ ] **Step 2: Add freeze secondary effects to the existing ice attacks**

```json
"8": {
  "id": 8,
  "name": "ice-punch",
  "nameKo": "냉동펀치",
  "nameEn": "Ice Punch",
  "type": "ice",
  "category": "physical",
  "power": 75,
  "accuracy": 100,
  "pp": 15,
  "effect": {
    "type": "freeze",
    "chance": 10
  }
}
```

```json
"58": {
  "id": 58,
  "name": "ice-beam",
  "nameKo": "냉동빔",
  "nameEn": "Ice Beam",
  "type": "ice",
  "category": "special",
  "power": 90,
  "accuracy": 100,
  "pp": 10,
  "effect": {
    "type": "freeze",
    "chance": 10
  }
}
```

```json
"59": {
  "id": 59,
  "name": "blizzard",
  "nameKo": "눈보라",
  "nameEn": "Blizzard",
  "type": "ice",
  "category": "special",
  "power": 110,
  "accuracy": 70,
  "pp": 5,
  "effect": {
    "type": "freeze",
    "chance": 10
  }
}
```

```json
"181": {
  "id": 181,
  "name": "powder-snow",
  "nameKo": "눈싸라기",
  "nameEn": "Powder Snow",
  "type": "ice",
  "category": "special",
  "power": 40,
  "accuracy": 100,
  "pp": 25,
  "effect": {
    "type": "freeze",
    "chance": 10
  }
}
```

```json
"573": {
  "id": 573,
  "name": "freeze-dry",
  "nameKo": "프리즈드라이",
  "nameEn": "Freeze-Dry",
  "type": "ice",
  "category": "special",
  "power": 70,
  "accuracy": 100,
  "pp": 20,
  "effect": {
    "type": "freeze",
    "chance": 10
  }
}
```

- [ ] **Step 3: Do not add `yawn` in v3a**

Keep `yawn` out of this file change. Delayed sleep belongs to a later version.

- [ ] **Step 4: Validate the move JSON**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('data/moves.json','utf8'))"`  
Expected: no output, exit code 0

### Task 5: Battle Engine Integration

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Update status helper imports in `src/core/turn-battle.ts`**

```ts
// src/core/turn-battle.ts
import {
  getParalysisSpeedMultiplier,
  getBurnAttackMultiplier,
  checkSleepSkip,
  checkFreezeSkip,
  checkParalysisSkip,
  applyEndOfTurnEffects,
  rollMoveEffect,
} from './status-effects.js';
```

- [ ] **Step 2: Insert sleep/freeze checks before paralysis**

```ts
// src/core/turn-battle.ts — inside executeMove()
  if (!isStruggle && checkSleepSkip(attacker, messages)) {
    return { defenderFainted: false };
  }

  if (!isStruggle && checkFreezeSkip(attacker, move, messages)) {
    return { defenderFainted: false };
  }

  if (!isStruggle && checkParalysisSkip(attacker, messages)) {
    return { defenderFainted: false };
  }
```

- [ ] **Step 3: Thaw frozen defenders before fire damage**

```ts
// src/core/turn-battle.ts — after moveTypeImmune is computed, before damage
  if (
    defender.statusCondition === 'freeze' &&
    move.data.type === 'fire' &&
    !moveTypeImmune
  ) {
    defender.statusCondition = null;
    messages.push(t('status.freeze.thawed', { name: defender.displayName }));
  }

  const damage = calculateDamage(attacker, defender, move);
  defender.currentHp = Math.max(0, defender.currentHp - damage);
```

- [ ] **Step 4: Import `t` if it is not already available in this module**

```ts
// src/core/turn-battle.ts
import { t } from '../i18n/index.js';
```

- [ ] **Step 5: Extend `makeTestPokemon()` and add targeted regression tests**

```ts
// test/turn-battle.test.ts
describe('resolveTurn with status effects', () => {
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
});
```

- [ ] **Step 6: Run the battle regression suite**

Run: `node --import tsx --test test/turn-battle.test.ts`  
Expected: PASS after all i18n and status helper changes are in place

### Task 6: Battle UI Update

**Files:**
- Modify: `src/battle-tui/renderer.ts`
- Modify: `src/status-line.ts`

- [ ] **Step 1: Extend the renderer color map**

```ts
// src/battle-tui/renderer.ts
function statusLabel(mon: BattlePokemon): string {
  if (!mon.statusCondition) return '';
  const colors: Record<string, string> = {
    burn: '\x1b[31m',
    poison: '\x1b[35m',
    badly_poisoned: '\x1b[35m',
    paralysis: '\x1b[33m',
    sleep: '\x1b[33m',
    freeze: '\x1b[36m',
  };
  const color = colors[mon.statusCondition] || '';
  const label = t(`status.label.${mon.statusCondition}`);
  return `${color}[${label}]\x1b[0m`;
}
```

- [ ] **Step 2: Extend the compact status badge map**

```ts
// src/status-line.ts
const statusLabels: Record<string, string> = {
  burn: '\x1b[31m[BRN]\x1b[0m',
  poison: '\x1b[35m[PSN]\x1b[0m',
  badly_poisoned: '\x1b[35m[TOX]\x1b[0m',
  paralysis: '\x1b[33m[PRZ]\x1b[0m',
  sleep: '\x1b[33m[SLP]\x1b[0m',
  freeze: '\x1b[36m[FRZ]\x1b[0m',
};
```

- [ ] **Step 3: Verify labels align with i18n**

`renderer.ts` uses localized `status.label.*`; `status-line.ts` keeps the fixed compact battle abbreviations. Confirm both surfaces are intentional and unchanged for existing statuses.

### Task 7: Final Verification

**Files:**
- Verify: `src/core/types.ts`
- Verify: `src/core/status-effects.ts`
- Verify: `src/core/turn-battle.ts`
- Verify: `src/i18n/en.json`
- Verify: `src/i18n/ko.json`
- Verify: `src/battle-tui/renderer.ts`
- Verify: `src/status-line.ts`
- Verify: `data/moves.json`
- Verify: `test/status-effects.test.ts`
- Verify: `test/turn-battle.test.ts`

- [ ] **Step 1: Run the status unit tests**

Run: `node --import tsx --test test/status-effects.test.ts`  
Expected: PASS

- [ ] **Step 2: Run the battle engine regression tests**

Run: `node --import tsx --test test/turn-battle.test.ts`  
Expected: PASS

- [ ] **Step 3: Run the TypeScript checker**

Run: `npx tsc --noEmit`  
Expected: PASS

- [ ] **Step 4: Re-validate JSON files**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('data/moves.json','utf8')); JSON.parse(require('node:fs').readFileSync('src/i18n/en.json','utf8')); JSON.parse(require('node:fs').readFileSync('src/i18n/ko.json','utf8'))"
```

Expected: no output, exit code 0

- [ ] **Step 5: Spot-check move data and exception behavior**

Run:

```bash
rg -n '"name": "(ice-beam|blizzard|ice-punch|powder-snow|freeze-dry|hypnosis|sing|spore|sleep-powder|lovely-kiss)"' data/moves.json
```

Expected: all ten move blocks present

- [ ] **Step 6: Verify acceptance criteria explicitly**

Checklist:

- Sleep and freeze are in `StatusCondition`
- `sleepCounter` exists everywhere a `BattlePokemon` is built
- sleep applies with a `1..3` counter
- wake turn still skips the move
- freeze has 20% thaw
- frozen exception moves thaw and act
- fire hits thaw frozen defenders before damage
- ice types are immune to freeze
- five sleep moves exist in `moves.json`
- five ice attacks have 10% freeze effects
- UI labels exist for sleep and freeze
- English and Korean i18n keys exist

- [ ] **Step 7: Commit with a Lore-format message**

```bash
git add src/core/types.ts src/core/status-effects.ts src/core/turn-battle.ts src/i18n/en.json src/i18n/ko.json src/battle-tui/renderer.ts src/status-line.ts data/moves.json test/status-effects.test.ts test/turn-battle.test.ts
git commit -m "Add sleep and freeze to complete the v2 non-volatile status set

The battle engine already has a stable status-application and pre-move skip
pipeline, so this change extends that path with sleep counters, freeze thaw
rules, and the small set of frozen exception moves instead of adding a second
status subsystem.

Constraint: Must preserve the existing one-non-volatile-status invariant
Constraint: Must not extend MoveData just to support frozen exception moves
Rejected: Wake-and-act-on-zero sleep convention | introduces a free-action edge case into the current PP-skip invariant
Confidence: high
Scope-risk: moderate
Directive: Keep sleep/freeze checks before PP consumption for chosen moves
Tested: node --import tsx --test test/status-effects.test.ts
Tested: node --import tsx --test test/turn-battle.test.ts
Tested: npx tsc --noEmit
Not-tested: interactive TUI rendering in a live gym battle"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-10-status-effects-v3a.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
