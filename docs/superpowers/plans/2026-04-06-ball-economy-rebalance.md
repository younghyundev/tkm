# Ball Economy Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase Pokéball supply through action-based drops, non-battle turn drops, and existing value adjustments so Pokédex completion is realistic.

**Architecture:** New `PostToolUse` hook + modifications to `SubagentStop`/`Stop` hooks for action-based drops. Non-battle turn drops added to `stop.ts` encounter flow. Battle drop values adjusted in `items.ts`. Region-specific i18n messages in gen data files.

**Tech Stack:** TypeScript, Node.js test runner, Claude Code hooks system

---

### Task 1: Adjust battle drop rates and quantities in items.ts

**Files:**
- Modify: `src/core/items.ts`
- Modify: `test/items.test.ts`

- [ ] **Step 1: Update rollItemDrop to support variable quantities**

Replace the entire `src/core/items.ts`:

```typescript
import type { State } from './types.js';

const BALL_DROP_RATE_ON_VICTORY = 0.30;
const BALL_DROP_RATE_ON_BATTLE = 0.12;

export function addItem(state: State, item: string, count: number = 1): void {
  if (!state.items) state.items = {};
  state.items[item] = (state.items[item] ?? 0) + count;
}

export function useItem(state: State, item: string): boolean {
  if (!state.items) return false;
  if ((state.items[item] ?? 0) <= 0) return false;
  state.items[item]--;
  return true;
}

export function getItemCount(state: State, item: string): number {
  return state.items?.[item] ?? 0;
}

/**
 * Random integer in [min, max] inclusive.
 */
export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Roll for pokeball drop after a battle.
 * Victory: 30% chance, 1~5 balls. Loss: 12% chance, 1~2 balls.
 * Returns number of balls dropped (0 if no drop).
 */
export function rollItemDrop(state: State, won: boolean): number {
  const rate = won ? BALL_DROP_RATE_ON_VICTORY : BALL_DROP_RATE_ON_BATTLE;
  if (Math.random() < rate) {
    const count = won ? randInt(1, 5) : randInt(1, 2);
    addItem(state, 'pokeball', count);
    return count;
  }
  return 0;
}
```

- [ ] **Step 2: Update tests for new rollItemDrop return type and rates**

Replace the entire `test/items.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { addItem, useItem, getItemCount, rollItemDrop, randInt } from '../src/core/items.js';

describe('items', () => {
  it('addItem increments count', () => {
    const state = makeState();
    addItem(state, 'pokeball');
    assert.equal(getItemCount(state, 'pokeball'), 1);
    addItem(state, 'pokeball', 3);
    assert.equal(getItemCount(state, 'pokeball'), 4);
  });

  it('useItem decrements count', () => {
    const state = makeState({ items: { pokeball: 2 } });
    assert.ok(useItem(state, 'pokeball'));
    assert.equal(getItemCount(state, 'pokeball'), 1);
  });

  it('useItem fails at 0', () => {
    const state = makeState({ items: { pokeball: 0 } });
    assert.ok(!useItem(state, 'pokeball'));
  });

  it('useItem fails for nonexistent item', () => {
    const state = makeState();
    assert.ok(!useItem(state, 'pokeball'));
  });

  describe('randInt', () => {
    it('returns values within range', () => {
      for (let i = 0; i < 100; i++) {
        const v = randInt(1, 5);
        assert.ok(v >= 1 && v <= 5, `randInt(1,5) returned ${v}`);
      }
    });

    it('returns exact value when min equals max', () => {
      assert.equal(randInt(3, 3), 3);
    });
  });

  describe('rollItemDrop', () => {
    it('drops pokeball on victory (returns count > 0)', () => {
      const state = makeState();
      let totalDropped = 0;
      for (let i = 0; i < 100; i++) {
        totalDropped += rollItemDrop(state, true);
      }
      assert.ok(totalDropped > 0, 'Should drop at least once in 100 tries at 30%');
      assert.equal(getItemCount(state, 'pokeball'), totalDropped);
      assert.equal(getItemCount(state, 'retry_token'), 0, 'Should not drop retry_token');
    });

    it('victory drop quantity is 1-5', () => {
      const state = makeState();
      for (let i = 0; i < 200; i++) {
        const count = rollItemDrop(state, true);
        if (count > 0) {
          assert.ok(count >= 1 && count <= 5, `Victory drop was ${count}, expected 1-5`);
        }
      }
    });

    it('drops on loss at lower rate', () => {
      const state = makeState();
      let totalDropped = 0;
      for (let i = 0; i < 200; i++) {
        totalDropped += rollItemDrop(state, false);
      }
      assert.ok(totalDropped > 0, 'Should drop at least once in 200 tries at 12%');
    });

    it('loss drop quantity is 1-2', () => {
      const state = makeState();
      for (let i = 0; i < 200; i++) {
        const count = rollItemDrop(state, false);
        if (count > 0) {
          assert.ok(count >= 1 && count <= 2, `Loss drop was ${count}, expected 1-2`);
        }
      }
    });
  });
});
```

