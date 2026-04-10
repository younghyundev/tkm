# Status Effects v3c Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a parallel volatile-status subsystem to the v3a Tokenmon battle engine, covering confusion, flinch, and leech-seed with switch-out clearing, move-data integration, save migration, AI heuristics, and regression tests.

**Architecture:** Keep v3a's non-volatile `statusCondition` pipeline intact and add a separate `volatileStatuses[]` array on `BattlePokemon`. Centralize volatile rules in a new `src/core/volatile-status.ts` module, thread move-order context through `resolveTurn()` / `executeMove()`, and preserve v3a's existing save normalization and end-of-turn status flow by extending those seams rather than replacing them.

**Tech Stack:** TypeScript, Node.js built-in test runner, JSON move data, existing i18n dictionaries, current battle engine in `src/core/turn-battle.ts`.

---

## File Map

- `src/core/types.ts`: `VolatileStatusType`, `VolatileStatus`, `BattlePokemon.volatileStatuses`, `MoveData.volatileEffect`
- `src/core/volatile-status.ts`: new volatile helper module
- `src/core/turn-battle.ts`: flinch / confusion gating, volatile secondary effect application, leech-seed end-of-turn, switch-out clearing
- `src/core/battle-state-io.ts`: backfill missing `volatileStatuses` for older saves
- `src/core/gym-ai.ts`: confusion / leech-seed setup heuristics
- `src/i18n/en.json`: English volatile status battle-log keys
- `src/i18n/ko.json`: Korean volatile status battle-log keys
- `data/moves.json`: volatile-status move additions and updates
- `test/volatile-status.test.ts`: unit coverage for helper module
- `test/turn-battle.test.ts`: battle-flow regression coverage
- `test/gym-ai.test.ts`: volatile setup heuristic coverage
- `test/battle-state-migration.test.ts`: schema backfill coverage for `volatileStatuses`

### Task 1: Extend Types And Save Normalization

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/turn-battle.ts`
- Modify: `src/core/battle-state-io.ts`
- Modify: `test/turn-battle.test.ts`
- Modify: `test/battle-state-migration.test.ts`

- [ ] **Step 1: Add volatile battle types to `src/core/types.ts`**

```ts
// src/core/types.ts
export type VolatileStatusType = 'confusion' | 'flinch' | 'leech_seed';

export interface VolatileStatus {
  type: VolatileStatusType;
  turnsRemaining?: number;
  sourceSide?: 'player' | 'opponent';
}

export interface MoveData {
  id: number;
  name: string;
  nameKo: string;
  nameEn: string;
  type: string;
  category: MoveCategory;
  power: number;
  accuracy: number;
  pp: number;
  effect?: {
    type: StatusCondition;
    chance: number;
  };
  volatileEffect?: {
    type: VolatileStatusType;
    chance: number;
  };
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
  volatileStatuses: VolatileStatus[];
}
```

- [ ] **Step 2: Initialize `volatileStatuses` in `createBattlePokemon()`**

```ts
// src/core/turn-battle.ts
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
    volatileStatuses: [],
  };
```

- [ ] **Step 3: Backfill missing `volatileStatuses` in battle-state migration**

```ts
// src/core/battle-state-io.ts
export function normalizeBattlePokemon(mon: BattlePokemon): void {
  if (mon.statusCondition === undefined) {
    mon.statusCondition = null;
  }
  if (mon.toxicCounter === undefined) {
    mon.toxicCounter = 0;
  }
  if (mon.sleepCounter === undefined || !Number.isFinite(mon.sleepCounter)) {
    mon.sleepCounter = 0;
  }
  if (!Array.isArray(mon.volatileStatuses)) {
    mon.volatileStatuses = [];
  }
}
```

- [ ] **Step 4: Update test helpers to include the new field**

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
    volatileStatuses: [],
    ...overrides,
  };
}
```

- [ ] **Step 5: Add migration regressions for `volatileStatuses`**

