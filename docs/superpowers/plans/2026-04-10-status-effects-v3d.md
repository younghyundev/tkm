# Status Effects v3d Implementation Plan

> Created with the `writing-plans` skill as a concrete, code-first execution plan.

**Goal:** Add healing, recoil, and drain move effects to the Tokenmon battle system, and implement Rest as a deterministic self-heal plus self-sleep move on top of the existing v3a sleep system.

**Architecture:** Extend `MoveData` with a dedicated `moveEffect` union, annotate moves in `data/moves.json`, branch inside `executeMove()` for healing/rest and post-damage recoil/drain, then teach `gym-ai.ts` the new sustain heuristics. Keep the integration narrow and preserve the existing v2 `effect` field for status infliction.

**Tech Stack:** TypeScript, JSON move data, Node test runner with `tsx`, existing battle resolution in `src/core/turn-battle.ts`, existing status logic in `src/core/status-effects.ts`.

---

## Step 1: Extend battle types for move-side sustain and recoil effects

**Files**
- `src/core/types.ts`

**Changes**
- Add four new interfaces:
  - `HealEffect`
  - `RestEffect`
  - `RecoilEffect`
  - `DrainEffect`
- Add `moveEffect?: HealEffect | RestEffect | RecoilEffect | DrainEffect` to `MoveData`.
- Keep the existing `effect?: { type: StatusCondition; chance: number }` field untouched so v2 status effects continue to work.

**Code shape**

```ts
export interface HealEffect {
  type: 'heal';
  fraction: number;
}

export interface RestEffect {
  type: 'rest';
}

export interface RecoilEffect {
  type: 'recoil';
  fraction: number;
}

export interface DrainEffect {
  type: 'drain';
  fraction: number;
}

export interface MoveData {
  // existing fields...
  effect?: { type: StatusCondition; chance: number };
  moveEffect?: HealEffect | RestEffect | RecoilEffect | DrainEffect;
}
```

**Done when**
- `MoveData` can describe healing-only, recoil, and drain mechanics without overloading `effect`.

---

## Step 2: Add battle text for healing, Rest, recoil, and drain

**Files**
- `src/i18n/en.json`
- `src/i18n/ko.json`

**Changes**
- Add these keys in both locales:
  - `move.heal.success`
  - `move.heal.fail`
  - `move.rest.success`
  - `move.recoil`
  - `move.drain`

**Required strings**

```json
{
  "move": {
    "heal": {
      "success": "{name} restored its HP!",
      "fail": "But it failed! {name}'s HP is full."
    },
    "rest": {
      "success": "{name} went to sleep and restored its HP!"
    },
    "recoil": "{name} is hit by recoil!",
    "drain": "{name} drained HP!"
  }
}
```

```json
{
  "move": {
    "heal": {
      "success": "{name}의 HP가 회복되었다!",
      "fail": "하지만 실패! {name}의 HP가 가득 차 있다!"
    },
    "rest": {
      "success": "{name}은(는) 잠들면서 HP를 회복했다!"
    },
    "recoil": "{name}은(는) 반동 데미지를 입었다!",
    "drain": "{name}은(는) HP를 흡수했다!"
  }
}
```

**Done when**
- Both locales expose the same new keys and the battle engine can reference them directly.

---

## Step 3: Annotate or add move data for all 17 scoped moves

**Files**
- `data/moves.json`

**Changes**
- Add missing healing/status moves:
  - `recover` (`id: 105`)
  - `soft-boiled` (`id: 135`)
  - `milk-drink` (`id: 208`)
  - `slack-off` (`id: 303`)
  - `roost` (`id: 355`)
  - `rest` (`id: 156`)
- Add or update recoil metadata:
  - `take-down` (`id: 36`) -> `moveEffect: { type: 'recoil', fraction: 0.25 }`
  - `double-edge` (`id: 38`) -> `moveEffect: { type: 'recoil', fraction: 0.333 }`
  - `brave-bird` (`id: 413`) -> `moveEffect: { type: 'recoil', fraction: 0.333 }`
  - `flare-blitz` (`id: 394`) -> `moveEffect: { type: 'recoil', fraction: 0.333 }`
  - `head-smash` (`id: 457`) -> `moveEffect: { type: 'recoil', fraction: 0.5 }`
  - `wood-hammer` (`id: 452`) -> `moveEffect: { type: 'recoil', fraction: 0.333 }`