- [ ] **Step 3: Fix callers of rollItemDrop (returns number now, not boolean)**

In `src/core/battle.ts`, find the call to `rollItemDrop`. The return value is used in `formatEncounterMessage`. Search for how it's consumed:

```bash
grep -n 'rollItemDrop\|ballDrop' src/core/battle.ts src/core/encounter.ts
```

The `rollItemDrop` result is likely stored as a boolean. Update the caller to use the new numeric return. In `src/core/encounter.ts` or wherever `rollItemDrop` is called, change:

```typescript
// Before: const dropped = rollItemDrop(state, won);  // was boolean
// After:  const dropped = rollItemDrop(state, won);   // now number (0 = no drop)
```

Any `if (dropped)` checks still work since `0` is falsy and `1+` is truthy. But if the drop count is stored in the battle result, update the type and display to show quantity:

Search `formatEncounterMessage` or `formatBattleMessage` for how drops are displayed and update `🔴×1` to `🔴×{count}`.

- [ ] **Step 4: Run tests**

Run: `npm test 2>&1 | head -50`
Expected: All tests pass, including updated items tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/items.ts test/items.test.ts
# Also add any modified callers (battle.ts, encounter.ts)
git commit -m "feat: increase battle drop rates (30%/12%) and variable quantities (1-5/1-2)"
```

---

### Task 2: Increase chain completion reward

**Files:**
- Modify: `data/pokedex-rewards.json`
- Modify: `test/pokedex-rewards.test.ts` (if chain reward is tested)

- [ ] **Step 1: Update chain_completion_reward**

In `data/pokedex-rewards.json`, change:

```json
"chain_completion_reward": {
  "pokeball_count": 2
}
```

To:

```json
"chain_completion_reward": {
  "pokeball_min": 3,
  "pokeball_max": 5
}
```

- [ ] **Step 2: Update checkChainCompletion in pokedex-rewards.ts**

In `src/core/pokedex-rewards.ts`, find the `checkChainCompletion` function (around line 132). Change the line:

```typescript
// Before:
addItem(state, 'pokeball', rewardsDB.chain_completion_reward.pokeball_count);
```

To:

```typescript
// After:
import { randInt } from './items.js';
// ... inside checkChainCompletion:
const { pokeball_min, pokeball_max } = rewardsDB.chain_completion_reward;
addItem(state, 'pokeball', randInt(pokeball_min, pokeball_max));
```

Also update the `t('rewards.chain_complete')` call in `session-start.ts` that displays `count: chainCompletions * 2` — this hardcoded `* 2` needs to reflect the actual awarded amount. The simplest fix: have `checkChainCompletion` return the total balls awarded, not just the count of chains.

Change `checkChainCompletion` return type from `number` to `{ chains: number; ballsAwarded: number }`:

```typescript
export function checkChainCompletion(state: State): { chains: number; ballsAwarded: number } {
  const db = getPokemonDB();
  const rewardsDB = getPokedexRewardsDB();
  let newCompletions = 0;
  let totalBalls = 0;

  const completedChains = state.completed_chains;

  const chains: Record<string, string[]> = {};
  for (const [name, pData] of Object.entries(db.pokemon)) {
    if (pData.rarity === 'legendary' || pData.rarity === 'mythical') continue;
    const lineKey = pData.evolution_line?.[0] ?? name;
    if (!chains[lineKey]) chains[lineKey] = [];
    chains[lineKey].push(name);
  }

  for (const [lineKey, members] of Object.entries(chains)) {
    if (completedChains.includes(lineKey)) continue;
    if (members.length < 2) continue;
    const allCaught = members.every(name => state.pokedex[name]?.caught);
    if (allCaught) {
      completedChains.push(lineKey);
      const { pokeball_min, pokeball_max } = rewardsDB.chain_completion_reward;
      const balls = randInt(pokeball_min, pokeball_max);
      addItem(state, 'pokeball', balls);
      newCompletions++;
      totalBalls += balls;
    }
  }

  return { chains: newCompletions, ballsAwarded: totalBalls };
}
```

- [ ] **Step 3: Update session-start.ts caller**

In `src/hooks/session-start.ts` around line 168, change:

```typescript
// Before:
const chainCompletions = checkChainCompletion(state);
if (chainCompletions > 0) {
  messages.push(t('rewards.chain_complete', { count: chainCompletions * 2 }));
}
```

To:

```typescript
// After:
const chainResult = checkChainCompletion(state);
if (chainResult.chains > 0) {
  messages.push(t('rewards.chain_complete', { count: chainResult.ballsAwarded }));
}
```

- [ ] **Step 4: Run tests**

Run: `npm test 2>&1 | head -50`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add data/pokedex-rewards.json src/core/pokedex-rewards.ts src/hooks/session-start.ts
git commit -m "feat: increase chain completion reward to 3-5 balls (random)"
```