```ts
// test/battle-state-migration.test.ts
it('normalizeBattlePokemon backfills missing volatileStatuses to [] (v3c)', () => {
  const mon = makeLegacyPokemon();
  assert.equal((mon as any).volatileStatuses, undefined);
  normalizeBattlePokemon(mon);
  assert.deepEqual(mon.volatileStatuses, []);
});

it('normalizeBattlePokemon preserves existing volatileStatuses', () => {
  const mon = makeLegacyPokemon({
    volatileStatuses: [{ type: 'confusion', turnsRemaining: 3 }],
  });
  normalizeBattlePokemon(mon);
  assert.equal(mon.volatileStatuses.length, 1);
  assert.equal(mon.volatileStatuses[0].type, 'confusion');
});
```

- [ ] **Step 6: Run focused schema tests**

Run: `node --import tsx --test test/battle-state-migration.test.ts test/turn-battle.test.ts`  
Expected: PASS after the later engine changes are complete

### Task 2: Build The Volatile Status Module

**Files:**
- Add: `src/core/volatile-status.ts`
- Add: `test/volatile-status.test.ts`

- [ ] **Step 1: Create the helper surface**

```ts
// src/core/volatile-status.ts
import { t } from '../i18n/index.js';
import type { BattleMove, BattlePokemon, BattleState, VolatileStatus, VolatileStatusType } from './types.js';
import { calculateDamage } from './turn-battle.js';

export function hasVolatileStatus(pokemon: BattlePokemon, type: VolatileStatusType): boolean {
  return pokemon.volatileStatuses.some((status) => status.type === type);
}

export function removeVolatileStatus(pokemon: BattlePokemon, type: VolatileStatusType): boolean {
  const before = pokemon.volatileStatuses.length;
  pokemon.volatileStatuses = pokemon.volatileStatuses.filter((status) => status.type !== type);
  return pokemon.volatileStatuses.length !== before;
}

export function clearVolatileStatuses(pokemon: BattlePokemon): void {
  pokemon.volatileStatuses = [];
}
```

- [ ] **Step 2: Implement `addVolatileStatus()` with v3c-specific duplicate and immunity rules**

```ts
// src/core/volatile-status.ts
export function addVolatileStatus(
  target: BattlePokemon,
  status: VolatileStatus,
  messages: string[],
): boolean {
  if (target.fainted) return false;

  if (hasVolatileStatus(target, status.type)) {
    if (status.type === 'confusion') {
      messages.push(t('volatile.confusion.already', { name: target.displayName }));
    }
    return false;
  }

  if (status.type === 'leech_seed' && target.types.includes('grass')) {
    messages.push(t('volatile.leech_seed.grass_immune', { name: target.displayName }));
    return false;
  }

  const nextStatus =
    status.type === 'confusion'
      ? {
          ...status,
          turnsRemaining: status.turnsRemaining ?? (Math.floor(Math.random() * 4) + 2),
        }
      : status;

  target.volatileStatuses.push(nextStatus);

  if (status.type === 'confusion') {
    messages.push(t('volatile.confusion.inflicted', { name: target.displayName }));
  } else if (status.type === 'leech_seed') {
    messages.push(t('volatile.leech_seed.inflicted', { name: target.displayName }));
  }

  return true;
}
```

- [ ] **Step 3: Add confusion and flinch resolution helpers**