- Add or update drain metadata:
  - `giga-drain` (`id: 202`) -> `moveEffect: { type: 'drain', fraction: 0.5 }`
  - `mega-drain` (`id: 72`) -> `moveEffect: { type: 'drain', fraction: 0.5 }`
  - `leech-life` (`id: 141`) -> `moveEffect: { type: 'drain', fraction: 0.5 }`
  - `drain-punch` (`id: 409`) -> `moveEffect: { type: 'drain', fraction: 0.5 }`
  - `horn-leech` (`id: 532`) -> `moveEffect: { type: 'drain', fraction: 0.5 }`

**Concrete targets**

```json
{
  "id": 156,
  "name": "rest",
  "nameKo": "잠자기",
  "nameEn": "Rest",
  "type": "psychic",
  "category": "status",
  "power": 0,
  "accuracy": null,
  "pp": 5,
  "moveEffect": { "type": "rest" }
}
```

```json
{
  "id": 105,
  "name": "recover",
  "nameKo": "회복",
  "nameEn": "Recover",
  "type": "normal",
  "category": "status",
  "power": 0,
  "accuracy": null,
  "pp": 5,
  "moveEffect": { "type": "heal", "fraction": 0.5 }
}
```

```json
{
  "id": 36,
  "name": "take-down",
  "moveEffect": { "type": "recoil", "fraction": 0.25 }
}
```

```json
{
  "id": 202,
  "name": "giga-drain",
  "power": 75,
  "moveEffect": { "type": "drain", "fraction": 0.5 }
}
```

**Implementation notes**
- Preserve any preexisting v2 `effect` field on moves such as `flare-blitz` if it already exists locally.
- Stay aligned with the current local `moves.json` conventions for `accuracy: null` on status moves.

**Done when**
- All scoped moves exist with the exact `moveEffect` metadata required by v3d.

---

## Step 4: Add healing and Rest branches to the battle engine

**Files**
- `src/core/turn-battle.ts`
- `src/core/status-effects.ts` if a helper extraction becomes necessary
- `test/turn-battle.test.ts`

**Changes**
- Inside `executeMove()`, detect status moves with `move.data.moveEffect?.type === 'heal'` or `'rest'`.
- Route them through a healing-only branch before damage calculation.

**Healing behavior**
- If the user is at full HP:
  - push `move.heal.fail`
  - return without damage logic
- Otherwise:
  - `healAmount = Math.floor(attacker.maxHp * move.data.moveEffect.fraction)`
  - `attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount)`
  - push `move.heal.success`

**Rest behavior**
- Fail only when:
  - `attacker.currentHp === attacker.maxHp`
  - and `attacker.statusCondition !== null`
- Otherwise:
  - `attacker.currentHp = attacker.maxHp`
  - clear existing status if needed
  - apply sleep to self using the v3a sleep pathway
  - force `attacker.sleepCounter = 2`
  - push `move.rest.success`

**Concrete implementation sketch**

```ts
const moveEffect = move.data.moveEffect;

if (move.data.power === 0 && moveEffect?.type === 'heal') {
  if (attacker.currentHp === attacker.maxHp) {
    messages.push(t('move.heal.fail', { name: attacker.name }));
    return;
  }

  const healAmount = Math.floor(attacker.maxHp * moveEffect.fraction);
  attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount);
  messages.push(t('move.heal.success', { name: attacker.name }));
  return;
}

if (move.data.power === 0 && moveEffect?.type === 'rest') {
  if (attacker.currentHp === attacker.maxHp && attacker.statusCondition !== null) {
    messages.push(t('move.heal.fail', { name: attacker.name }));
    return;
  }

  attacker.currentHp = attacker.maxHp;
  attacker.statusCondition = null;
  attacker.sleepCounter = 0;
  tryApplyStatus(attacker, 'sleep', messages);
  attacker.sleepCounter = 2;
  messages.push(t('move.rest.success', { name: attacker.name }));
  return;
}
```

**Tests to add**
- Healing moves restore `floor(maxHp * fraction)`.
- Healing moves fail at full HP.
- Rest sets HP to max.
- Rest applies `statusCondition = 'sleep'`.
- Rest sets `sleepCounter = 2`.
- Rest fails only when both full HP and already statused.

**Done when**
- The engine supports pure healing moves and Rest without entering the damage pipeline.

---

## Step 5: Add post-damage recoil and drain behavior

**Files**
- `src/core/turn-battle.ts`
- `test/turn-battle.test.ts`

**Changes**
- After damage is applied and `damageDealt` is known, add post-damage hooks for:
  - recoil
  - drain