---

### Task 3: Add action-based ball drop to SubagentStop hook

**Files:**
- Modify: `src/hooks/subagent-stop.ts`

- [ ] **Step 1: Add ball drop logic to subagent-stop**

In `src/hooks/subagent-stop.ts`, add imports and ball drop inside the lock block. The full updated file:

```typescript
import { readFileSync } from 'fs';
import { readSession, writeSession, readState, writeState, readCommonState } from '../core/state.js';
import { readConfig, readGlobalConfig } from '../core/config.js';
import { addItem, randInt } from '../core/items.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache } from '../core/paths.js';
import { initLocale, t } from '../i18n/index.js';
import type { HookInput, HookOutput } from '../core/types.js';
import { playCry } from '../audio/play-cry.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function main(): void {
  const input = JSON.parse(readStdin()) as HookInput;
  const agentId = input.agent_id ?? '';
  const sessionId = input.session_id ?? '';
  if (sessionId) {
    const resolvedGen = getSessionGeneration(sessionId);
    if (resolvedGen) {
      setActiveGenerationCache(resolvedGen);
    } else {
      process.stderr.write(`tokenmon subagent-stop: no gen binding for session ${sessionId}, skipping\n`);
      console.log('{"continue": true}');
      return;
    }
  }

  if (!agentId) {
    console.log('{"continue": true}');
    return;
  }

  let removedPokemon: string | null = null;
  let ballMessage: string | null = null;

  const lockResult = withLock(() => {
    const session = readSession(undefined, sessionId || undefined);
    const removed = session.agent_assignments.find(a => a.agent_id === agentId);
    session.agent_assignments = session.agent_assignments.filter(a => a.agent_id !== agentId);
    writeSession(session, undefined, sessionId || undefined);
    if (removed) {
      removedPokemon = removed.pokemon;
    }

    // Action-based ball drop: 100% chance, 3~5 balls
    const state = readState();
    const config = readConfig();
    const globalConfig = readGlobalConfig();
    initLocale(config.language ?? 'en', globalConfig.voice_tone);

    const count = randInt(3, 5);
    addItem(state, 'pokeball', count);
    writeState(state);

    ballMessage = t('item_drop.subagent', { n: count });
  });

  if (!lockResult.acquired) {
    process.stderr.write(`tokenmon subagent-stop: lock acquisition failed, agent ${agentId} cleanup skipped\n`);
  }

  const output: HookOutput = { continue: true };

  if (removedPokemon) {
    playCry(removedPokemon);
  }

  if (ballMessage) {
    output.system_message = ballMessage;
  }

  console.log(JSON.stringify(output));
}

try {
  main();
} catch (err) {
  process.stderr.write(`tokenmon subagent-stop: ${err}\n`);
  console.log(JSON.stringify({ continue: true }));
}
```

- [ ] **Step 2: Run build to verify**