```ts
// src/core/volatile-status.ts
const CONFUSION_SELF_HIT: BattleMove = {
  data: {
    id: -1,
    name: 'confusion-self-hit',
    nameKo: '혼란 자해',
    nameEn: 'Confusion Self Hit',
    type: 'typeless',
    category: 'physical',
    power: 40,
    accuracy: 100,
    pp: 1,
  },
  currentPp: 1,
};

export function applyConfusionSelfDamage(pokemon: BattlePokemon, messages: string[]): void {
  const damage = calculateDamage(pokemon, pokemon, CONFUSION_SELF_HIT);
  pokemon.currentHp = Math.max(0, pokemon.currentHp - damage);
  messages.push(t('volatile.confusion.self_hit', { name: pokemon.displayName }));
  if (pokemon.currentHp <= 0) {
    pokemon.fainted = true;
    messages.push(`${pokemon.displayName}은(는) 쓰러졌다!`);
  }
}

export function checkFlinchSkip(pokemon: BattlePokemon, messages: string[]): boolean {
  if (!removeVolatileStatus(pokemon, 'flinch')) return false;
  messages.push(t('volatile.flinch.inflicted', { name: pokemon.displayName }));
  return true;
}

export function checkConfusionSkip(pokemon: BattlePokemon, messages: string[]): boolean {
  const status = pokemon.volatileStatuses.find((entry) => entry.type === 'confusion');
  if (!status) return false;

  const current = Number.isFinite(status.turnsRemaining) ? status.turnsRemaining! : 0;
  const next = Math.max(0, current - 1);
  status.turnsRemaining = next;

  const selfHit = Math.random() < (1 / 3);
  if (selfHit) {
    applyConfusionSelfDamage(pokemon, messages);
  }

  if (next === 0) {
    removeVolatileStatus(pokemon, 'confusion');
    messages.push(t('volatile.confusion.snap_out', { name: pokemon.displayName }));
  }

  return selfHit;
}
```

- [ ] **Step 4: Add leech-seed end-of-turn resolution**

```ts
// src/core/volatile-status.ts
export function applyLeechSeedEndOfTurn(
  affected: BattlePokemon,
  allPokemon: Pick<BattleState, 'player' | 'opponent'>,
  messages: string[],
): boolean {
  const seeded = affected.volatileStatuses.find((entry) => entry.type === 'leech_seed');
  if (!seeded || affected.fainted || !seeded.sourceSide) return false;

  const drain = Math.max(1, Math.floor(affected.maxHp / 8));
  const actualDrain = Math.min(drain, affected.currentHp);
  if (actualDrain <= 0) return false;

  affected.currentHp -= actualDrain;
  messages.push(t('volatile.leech_seed.drain', { name: affected.displayName }));
  if (affected.currentHp <= 0) {
    affected.currentHp = 0;
    affected.fainted = true;
  }

  const healer = allPokemon[seeded.sourceSide].pokemon[allPokemon[seeded.sourceSide].activeIndex];
  if (!healer.fainted) {
    healer.currentHp = Math.min(healer.maxHp, healer.currentHp + actualDrain);
  }

  return affected.fainted;
}
```

- [ ] **Step 5: Lock the helper behavior with focused unit tests**

```ts
// test/volatile-status.test.ts
describe('addVolatileStatus', () => {
  it('adds confusion with a randomized 2-5 turn duration', () => {});
  it('rejects duplicate confusion', () => {});
  it('rejects leech-seed on grass types', () => {});
});

describe('checkConfusionSkip', () => {
  it('self-hits on a 33% roll and decrements turns', () => {});
  it('snaps out when turns reach zero', () => {});
});

describe('checkFlinchSkip', () => {
  it('consumes flinch and skips the move', () => {});
});

describe('applyLeechSeedEndOfTurn', () => {
  it('drains 1/8 max HP and heals the source side', () => {});
  it('caps healing at maxHp', () => {});
});
```

- [ ] **Step 6: Run the new unit file**

Run: `node --import tsx --test test/volatile-status.test.ts`  
Expected: PASS