**Recoil behavior**
- Formula:
  - `recoil = Math.max(1, Math.floor(damageDealt * fraction))`
- Apply only if `damageDealt > 0`.
- Subtract from the attacker after the defender takes damage.
- Allow recoil to KO the attacker.
- Push `move.recoil`.

**Drain behavior**
- Formula:
  - `heal = Math.max(1, Math.floor(damageDealt * fraction))`
- Apply only if `damageDealt > 0`.
- Heal the attacker after damage.
- Cap at `maxHp`.
- Push `move.drain`.

**Concrete implementation sketch**

```ts
const moveEffect = move.data.moveEffect;

if (damage > 0 && moveEffect?.type === 'recoil') {
  const recoil = Math.max(1, Math.floor(damage * moveEffect.fraction));
  attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
  messages.push(t('move.recoil', { name: attacker.name }));
}

if (damage > 0 && moveEffect?.type === 'drain') {
  const heal = Math.max(1, Math.floor(damage * moveEffect.fraction));
  attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + heal);
  messages.push(t('move.drain', { name: attacker.name }));
}
```

**Tests to add**
- Recoil damage uses `max(1, floor(damage * fraction))`.
- Recoil can faint the user.
- Recoil still happens if the defender faints.
- Drain heals `max(1, floor(damage * fraction))`.
- Drain healing is capped at max HP.
- Drain does not heal when the move deals 0 damage.

**Done when**
- Damaging moves can self-harm or self-heal based on actual damage dealt, with the correct message flow.

---

## Step 6: Extend Gym AI scoring for healing, Rest, and drain

**Files**
- `src/core/gym-ai.ts`
- `test/gym-ai.test.ts`

**Changes**
- Extend the current move scoring logic to understand `moveEffect`.
- Preserve the existing damage scoring formula and status scoring paths.

**Healing heuristic**
- If `currentHp / maxHp > 0.8`, score `0`.
- Otherwise score `(1 - currentHp / maxHp) * 60`.

**Rest heuristic**
- If `statusCondition !== null`, score `0`.
- If `currentHp / maxHp > 0.5`, score `0`.
- Otherwise score `(1 - currentHp / maxHp) * 80`.

**Recoil heuristic**
- Use the same score as the equivalent normal damaging move in v3d.
- No penalty for recoil yet.

**Drain heuristic**
- Start from the normal damage score.
- Add `20`.

**Concrete implementation sketch**

```ts
if (move.data.moveEffect?.type === 'heal') {
  const hpRatio = attacker.currentHp / attacker.maxHp;
  if (hpRatio > 0.8) return 0;
  return (1 - hpRatio) * 60;
}

if (move.data.moveEffect?.type === 'rest') {
  const hpRatio = attacker.currentHp / attacker.maxHp;
  if (attacker.statusCondition !== null) return 0;
  if (hpRatio > 0.5) return 0;
  return (1 - hpRatio) * 80;
}

let score = baseDamageScore;

if (move.data.moveEffect?.type === 'drain') {
  score += 20;
}
```

**Tests to add**
- AI prefers healing moves at low HP.
- AI skips healing moves when HP is above 80%.
- AI prefers Rest at low HP when not statused.
- AI skips Rest when already statused.
- AI skips Rest when above 50% HP.
- Drain moves get a score bonus over otherwise similar damaging moves.

**Done when**
- Trainers can opportunistically heal and Rest rather than always selecting raw damage.

---

## Step 7: Final verification

**Files**
- `src/core/types.ts`
- `src/core/turn-battle.ts`
- `src/core/gym-ai.ts`
- `src/i18n/en.json`
- `src/i18n/ko.json`
- `data/moves.json`
- `test/turn-battle.test.ts`
- `test/gym-ai.test.ts`

**Verification commands**

```bash
npm run typecheck
```

```bash
npm test
```

**Manual verification checklist**
- Healing moves spend PP and fail cleanly at full HP.
- Rest heals to full and results in `sleepCounter = 2`.
- Rest can clear an existing status unless the exact fail condition applies.
- Recoil damage occurs after successful damage, including defender-faint cases.
- Recoil can KO the attacker.
- Drain healing occurs after damage and is capped at max HP.
- AI scoring reflects the new sustain heuristics.
- English and Korean i18n keys resolve correctly.

**Done when**
- Typecheck passes.
- Test suite passes.
- The v3d acceptance criteria from the design spec are covered by code and tests.