Run: `npm run build 2>&1 | tail -10`
Expected: No compile errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/subagent-stop.ts
git commit -m "feat: add 100% ball drop (3-5) on subagent completion"
```

---

### Task 4: Add action-based ball drop to Stop hook (session end bonus)

**Files:**
- Modify: `src/hooks/stop.ts`

- [ ] **Step 1: Add session end ball bonus in stop.ts**

In `src/hooks/stop.ts`, add import for `randInt`:

```typescript
import { rollItemDrop, getItemCount, useItem, randInt } from '../core/items.js';  // add randInt
```

(Note: `rollItemDrop` import may come from `items.js` indirectly through `encounter.ts`. Check actual import location.)

Then, just before the `writeState(state)` call at the end of the lock block (around line 391), add the session-end bonus:

```typescript
    // Session-end ball bonus: 100%, 2~3 balls
    const sessionEndBalls = randInt(2, 3);
    addItem(state, 'pokeball', sessionEndBalls);
    messages.push(t('item_drop.session_end', { n: sessionEndBalls }));
```

Make sure `addItem` is imported. It should already be available via existing imports, but verify.

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: No compile errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/stop.ts
git commit -m "feat: add session-end ball bonus (100%, 2-3 balls)"
```

---

### Task 5: Create PostToolUse hook for tool-use ball drops

**Files:**
- Create: `src/hooks/post-tool-use.ts`
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Create post-tool-use.ts**

Create `src/hooks/post-tool-use.ts`:

```typescript
import { readFileSync } from 'fs';
import { readState, writeState } from '../core/state.js';
import { readConfig, readGlobalConfig } from '../core/config.js';
import { addItem, randInt } from '../core/items.js';
import { withLock } from '../core/lock.js';
import { getSessionGeneration, setActiveGenerationCache, getActiveGeneration } from '../core/paths.js';
import { initLocale, t } from '../i18n/index.js';
import type { HookInput, HookOutput } from '../core/types.js';

function readStdin(): string {
  try {
    const data = readFileSync(0, 'utf-8');
    return data || '{}';
  } catch {
    return '{}';
  }
}

function main(): void {
  const input = JSON.parse(readStdin()) as HookInput;
  const sessionId = input.session_id ?? '';

  // Resolve generation
  if (sessionId) {
    const resolvedGen = getSessionGeneration(sessionId);
    if (resolvedGen) {
      setActiveGenerationCache(resolvedGen);
    } else {
      // No gen binding — skip silently (session may not be initialized yet)
      console.log('{"continue": true}');
      return;
    }
  } else {
    setActiveGenerationCache(getActiveGeneration());
  }

  const output: HookOutput = { continue: true };

  // 15% chance to drop 1~2 balls
  if (Math.random() >= 0.15) {
    console.log(JSON.stringify(output));
    return;
  }

  const lockResult = withLock(() => {
    const state = readState();
    const config = readConfig();
    const globalConfig = readGlobalConfig();
    initLocale(config.language ?? 'en', globalConfig.voice_tone);

    const count = randInt(1, 2);
    addItem(state, 'pokeball', count);
    writeState(state);

    return t('item_drop.tool', { n: count });
  });

  if (lockResult.acquired && lockResult.value) {
    output.system_message = lockResult.value;
  }

  console.log(JSON.stringify(output));
}

try {
  main();
} catch (err) {
  process.stderr.write(`tokenmon post-tool-use: ${err}\n`);
  console.log('{"continue": true}');
}
```

- [ ] **Step 2: Register PostToolUse hook in hooks.json**

In `hooks/hooks.json`, add `PostToolUse` entry. The updated hooks object should include:

```json
"PostToolUse": [{"hooks": [{"type": "command", "command": "TOKENMON_HOOK_MODE=1 \"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh\" \"${CLAUDE_PLUGIN_ROOT}/src/hooks/post-tool-use.ts\""}]}]
```

**IMPORTANT**: The path in hooks.json uses the install path. Check the existing entries for the correct base path pattern and match it exactly.

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: No compile errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/post-tool-use.ts hooks/hooks.json
git commit -m "feat: add PostToolUse hook for tool-use ball drops (15%, 1-2 balls)"
```

---

### Task 6: Add non-battle turn ball drop in stop.ts

**Files:**
- Modify: `src/hooks/stop.ts`

- [ ] **Step 1: Add non-battle turn drop logic**

In `src/hooks/stop.ts`, find the section where tips are shown when no battle occurred (around line 360):

```typescript
    } else if (!state.last_battle && config.tips_enabled && getRandomTip) {
      // Show tip when no battle occurred
      const tip = getRandomTip(state, config);
      if (tip) state.last_tip = tip;
    }