### Task 3: Add i18n Messages

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/ko.json`

- [ ] **Step 1: Add English volatile battle-log keys**

```json
// src/i18n/en.json
"volatile.confusion.inflicted": "{name} became confused!",
"volatile.confusion.self_hit": "{name} hurt itself in its confusion!",
"volatile.confusion.snap_out": "{name} snapped out of confusion!",
"volatile.confusion.already": "{name} is already confused!",
"volatile.flinch.inflicted": "{name} flinched!",
"volatile.leech_seed.inflicted": "{name} was seeded!",
"volatile.leech_seed.drain": "{name}'s health is being sapped by leech seed!",
"volatile.leech_seed.grass_immune": "It doesn't affect {name}..."
```

- [ ] **Step 2: Add Korean equivalents**

```json
// src/i18n/ko.json
"volatile.confusion.inflicted": "{name:은/는} 혼란에 빠졌다!",
"volatile.confusion.self_hit": "{name:은/는} 혼란에 빠져 자신을 공격했다!",
"volatile.confusion.snap_out": "{name:은/는} 혼란에서 깨어났다!",
"volatile.confusion.already": "{name:은/는} 이미 혼란 상태다!",
"volatile.flinch.inflicted": "{name:은/는} 풀죽어 움직일 수 없다!",
"volatile.leech_seed.inflicted": "{name:은/는} 씨가 심어졌다!",
"volatile.leech_seed.drain": "{name:은/는} 씨뿌리기에 체력을 빼앗기고 있다!",
"volatile.leech_seed.grass_immune": "{name}에게는 효과가 없다..."
```

- [ ] **Step 3: Smoke-test key lookup**

Run: `node --import tsx --test test/volatile-status.test.ts`  
Expected: no missing-key failures once helper tests are wired to `initLocale()`

### Task 4: Update Move Data

**Files:**
- Modify: `data/moves.json`

- [ ] **Step 1: Add missing volatile setup moves**

```json
{
  "id": 48,
  "name": "supersonic",
  "nameKo": "초음파",
  "nameEn": "Supersonic",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": 55,
  "pp": 20,
  "volatileEffect": { "type": "confusion", "chance": 100 }
},
{
  "id": 73,
  "name": "leech-seed",
  "nameKo": "씨뿌리기",
  "nameEn": "Leech Seed",
  "type": "grass",
  "category": "status",
  "power": 0,
  "accuracy": 90,
  "pp": 10,
  "volatileEffect": { "type": "leech_seed", "chance": 100 }
},
{
  "id": 109,
  "name": "confuse-ray",
  "nameKo": "이상한빛",
  "nameEn": "Confuse Ray",
  "type": "ghost",
  "category": "status",
  "power": 0,
  "accuracy": 100,
  "pp": 10,
  "volatileEffect": { "type": "confusion", "chance": 100 }
}
```

- [ ] **Step 2: Update existing damaging moves with `volatileEffect`**

```json
// data/moves.json
"volatileEffect": { "type": "confusion", "chance": 100 } // dynamic-punch
"volatileEffect": { "type": "flinch", "chance": 30 }     // air-slash
"volatileEffect": { "type": "flinch", "chance": 30 }     // bite
"volatileEffect": { "type": "flinch", "chance": 30 }     // iron-head
"volatileEffect": { "type": "flinch", "chance": 30 }     // rock-slide
"volatileEffect": { "type": "flinch", "chance": 30 }     // stomp
```

- [ ] **Step 3: Keep `effect` untouched for non-volatile status moves**

```json
// Example rule:
// - dynamic-punch uses volatileEffect for confusion
// - thunder-wave keeps effect for paralysis
// - no move in v3c should encode confusion/flinch/leech_seed under effect
```

- [ ] **Step 4: Validate the JSON file**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('data/moves.json','utf8')); console.log('ok')"`  
Expected: `ok`

### Task 5: Integrate Flinch, Confusion, And Volatile Effect Rolls Into `executeMove()`

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Import the volatile helpers**

```ts
// src/core/turn-battle.ts
import {
  addVolatileStatus,
  applyLeechSeedEndOfTurn,
  checkConfusionSkip,
  checkFlinchSkip,
  clearVolatileStatuses,
} from './volatile-status.js';
```

- [ ] **Step 2: Thread move-order context into `executeMove()`**

```ts
// src/core/turn-battle.ts
function executeMove(
  attackerSide: 'player' | 'opponent',
  state: BattleState,
  moveIndex: number,
  messages: string[],
  attackerMovedFirst: boolean,
): { defenderFainted: boolean } {
```

- [ ] **Step 3: Add the new pre-move volatile gating in the required order**

