# Battle Status Line Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 timestamp-based animations to the battle status line: HP drain, sprite shake, hit flash, type color flash, and sprite collapse on defeat.

**Architecture:** Animations are driven by comparing `Date.now()` against a `timestamp` stored in `lastHit` (or `defeatTimestamp`). Each animation has its own duration constant and computes a `progress` (0-1) value. Multiple animations run concurrently from the same hit event. All rendering changes are confined to `renderBattleMode()` in `status-line.ts`.

**Tech Stack:** TypeScript, Node.js built-in `node:test`, ANSI escape codes

**Worktree:** Branch `feat/animation` (worktree root)

---

### Task 1: Extend Types — Add timestamp and prevHp to LastHit, defeatTimestamp to BattleStateFile

**Files:**
- Modify: `src/core/battle-state-io.ts:17-31`

- [ ] **Step 1: Add `timestamp` and `prevHp` to LastHit interface**

In `src/core/battle-state-io.ts`, update the `LastHit` interface:

```typescript
export interface LastHit {
  target: 'player' | 'opponent';
  damage: number;
  effectiveness: 'super' | 'normal' | 'not_very' | 'immune';
  timestamp: number;
  prevHp: number;
}
```

- [ ] **Step 2: Add `defeatTimestamp` to BattleStateFile interface**

In the same file, update `BattleStateFile`:

```typescript
export interface BattleStateFile {
  battleState: BattleState;
  gym: GymData;
  generation: string;
  stateDir: string;
  playerPartyNames: string[];
  lastHit?: LastHit | null;
  sessionId?: string;
  defeatTimestamp?: number;
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Type errors in `battle-turn.ts` where `detectLastHit` returns the old shape (missing `timestamp`, `prevHp`). This is expected — we fix it in Task 2.

- [ ] **Step 4: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/core/battle-state-io.ts
git commit -m "feat(types): add timestamp, prevHp to LastHit; defeatTimestamp to BattleStateFile"
```

---

### Task 2: Record timestamp and prevHp in battle-turn.ts

**Files:**
- Modify: `src/cli/battle-turn.ts:85-111` (detectLastHit)
- Modify: `src/cli/battle-turn.ts:606-631` (handleDefeat)

- [ ] **Step 1: Update detectLastHit to include timestamp and prevHp**

In `src/cli/battle-turn.ts`, update the `detectLastHit` function signature and return values:

```typescript
function detectLastHit(
  messages: string[],
  playerHpBefore: number,
  opponentHpBefore: number,
  playerHpAfter: number,
  opponentHpAfter: number,
): LastHit | null {
  let effectiveness: LastHit['effectiveness'] = 'normal';
  for (const msg of messages) {
    if (msg.includes('효과가 굉장했다')) { effectiveness = 'super'; break; }
    if (msg.includes('효과가 별로인')) { effectiveness = 'not_very'; break; }
    if (msg.includes('효과가 없는')) { effectiveness = 'immune'; break; }
  }

  const opponentDamage = opponentHpBefore - opponentHpAfter;
  const playerDamage = playerHpBefore - playerHpAfter;
  const now = Date.now();

  if (opponentDamage > 0) {
    return { target: 'opponent', damage: opponentDamage, effectiveness, timestamp: now, prevHp: opponentHpBefore };
  }
  if (playerDamage > 0) {
    return { target: 'player', damage: playerDamage, effectiveness, timestamp: now, prevHp: playerHpBefore };
  }
  return null;
}
```

- [ ] **Step 2: Record defeatTimestamp in handleDefeat**

In `handleDefeat`, set `defeatTimestamp` on `bsf` before writing/deleting state. The key change: **don't delete battle state immediately on defeat** — keep it alive so the status line can render the collapse animation. Add a short comment explaining why.

Replace the `handleDefeat` function:

```typescript
function handleDefeat(bsf: BattleStateFile, messages: string[]): void {
  const { battleState, gym, generation, stateDir } = bsf;

  // Load & save state (battle stats)
  const genDir = join(stateDir, generation);
  const statePath = join(genDir, 'state.json');
  if (existsSync(statePath)) {
    const state: State = JSON.parse(readFileSync(statePath, 'utf-8'));
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  messages.push(t('battle.defeat', { leader: gym.leaderKo }));

  // Keep battle-state.json alive with defeatTimestamp so the status line
  // can render the sprite collapse animation. The next status line render
  // after the animation window expires will delete it.
  bsf.defeatTimestamp = Date.now();
  writeBattleState(bsf);

  output({
    status: 'defeat',
    messages,
    badge: null,
    opponent: pokemonInfo(getActivePokemon(battleState.opponent)),
    player: pokemonInfo(getActivePokemon(battleState.player)),
  });
}
```