```

**Before** this tip block (but after the encounter processing), add the non-battle turn drop:

```typescript
    // Non-battle turn ball drop: 20% chance, 1~5 balls (region-specific message)
    if (!state.last_battle && Math.random() < 0.20) {
      const dropCount = randInt(1, 5);
      addItem(state, 'pokeball', dropCount);
      const regionKey = `item_drop.region.${config.current_region}`;
      const regionMsg = t(regionKey);
      // If no region-specific message (key returned as-is), use generic
      const dropMsg = regionMsg !== regionKey
        ? `${regionMsg} 🔴×${dropCount}`
        : t('item_drop.generic', { n: dropCount });
      messages.push(dropMsg);
    }
```

Make sure `addItem` and `randInt` are imported at the top. `addItem` may not be directly imported in stop.ts — check and add if needed:

```typescript
import { addItem, randInt } from '../core/items.js';
```

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: No compile errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/stop.ts
git commit -m "feat: add non-battle turn ball drop (20%, 1-5 balls, region messages)"
```

---

### Task 7: Add i18n messages — common action drop messages

**Files:**
- Modify: `src/i18n/ko.json`
- Modify: `src/i18n/ko.pokemon.json`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/en.pokemon.json`

- [ ] **Step 1: Add common drop messages to ko.json (claude tone)**

Add these keys to `src/i18n/ko.json`:

```json
"item_drop.tool": "모험 도중 몬스터볼을 발견했습니다! 몬스터볼 {n}개를 손에 넣었습니다!",
"item_drop.subagent": "동료가 몬스터볼을 가지고 돌아왔습니다! 몬스터볼 {n}개를 손에 넣었습니다!",
"item_drop.session_end": "오늘의 모험 보수로 몬스터볼 {n}개를 받았습니다!",
"item_drop.generic": "몬스터볼 {n}개를 주웠습니다!"
```

- [ ] **Step 2: Add common drop messages to ko.pokemon.json (pokemon tone)**

Add these keys to `src/i18n/ko.pokemon.json`:

```json
"item_drop.tool": "모험 도중 몬스터볼을 발견했다! 몬스터볼 {n}개를 손에 넣었다!",
"item_drop.subagent": "동료가 몬스터볼을 가지고 돌아왔다! 몬스터볼 {n}개를 손에 넣었다!",
"item_drop.session_end": "오늘의 모험 보수로 몬스터볼 {n}개를 받았다!",
"item_drop.generic": "몬스터볼 {n}개를 주웠다!"
```

- [ ] **Step 3: Add common drop messages to en.json (claude tone)**

Add these keys to `src/i18n/en.json`:

```json
"item_drop.tool": "You found a Poké Ball during your adventure! Obtained {n} Poké Ball(s)!",
"item_drop.subagent": "Your companion brought back Poké Balls! Obtained {n} Poké Ball(s)!",
"item_drop.session_end": "Received {n} Poké Ball(s) as today's adventure reward!",
"item_drop.generic": "Found {n} Poké Ball(s)!"
```

- [ ] **Step 4: Add common drop messages to en.pokemon.json (pokemon tone)**

Add these keys to `src/i18n/en.pokemon.json`:

```json
"item_drop.tool": "You found a Poké Ball during your adventure! You obtained {n} Poké Ball(s)!",
"item_drop.subagent": "Your ally brought back Poké Balls! You obtained {n} Poké Ball(s)!",
"item_drop.session_end": "You received {n} Poké Ball(s) as today's adventure reward!",
"item_drop.generic": "You picked up {n} Poké Ball(s)!"
```

- [ ] **Step 5: Run i18n parity test**

Run: `npm test -- test/i18n-parity.test.ts 2>&1 | tail -20`
Expected: Pass (all keys present in all files).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/ko.json src/i18n/ko.pokemon.json src/i18n/en.json src/i18n/en.pokemon.json
git commit -m "feat: add i18n messages for action-based ball drops"
```

---

### Task 8: Add i18n messages — region-specific drop messages (gen1-gen9)