```ts
// src/core/turn-battle.ts
  if (checkFlinchSkip(attacker, messages)) {
    return { defenderFainted: false };
  }

  if (checkSleepSkip(attacker, messages)) {
    return { defenderFainted: false };
  }

  if (checkFreezeSkip(attacker, move, messages)) {
    return { defenderFainted: false };
  }

  if (!isStruggle && checkParalysisSkip(attacker, messages)) {
    return { defenderFainted: false };
  }

  if (checkConfusionSkip(attacker, messages)) {
    return { defenderFainted: false };
  }
```

- [ ] **Step 4: Roll `volatileEffect` after damage and before the existing non-volatile effect roll**

```ts
// src/core/turn-battle.ts
  if (!defender.fainted && move.data.volatileEffect && !moveTypeImmune) {
    const volatile = move.data.volatileEffect;
    const passedChance = Math.random() * 100 < volatile.chance;
    const canApplyFlinch = volatile.type !== 'flinch' || attackerMovedFirst;

    if (passedChance && canApplyFlinch) {
      addVolatileStatus(
        defender,
        {
          type: volatile.type,
          sourceSide: volatile.type === 'leech_seed' ? attackerSide : undefined,
        },
        messages,
      );
    }
  }

  if (!defender.fainted && move.data.effect && !moveTypeImmune) {
    rollMoveEffect(move.data, defender, messages);
  }
```

- [ ] **Step 5: Add battle-flow regressions**

```ts
// test/turn-battle.test.ts
it('confusion self-hit happens before accuracy check', () => {});
it('second mover loses its turn when flinched by the first mover', () => {});
it('slower flinch move does not stop a faster target that already acted', () => {});
it('damaging moves can apply volatile secondary effects', () => {});
it('a pokemon can hold confusion, flinch, and leech-seed at once', () => {});
```

- [ ] **Step 6: Run the battle-flow tests**

Run: `node --import tsx --test test/turn-battle.test.ts`  
Expected: PASS after Tasks 6 and 7 are also complete

### Task 6: Add End-Of-Turn Leech Seed Resolution

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Run leech-seed before v3a non-volatile end-of-turn damage**

```ts
// src/core/turn-battle.ts
  const battleOverAfterActions = !hasAlivePokemon(state.player) || !hasAlivePokemon(state.opponent);
  if (!battleOverAfterActions) {
    const statusMessages: string[] = [];

    if (!playerActive.fainted) {
      if (applyLeechSeedEndOfTurn(playerActive, state, statusMessages)) {
        playerFainted = true;
      }
    }
    if (!opponentActive.fainted) {
      if (applyLeechSeedEndOfTurn(opponentActive, state, statusMessages)) {
        opponentFainted = true;
      }
    }

    if (!playerActive.fainted) {
      if (applyEndOfTurnEffects(playerActive, statusMessages)) {
        playerFainted = true;
      }
    }
    if (!opponentActive.fainted) {
      if (applyEndOfTurnEffects(opponentActive, statusMessages)) {
        opponentFainted = true;
      }
    }

    messages.push(...statusMessages);
  }
```

- [ ] **Step 2: Add targeted turn tests**

```ts
// test/turn-battle.test.ts
it('leech-seed drains 1/8 maxHp at end of turn and heals the source side', () => {});
it('leech-seed healing is capped at maxHp', () => {});
it('grass types reject leech-seed', () => {});
```

- [ ] **Step 3: Re-run the battle tests**

Run: `node --import tsx --test test/turn-battle.test.ts`  
Expected: PASS

### Task 7: Clear Volatile Statuses On Switch-Out

**Files:**
- Modify: `src/core/turn-battle.ts`
- Modify: `test/turn-battle.test.ts`

- [ ] **Step 1: Clear volatile statuses in `executeSwitch()`**

```ts
// src/core/turn-battle.ts
function executeSwitch(
  team: BattleTeam,
  targetIndex: number,
  messages: string[],
): void {
  if (targetIndex < 0 || targetIndex >= team.pokemon.length || team.pokemon[targetIndex].fainted) {
    return;
  }

  const old = getActivePokemon(team);
  clearVolatileStatuses(old);

  team.activeIndex = targetIndex;

  if (old.statusCondition === 'badly_poisoned') {
    old.toxicCounter = 1;
  }

  const next = getActivePokemon(team);
  messages.push(`${old.displayName}에서 ${next.displayName}(으)로 교체!`);
}
```