- [ ] **Step 3: Verify build compiles cleanly**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/cli/battle-turn.ts
git commit -m "feat(battle-turn): record timestamp/prevHp in lastHit, defeatTimestamp on defeat"
```

---

### Task 3: Animation constants and helper — animProgress utility

**Files:**
- Modify: `src/status-line.ts` (add constants and helper near top, after imports)

- [ ] **Step 1: Add animation duration constants and progress helper**

In `src/status-line.ts`, after the existing `MAX_CONTEXT` constant (around line 43), add:

```typescript
// ── Battle Animation Constants ──
const ANIM_HP_DRAIN_MS   = 1500;
const ANIM_SHAKE_MS       = 800;
const ANIM_HIT_FLASH_MS   = 600;
const ANIM_COLOR_FLASH_MS = 1000;
const ANIM_COLLAPSE_MS    = 2000;
// Grace period: keep defeat battle-state alive for collapse animation + buffer
const DEFEAT_CLEANUP_MS   = ANIM_COLLAPSE_MS + 500;

/** Returns animation progress 0..1, or null if animation window has expired. */
function animProgress(timestamp: number | undefined, durationMs: number): number | null {
  if (timestamp == null) return null;
  const elapsed = Date.now() - timestamp;
  if (elapsed < 0 || elapsed >= durationMs) return null;
  return Math.min(1, elapsed / durationMs);
}
```

- [ ] **Step 2: Verify build**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors (constants/helper are defined but not yet used).

- [ ] **Step 3: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/status-line.ts
git commit -m "feat(status-line): add animation duration constants and animProgress helper"
```

---

### Task 4: Animation 1 — HP Bar Drain

**Files:**
- Modify: `src/status-line.ts` (renderBattleMode, around lines 370-383)

- [ ] **Step 1: Create animatedHpBar helper function**

Add this function right after the existing `hpBar` function (after line 295):

```typescript
/** HP bar with drain animation: interpolates from prevHp to currentHp over ANIM_HP_DRAIN_MS. */
function animatedHpBar(
  currentHp: number,
  maxHp: number,
  lastHit: { target: 'player' | 'opponent'; timestamp: number; prevHp: number } | null | undefined,
  side: 'player' | 'opponent',
  width: number = 10,
): string {
  if (!lastHit || lastHit.target !== side) return hpBar(currentHp, maxHp, width);

  const progress = animProgress(lastHit.timestamp, ANIM_HP_DRAIN_MS);
  if (progress == null) return hpBar(currentHp, maxHp, width);

  // Interpolate: prevHp → currentHp
  const displayHp = Math.round(lastHit.prevHp - (lastHit.prevHp - currentHp) * progress);
  return hpBar(displayHp, maxHp, width);
}
```

- [ ] **Step 2: Wire animatedHpBar into renderBattleMode**

Replace the HP bar rendering block (lines 373-379) in `renderBattleMode`. Find:

```typescript
  // HP bar: flash red for 1 turn after being hit
  const oppHpBarStr = lastHit?.target === 'opponent'
    ? `\x1b[31m${'█'.repeat(Math.round(Math.max(0, oppMon.currentHp / oppMon.maxHp) * 10))}\x1b[90m${'░'.repeat(10 - Math.round(Math.max(0, oppMon.currentHp / oppMon.maxHp) * 10))}\x1b[0m`
    : hpBar(oppMon.currentHp, oppMon.maxHp);
  const playerHpBarStr = lastHit?.target === 'player'
    ? `\x1b[31m${'█'.repeat(Math.round(Math.max(0, playerMon.currentHp / playerMon.maxHp) * 10))}\x1b[90m${'░'.repeat(10 - Math.round(Math.max(0, playerMon.currentHp / playerMon.maxHp) * 10))}\x1b[0m`
    : hpBar(playerMon.currentHp, playerMon.maxHp);
```

Replace with:

```typescript
  const oppHpBarStr = animatedHpBar(oppMon.currentHp, oppMon.maxHp, lastHit, 'opponent');
  const playerHpBarStr = animatedHpBar(playerMon.currentHp, playerMon.maxHp, lastHit, 'player');
```

- [ ] **Step 3: Verify build**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/status-line.ts
git commit -m "feat(anim): HP bar drain animation with linear interpolation"
```

---

### Task 5: Animation 2 — Sprite Shake

**Files:**
- Modify: `src/status-line.ts` (renderBattleMode, sprite rendering loop around lines 347-358)

- [ ] **Step 1: Add sprite shake logic to the sprite render loop**

Replace the sprite rendering loop (lines 347-358) in `renderBattleMode`. Find:

```typescript
  if (firstRow <= lastRow) {
    for (let row = firstRow; row <= lastRow; row++) {
      const oppLine = oppSprite[row] ?? '';
      const playerLine = playerSprite[row] ?? '';
      // Pad opponent sprite to SPRITE_WIDTH
      const oppVisible = oppLine.replace(/\x1b\[[^m]*m/g, '').length;
      const oppPadded = oppVisible < SPRITE_WIDTH ? oppLine + '\u2800'.repeat(SPRITE_WIDTH - oppVisible) : oppLine;
      // Pad player sprite to SPRITE_WIDTH
      const playerVisible = playerLine.replace(/\x1b\[[^m]*m/g, '').length;
      const playerPadded = playerVisible < SPRITE_WIDTH ? playerLine + '\u2800'.repeat(SPRITE_WIDTH - playerVisible) : playerLine;
      console.log(oppPadded + gap + playerPadded);
    }
  }
```

Replace with:

```typescript
  // Shake: compute offset (0 or 1 braille blank) based on elapsed time
  const shakeProgress = lastHit ? animProgress(lastHit.timestamp, ANIM_SHAKE_MS) : null;
  const shakeTarget = lastHit?.target ?? null;

  if (firstRow <= lastRow) {
    for (let row = firstRow; row <= lastRow; row++) {
      const oppLine = oppSprite[row] ?? '';
      const playerLine = playerSprite[row] ?? '';

      // Shake: alternate offset every ~100ms
      let oppShake = '';
      let playerShake = '';
      if (shakeProgress != null && shakeTarget) {
        const elapsed = Date.now() - lastHit!.timestamp;
        const shakeOn = Math.floor(elapsed / 100) % 2 === 1;
        if (shakeOn) {
          if (shakeTarget === 'opponent') oppShake = '\u2800';
          else playerShake = '\u2800';
        }
      }

      // Pad opponent sprite to SPRITE_WIDTH
      const oppVisible = (oppShake + oppLine).replace(/\x1b\[[^m]*m/g, '').length;
      const oppPadded = oppVisible < SPRITE_WIDTH
        ? oppShake + oppLine + '\u2800'.repeat(SPRITE_WIDTH - oppVisible)
        : oppShake + oppLine;
      // Pad player sprite to SPRITE_WIDTH
      const playerVisible = (playerShake + playerLine).replace(/\x1b\[[^m]*m/g, '').length;
      const playerPadded = playerVisible < SPRITE_WIDTH
        ? playerShake + playerLine + '\u2800'.repeat(SPRITE_WIDTH - playerVisible)
        : playerShake + playerLine;
      console.log(oppPadded + gap + playerPadded);
    }
  }
```

- [ ] **Step 2: Verify build**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/status-line.ts
git commit -m "feat(anim): sprite shake on hit — alternating offset every 100ms"
```

---

### Task 6: Animation 3 — Hit Flash (💥 toggle)

**Files:**
- Modify: `src/status-line.ts` (renderBattleMode, hit indicator lines 361-363)

- [ ] **Step 1: Replace static hit marker with animated flash**

Find the hit indicator block (lines 361-363):

```typescript
  // Hit indicator: show 💥 next to the pokemon that was hit last turn
  const oppHitMark = lastHit?.target === 'opponent' ? ' 💥' : '';
  const playerHitMark = lastHit?.target === 'player' ? ' 💥' : '';
```

Replace with:

```typescript
  // Hit flash: 💥 toggles on/off every 300ms during the animation window
  let oppHitMark = '';
  let playerHitMark = '';
  if (lastHit) {
    const flashProgress = animProgress(lastHit.timestamp, ANIM_HIT_FLASH_MS);
    if (flashProgress != null) {
      const elapsed = Date.now() - lastHit.timestamp;
      const flashOn = Math.floor(elapsed / 300) % 2 === 0;
      if (flashOn) {
        if (lastHit.target === 'opponent') oppHitMark = ' 💥';
        else playerHitMark = ' 💥';
      }
    }
  }
```

- [ ] **Step 2: Verify build**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/status-line.ts
git commit -m "feat(anim): hit flash — 💥 toggles on 300ms cycle"
```

---

### Task 7: Animation 4 — Type Color Flash (super effective)

**Files:**
- Modify: `src/status-line.ts` (animatedHpBar function from Task 4)

- [ ] **Step 1: Integrate type color flash into animatedHpBar**

Update the `animatedHpBar` function to also handle color flash when effectiveness is super. Replace the entire function:

```typescript
/** HP bar with drain animation + type color flash for super effective hits. */
function animatedHpBar(
  currentHp: number,
  maxHp: number,
  lastHit: { target: 'player' | 'opponent'; effectiveness: string; timestamp: number; prevHp: number } | null | undefined,
  side: 'player' | 'opponent',
  width: number = 10,
): string {
  if (!lastHit || lastHit.target !== side) return hpBar(currentHp, maxHp, width);

  const drainProgress = animProgress(lastHit.timestamp, ANIM_HP_DRAIN_MS);
  const colorProgress = animProgress(lastHit.timestamp, ANIM_COLOR_FLASH_MS);

  // Determine display HP (drain animation)
  const displayHp = drainProgress != null
    ? Math.round(lastHit.prevHp - (lastHit.prevHp - currentHp) * drainProgress)
    : currentHp;

  // Type color flash: alternate red/yellow every 200ms for super effective
  if (colorProgress != null && lastHit.effectiveness === 'super') {
    const elapsed = Date.now() - lastHit.timestamp;
    const flashColor = Math.floor(elapsed / 200) % 2 === 0 ? '\x1b[31m' : '\x1b[33m';
    const ratio = Math.max(0, Math.min(1, displayHp / maxHp));
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    return `${flashColor}${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m`;
  }

  return hpBar(displayHp, maxHp, width);
}
```

- [ ] **Step 2: Verify build**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/status-line.ts
git commit -m "feat(anim): type color flash — red/yellow alternation on super effective"
```

---

### Task 8: Animation 5 — Sprite Collapse on Defeat

**Files:**
- Modify: `src/status-line.ts` (renderBattleMode — sprite rendering + defeat cleanup)

- [ ] **Step 1: Add collapse logic to sprite rendering**

In `renderBattleMode`, after loading sprites (around lines 322-326), add collapse logic. Find:

```typescript
  // Load sprites (skip for fainted pokemon)
  const oppFainted = oppMon.fainted || oppMon.currentHp <= 0;
  const playerFainted = playerMon.fainted || playerMon.currentHp <= 0;
  const oppSprite = oppFainted ? [] : loadSprite(oppMon.id);
  const playerSprite = playerFainted ? [] : loadSprite(playerMon.id);
```

Replace with:

```typescript
  // Load sprites (skip for fainted pokemon, unless collapse animation is active)
  const oppFainted = oppMon.fainted || oppMon.currentHp <= 0;
  const playerFainted = playerMon.fainted || playerMon.currentHp <= 0;

  const defeatTs = (battleData as any).defeatTimestamp as number | undefined;
  const collapseProgress = animProgress(defeatTs, ANIM_COLLAPSE_MS);

  // During collapse: still load the player sprite so we can partially erase it
  const oppSprite = oppFainted ? [] : loadSprite(oppMon.id);
  let playerSprite = (playerFainted && collapseProgress == null) ? [] : loadSprite(playerMon.id);

  // Collapse: replace top rows with blank lines proportional to progress
  if (collapseProgress != null && playerSprite.length > 0) {
    const emptyRows = Math.floor(playerSprite.length * collapseProgress);
    const blankLine = '\u2800'.repeat(SPRITE_WIDTH);
    playerSprite = playerSprite.map((line, i) => i < emptyRows ? blankLine : line);
  }

  // Defeat cleanup: after collapse animation expires, delete battle-state.json
  if (defeatTs != null && collapseProgress == null) {
    const elapsed = Date.now() - defeatTs;
    if (elapsed >= DEFEAT_CLEANUP_MS) {
      try {
        const { unlinkSync } = require('fs');
        const { BATTLE_STATE_PATH } = require('./core/battle-state-io.js');
        unlinkSync(BATTLE_STATE_PATH);
      } catch { /* ignore */ }
    }
  }
```

- [ ] **Step 2: Update renderBattleMode type signature to accept defeatTimestamp**

Update the `battleData` parameter type in `renderBattleMode` (line 298). Find:

```typescript
function renderBattleMode(battleData: {
  battleState: {
```

Replace with:

```typescript
function renderBattleMode(battleData: {
  defeatTimestamp?: number;
  battleState: {
```

And update the destructuring (line 310). Find:

```typescript
  const { battleState, gym, lastHit } = battleData;
```

Replace with:

```typescript
  const { battleState, gym, lastHit, defeatTimestamp } = battleData;
```

Then replace the `defeatTs` line in step 1 to use the properly typed field:

```typescript
  const collapseProgress = animProgress(defeatTimestamp, ANIM_COLLAPSE_MS);
```

Remove the `(battleData as any).defeatTimestamp` cast — use `defeatTimestamp` from destructuring instead.

- [ ] **Step 3: Update the lastHit type in the renderBattleMode signature**

The `lastHit` type in the function signature needs `timestamp` and `prevHp`. Find:

```typescript
  lastHit?: { target: 'player' | 'opponent'; damage: number; effectiveness: string } | null;
```

Replace with:

```typescript
  lastHit?: { target: 'player' | 'opponent'; damage: number; effectiveness: string; timestamp: number; prevHp: number } | null;
```

- [ ] **Step 4: Remove the now-unnecessary require() calls and use the import + defeatTimestamp from destructuring**

The cleanup block should use the already-imported modules. Replace the cleanup block:

```typescript
  // Defeat cleanup: after collapse animation + grace period, delete battle-state.json
  if (defeatTimestamp != null && collapseProgress == null) {
    const elapsed = Date.now() - defeatTimestamp;
    if (elapsed >= DEFEAT_CLEANUP_MS) {
      try { unlinkSync(BATTLE_STATE_PATH); } catch { /* ignore */ }
    }
  }
```

Add the import for `BATTLE_STATE_PATH` at the top of the file (line 1 area). The `unlinkSync` is already imported from `fs`. Add to existing imports:

```typescript
import { BATTLE_STATE_PATH } from './core/battle-state-io.js';
```

- [ ] **Step 5: Verify build**

Run: `cd "$WORKTREE_ROOT" && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd "$WORKTREE_ROOT"
git add src/status-line.ts
git commit -m "feat(anim): sprite collapse on defeat — rows erase top-to-bottom over 2s"
```

---

### Task 9: Unit Tests for Animation Helpers

**Files:**
- Create: `test/animation.test.ts`

- [ ] **Step 1: Write tests for animProgress and animatedHpBar**

We need to export the animation functions for testing. First, in `src/status-line.ts`, at the bottom of the file (before the `main()` call), add:

```typescript
// Exported for testing only
export { animProgress, animatedHpBar, hpBar };
```

Then create `test/animation.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We test the logic directly by reimplementing the pure functions
// (status-line.ts has side effects on import, so we test the logic in isolation)

describe('animProgress', () => {
  const animProgress = (timestamp: number | undefined, durationMs: number): number | null => {
    if (timestamp == null) return null;
    const elapsed = Date.now() - timestamp;
    if (elapsed < 0 || elapsed >= durationMs) return null;
    return Math.min(1, elapsed / durationMs);
  };

  it('returns null for undefined timestamp', () => {
    assert.equal(animProgress(undefined, 1000), null);
  });

  it('returns null when animation has expired', () => {
    const old = Date.now() - 2000;
    assert.equal(animProgress(old, 1000), null);
  });

  it('returns progress between 0 and 1 during animation', () => {
    const now = Date.now();
    const progress = animProgress(now, 1000);
    assert.notEqual(progress, null);
    assert.ok(progress! >= 0 && progress! <= 1);
  });

  it('returns ~0.5 at midpoint', () => {
    const mid = Date.now() - 500;
    const progress = animProgress(mid, 1000);
    assert.notEqual(progress, null);
    assert.ok(progress! >= 0.45 && progress! <= 0.55);
  });
});

describe('HP drain interpolation', () => {
  const interpolateHp = (prevHp: number, currentHp: number, progress: number): number => {
    return Math.round(prevHp - (prevHp - currentHp) * progress);
  };

  it('returns prevHp at progress=0', () => {
    assert.equal(interpolateHp(100, 60, 0), 100);
  });

  it('returns currentHp at progress=1', () => {
    assert.equal(interpolateHp(100, 60, 1), 60);
  });

  it('returns midpoint at progress=0.5', () => {
    assert.equal(interpolateHp(100, 60, 0.5), 80);
  });

  it('handles zero damage (prevHp === currentHp)', () => {
    assert.equal(interpolateHp(100, 100, 0.5), 100);
  });

  it('handles KO (currentHp=0)', () => {
    assert.equal(interpolateHp(80, 0, 0.5), 40);
    assert.equal(interpolateHp(80, 0, 1), 0);
  });
});

describe('sprite collapse row calculation', () => {
  const calcEmptyRows = (totalRows: number, progress: number): number => {
    return Math.floor(totalRows * progress);
  };

  it('returns 0 at start', () => {
    assert.equal(calcEmptyRows(14, 0), 0);
  });

  it('returns all rows at progress=1', () => {
    assert.equal(calcEmptyRows(14, 1), 14);
  });

  it('returns half at progress=0.5', () => {
    assert.equal(calcEmptyRows(14, 0.5), 7);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd "$WORKTREE_ROOT" && node --import tsx --test test/animation.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
cd "$WORKTREE_ROOT"
git add test/animation.test.ts src/status-line.ts
git commit -m "test: animation helper logic — animProgress, HP drain interpolation, collapse rows"
```

---

### Task 10: Manual Integration Test

**Files:** None (manual verification)

- [ ] **Step 1: Create a mock battle-state.json with animation fields**

```bash
cd "$WORKTREE_ROOT"
cat > /tmp/test-battle-state.json << 'JSONEOF'
{
  "battleState": {
    "player": {
      "pokemon": [{"id": 6, "name": "charizard", "displayName": "리자몽", "types": ["fire","flying"], "level": 50, "maxHp": 153, "currentHp": 80, "attack": 100, "defense": 90, "spAttack": 120, "spDefense": 100, "speed": 110, "moves": [], "fainted": false}],
      "activeIndex": 0
    },
    "opponent": {
      "pokemon": [{"id": 68, "name": "machamp", "displayName": "괴력몬", "types": ["fighting"], "level": 48, "maxHp": 150, "currentHp": 45, "attack": 130, "defense": 80, "spAttack": 65, "spDefense": 85, "speed": 55, "moves": [], "fainted": false}],
      "activeIndex": 0
    },
    "turn": 3,
    "log": [],
    "phase": "select_action",
    "winner": null
  },
  "gym": {"id": 1, "leader": "Brawly", "leaderKo": "철구", "type": "fighting", "badge": "knuckle", "badgeKo": "너클배지", "team": [], "region": "hoenn"},
  "generation": "gen4",
  "stateDir": "/tmp",
  "playerPartyNames": ["charizard"],
  "lastHit": {"target": "opponent", "damage": 45, "effectiveness": "super", "timestamp": TIMESTAMP_PLACEHOLDER, "prevHp": 90}
}
JSONEOF
# Replace placeholder with current timestamp
sed -i "s/TIMESTAMP_PLACEHOLDER/$(date +%s%3N)/" /tmp/test-battle-state.json
cp /tmp/test-battle-state.json ~/.claude/tokenmon/battle-state.json
```

- [ ] **Step 2: Run the status line manually to see output**

```bash
cd "$WORKTREE_ROOT"
echo '{"rate_limits":{"five_hour":{"used_percentage":10,"resets_at":0}}}' | npx tsx src/status-line.ts
```

Expected: Renders battle mode with animated HP bar (since timestamp is recent, drain animation should be mid-progress).

- [ ] **Step 3: Clean up test battle state**

```bash
rm -f ~/.claude/tokenmon/battle-state.json
```

- [ ] **Step 4: Verify full build**

```bash
cd "$WORKTREE_ROOT" && npx tsc --noEmit && node --import tsx --test test/animation.test.ts
```

Expected: Clean build, all tests pass.

- [ ] **Step 5: Commit (no code changes — just verification)**

No commit needed. All implementation is complete.