**Files:**
- Modify: `data/gen{1-9}/i18n/ko.json` (9 files)
- Modify: `data/gen{1-9}/i18n/ko.pokemon.json` (9 files, create if missing)
- Modify: `data/gen{1-9}/i18n/en.json` (9 files)
- Modify: `data/gen{1-9}/i18n/en.pokemon.json` (9 files, create if missing)

- [ ] **Step 1: Check which gen i18n files exist**

Run: `ls data/gen*/i18n/`

Verify which files exist. The gen i18n files contain pokemon name translations. We need to add `item_drop.region.{N}` keys. Check if the i18n system loads gen-specific i18n or only `src/i18n/`.

**IMPORTANT**: The current `t()` function in `src/i18n/index.ts` only loads from `src/i18n/`. Gen-specific i18n files under `data/gen*/i18n/` are NOT loaded by `t()` — they contain pokemon names loaded by `getPokemonName()`.

This means region-specific messages need a different approach. Two options:

**Option A**: Add all region messages to the main `src/i18n/` files, namespaced by gen:
```json
"item_drop.region.gen4.1": "마을 근처 풀숲에서 몬스터볼을 발견했다!"
```

**Option B**: Create a dedicated region-messages loader that reads from gen data dirs.

**Go with Option A** — simpler, works with existing `t()`, and avoids adding a new loader. The keys will be `item_drop.region.{gen}.{regionId}.{variationIndex}`.

However, adding ~324 keys to `src/i18n/ko.json` is heavy. A better approach: store region drop messages as a JSON data file (`data/region-drop-messages.json`) and load it directly in `stop.ts`, bypassing `t()`. This keeps the i18n files clean.

- [ ] **Step 2: Create region drop messages data file**

Create `data/region-drop-messages.json` with the structure:

```json
{
  "gen1": {
    "1": {
      "claude": {
        "ko": [
          "마을 근처 풀숲에서 몬스터볼을 발견했습니다!",
          "길가의 풀숲을 헤치다 몬스터볼을 주웠습니다!"
        ],
        "en": [
          "You found a Poké Ball in the tall grass near town!",
          "You picked up a Poké Ball while walking through the grass!"
        ]
      },
      "pokemon": {
        "ko": [
          "마을 근처 풀숲에서 몬스터볼을 발견했다!",
          "길가의 풀숲을 헤치다 몬스터볼을 주웠다!"
        ],
        "en": [
          "Found a Poké Ball in the tall grass near town!",
          "Picked up a Poké Ball while walking through the grass!"
        ]
      }
    }
  }
}
```

This file will contain ALL region messages for ALL gens. Each region has 2-3 variations per voice_tone per language.

The full content for all 9 gens × ~9 regions each should be written by the implementing agent based on the Pokémon pool themes (forest, cave, water, mountain, snow, volcano, electric, ghost, dragon) inferable from each region's Pokémon species.

- [ ] **Step 3: Create loader utility**

Create `src/core/region-messages.ts`:

```typescript
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_PATH = join(__dirname, '../../data/region-drop-messages.json');

type RegionMessages = Record<string, Record<string, Record<string, Record<string, string[]>>>>;

let cached: RegionMessages | null = null;

function load(): RegionMessages {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(MESSAGES_PATH, 'utf-8')) as RegionMessages;
  } catch {
    cached = {};
  }
  return cached;
}

/**
 * Get a random region-specific ball drop message.
 * Returns null if no message found for this gen/region/tone/locale combo.
 */
export function getRegionDropMessage(
  gen: string,
  region: string | number,
  voiceTone: 'claude' | 'pokemon',
  locale: 'ko' | 'en',
): string | null {
  const msgs = load();
  const variations = msgs[gen]?.[String(region)]?.[voiceTone]?.[locale];
  if (!variations || variations.length === 0) return null;
  return variations[Math.floor(Math.random() * variations.length)];
}
```

- [ ] **Step 4: Update stop.ts to use region messages**

Replace the non-battle drop logic added in Task 6 with:

```typescript
import { getRegionDropMessage } from '../core/region-messages.js';
// ... inside the lock block, after encounter processing:

    // Non-battle turn ball drop: 20% chance, 1~5 balls (region-specific message)
    if (!state.last_battle && Math.random() < 0.20) {
      const dropCount = randInt(1, 5);
      addItem(state, 'pokeball', dropCount);
      const gen = getActiveGeneration();
      const regionMsg = getRegionDropMessage(gen, config.current_region, globalConfig.voice_tone as 'claude' | 'pokemon', (config.language ?? 'en') as 'ko' | 'en');
      const dropMsg = regionMsg
        ? `${regionMsg} 🔴×${dropCount}`
        : t('item_drop.generic', { n: dropCount });
      messages.push(dropMsg);
    }
```

- [ ] **Step 5: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: No compile errors.

- [ ] **Step 6: Commit**

```bash
git add data/region-drop-messages.json src/core/region-messages.ts src/hooks/stop.ts
git commit -m "feat: add region-specific ball drop messages for all gens"
```

---

### Task 9: Add tips about ball acquisition

**Files:**
- Modify: `data/tips.json`
- Modify: `src/i18n/ko.json`
- Modify: `src/i18n/ko.pokemon.json`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/en.pokemon.json`

- [ ] **Step 1: Add tip entries to tips.json**

Append these entries to the `data/tips.json` array:

```json
{
  "id": "item_tool_drop",
  "category": "item",
  "template": "🔴 도구를 사용하면 가끔 몬스터볼을 주울 수 있습니다!",
  "dynamic": false,
  "template_key": "tip.item_tool_drop"
},
{
  "id": "item_subagent_drop",
  "category": "item",
  "template": "🔴 서브에이전트를 보내면 반드시 몬스터볼을 가져옵니다!",
  "dynamic": false,
  "template_key": "tip.item_subagent_drop"
},
{
  "id": "item_session_bonus",
  "category": "item",
  "template": "🔴 세션이 끝나면 몬스터볼 보너스를 받을 수 있습니다!",
  "dynamic": false,
  "template_key": "tip.item_session_bonus"
},
{
  "id": "item_field_drop",
  "category": "item",
  "template": "🔴 풀숲을 걷다 보면 몬스터볼이 떨어져 있을 때도 있습니다!",
  "dynamic": false,
  "template_key": "tip.item_field_drop"
}
```

- [ ] **Step 2: Update the existing item_ball_drop tip**

The existing tip says "20%, 5%" which is now outdated. Find and update:

```json
{
  "id": "item_ball_drop",
  "category": "item",
  "template": "🔴 몬스터볼은 전투 승리 시 30%, 패배 시 12% 확률로 드랍됩니다",
  "dynamic": false,
  "template_key": "tip.item_ball_drop"
}
```

- [ ] **Step 3: Add tip i18n keys to all 4 i18n files**

Add to `src/i18n/ko.json`:
```json
"tip.item_tool_drop": "🔴 도구를 사용하면 가끔 몬스터볼을 주울 수 있습니다!",
"tip.item_subagent_drop": "🔴 서브에이전트를 보내면 반드시 몬스터볼을 가져옵니다!",
"tip.item_session_bonus": "🔴 세션이 끝나면 몬스터볼 보너스를 받을 수 있습니다!",
"tip.item_field_drop": "🔴 풀숲을 걷다 보면 몬스터볼이 떨어져 있을 때도 있습니다!",
"tip.item_ball_drop": "🔴 몬스터볼은 전투 승리 시 30%, 패배 시 12% 확률로 드랍됩니다"
```

Add to `src/i18n/ko.pokemon.json`:
```json
"tip.item_tool_drop": "🔴 도구를 사용하면 가끔 몬스터볼을 주울 수 있다!",
"tip.item_subagent_drop": "🔴 서브에이전트를 보내면 반드시 몬스터볼을 가져온다!",
"tip.item_session_bonus": "🔴 세션이 끝나면 몬스터볼 보너스를 받을 수 있다!",
"tip.item_field_drop": "🔴 풀숲을 걷다 보면 몬스터볼이 떨어져 있을 때도 있다!",
"tip.item_ball_drop": "🔴 몬스터볼은 전투 승리 시 30%, 패배 시 12% 확률로 드랍된다"
```

Add to `src/i18n/en.json`:
```json
"tip.item_tool_drop": "🔴 Using tools sometimes lets you find Poké Balls!",
"tip.item_subagent_drop": "🔴 Subagents always bring back Poké Balls!",
"tip.item_session_bonus": "🔴 You get bonus Poké Balls when a session ends!",
"tip.item_field_drop": "🔴 Sometimes Poké Balls are just lying around in the field!",
"tip.item_ball_drop": "🔴 Poké Balls drop at 30% on victory, 12% on loss"
```

Add to `src/i18n/en.pokemon.json`:
```json
"tip.item_tool_drop": "🔴 Using tools sometimes lets you find Poké Balls!",
"tip.item_subagent_drop": "🔴 Subagents always bring back Poké Balls!",
"tip.item_session_bonus": "🔴 You get bonus Poké Balls when a session ends!",
"tip.item_field_drop": "🔴 Sometimes Poké Balls are just lying around in the field!",
"tip.item_ball_drop": "🔴 Poké Balls drop at 30% on victory, 12% on loss"
```

- [ ] **Step 4: Run i18n parity test**

Run: `npm test -- test/i18n-parity.test.ts 2>&1 | tail -20`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add data/tips.json src/i18n/ko.json src/i18n/ko.pokemon.json src/i18n/en.json src/i18n/en.pokemon.json
git commit -m "feat: add ball acquisition tips and update drop rate text"
```