- [ ] **Step 2: Add switch-out regressions**

```ts
// test/turn-battle.test.ts
it('switching out clears confusion and leech-seed from the departing pokemon', () => {});
it('switching out also clears flinch if it was still present', () => {});
```

- [ ] **Step 3: Re-run battle-flow tests**

Run: `node --import tsx --test test/turn-battle.test.ts`  
Expected: PASS

### Task 8: Extend Gym AI For Volatile Setup Moves

**Files:**
- Modify: `src/core/gym-ai.ts`
- Modify: `test/gym-ai.test.ts`

- [ ] **Step 1: Add volatile-status awareness to AI scoring**

```ts
// src/core/gym-ai.ts
import { hasVolatileStatus } from './volatile-status.js';

const STATUS_MOVE_BASE_SCORE = 60;
const LEECH_SEED_BASE_SCORE = 50;
```

- [ ] **Step 2: Score confusion and leech-seed setup moves explicitly**

```ts
// src/core/gym-ai.ts
    if (move.data.volatileEffect && move.data.power === 0) {
      if (typeEff === 0) {
        return { index, score: 0 };
      }

      if (move.data.volatileEffect.type === 'confusion') {
        if (hasVolatileStatus(defender, 'confusion')) {
          return { index, score: 0 };
        }
        return { index, score: STATUS_MOVE_BASE_SCORE };
      }

      if (move.data.volatileEffect.type === 'leech_seed') {
        if (defender.types.includes('grass') || hasVolatileStatus(defender, 'leech_seed')) {
          return { index, score: 0 };
        }
        return { index, score: LEECH_SEED_BASE_SCORE };
      }
    }
```

- [ ] **Step 3: Leave flinch moves in the damaging branch**

```ts
// No special branch for air-slash / bite / iron-head / rock-slide / stomp.
// They keep their current power × STAB × effectiveness scoring.
```

- [ ] **Step 4: Add AI regressions**

```ts
// test/gym-ai.test.ts
it('never uses confuse-ray when the opponent is already confused', () => {});
it('uses leech-seed sometimes against non-grass targets', () => {});
it('never uses leech-seed against grass targets', () => {});
it('never uses leech-seed when the opponent is already seeded', () => {});
```

- [ ] **Step 5: Run AI tests**

Run: `node --import tsx --test test/gym-ai.test.ts`  
Expected: PASS

### Task 9: Final Verification

**Files:**
- Verify: `src/core/types.ts`
- Verify: `src/core/volatile-status.ts`
- Verify: `src/core/turn-battle.ts`
- Verify: `src/core/battle-state-io.ts`
- Verify: `src/core/gym-ai.ts`
- Verify: `src/i18n/en.json`
- Verify: `src/i18n/ko.json`
- Verify: `data/moves.json`
- Verify: `test/volatile-status.test.ts`
- Verify: `test/turn-battle.test.ts`
- Verify: `test/gym-ai.test.ts`
- Verify: `test/battle-state-migration.test.ts`

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`  
Expected: PASS

- [ ] **Step 2: Run focused battle and AI tests**

Run: `node --import tsx --test test/volatile-status.test.ts test/turn-battle.test.ts test/gym-ai.test.ts test/battle-state-migration.test.ts`  
Expected: PASS

- [ ] **Step 3: Run the full test suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 4: Manual checklist before closing**

Confirm all of the following:

- `volatileStatuses` initializes to `[]`
- older battle saves resume safely with `volatileStatuses: []`
- confusion duration is randomized in `2..5`
- confusion can self-hit before accuracy
- flinch only blocks the second mover
- flinch is consumed when checked
- leech-seed drains and heals correctly
- grass targets reject leech-seed
- switch-out clears volatile statuses
- AI avoids redundant confusion / leech-seed setup
- all requested move data is present
- both i18n dictionaries include all new keys