---

### Task 10: Write region-drop-messages.json content

**Files:**
- Modify: `data/region-drop-messages.json` (created in Task 8 with placeholder structure)

- [ ] **Step 1: Write all region messages**

This is the content authoring task. For each gen (1-9), look at each region's Pokémon pool to determine the biome/theme, then write 2-3 variations per voice_tone per language.

**Theme inference guide** (from Pokémon pools):
- Forest/grass mons (Caterpie, Wurmple, etc.) → 풀숲/숲 messages
- Water mons (Goldeen, Tentacool, etc.) → 호수/강/바다 messages
- Cave mons (Zubat, Geodude, etc.) → 동굴 messages
- Mountain mons (Onix, Graveler, etc.) → 산/바위 messages
- Snow/ice mons (Snover, Glaceon, etc.) → 눈밭/설산 messages
- Fire/volcano mons (Magmar, Heatran, etc.) → 화산 messages
- Electric mons (Pikachu, Magneton, etc.) → 발전소/전기 messages
- Ghost mons (Gastly, Misdreavus, etc.) → 유적/탑 messages
- Dragon mons (Dratini, Gible, etc.) → 드래곤 동굴 messages

Each variation should feel like a Pokémon game field message. Example structure per region:

```json
"1": {
  "claude": {
    "ko": [
      "마을 근처 풀숲에서 몬스터볼을 발견했습니다!",
      "길가의 덤불 사이에서 몬스터볼이 반짝였습니다!"
    ],
    "en": [
      "You found a Poké Ball in the tall grass near town!",
      "A Poké Ball was glinting between the bushes!"
    ]
  },
  "pokemon": {
    "ko": [
      "마을 근처 풀숲에서 몬스터볼을 발견했다!",
      "길가의 덤불 사이에서 몬스터볼이 반짝였다!"
    ],
    "en": [
      "Found a Poké Ball in the tall grass near town!",
      "A Poké Ball was glinting between the bushes!"
    ]
  }
}
```

Write ALL gen1 through gen9 messages. Total: ~81 regions × 4 (2 tones × 2 langs) × 2-3 variations.

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/region-drop-messages.json','utf-8')); console.log('Valid JSON')"`
Expected: "Valid JSON"

- [ ] **Step 3: Commit**

```bash
git add data/region-drop-messages.json
git commit -m "content: add region-specific ball drop messages for all gens"
```

---

### Task 11: Full integration test

**Files:** None (test-only)

- [ ] **Step 1: Run full test suite**

Run: `npm test 2>&1`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: Clean build, no errors.

- [ ] **Step 3: Verify hooks.json is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')); console.log('Valid JSON')"`
Expected: "Valid JSON"

- [ ] **Step 4: Verify region-drop-messages.json is complete**

Run: `node -e "const m=JSON.parse(require('fs').readFileSync('data/region-drop-messages.json','utf-8')); const gens=Object.keys(m); console.log('Gens:', gens.length, gens); for(const g of gens){console.log(g, Object.keys(m[g]).length, 'regions')}"`
Expected: 9 gens, each with the correct number of regions.

- [ ] **Step 5: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: integration test fixes for ball economy rebalance"
```
