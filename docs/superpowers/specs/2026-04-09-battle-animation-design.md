# Battle Status Line Animation

## Overview

Add timestamp-based animations to the battle status line in Tokenmon. Animations play during Claude's response generation (when status line updates are frequent) and gracefully freeze on the last frame during idle.

## Data Changes

### LastHit (extended)

```typescript
interface LastHit {
  target: 'player' | 'opponent';
  damage: number;
  effectiveness: 'super' | 'normal' | 'not_very' | 'immune';
  timestamp: number;   // Date.now() at hit time
  prevHp: number;      // HP before damage applied
}
```

### BattleStateFile (extended)

```typescript
interface BattleStateFile {
  // ... existing fields
  defeatTimestamp?: number;  // set when player loses
}
```

## Animations

### 1. HP Bar Drain (~1.5s)

- **Trigger:** `lastHit` with recent timestamp
- **Behavior:** Linear interpolation from `prevHp` to current HP
- **Formula:** `displayHp = prevHp - (prevHp - currentHp) * progress`

### 2. Sprite Shake (~0.8s)

- **Trigger:** `lastHit.target` identifies which sprite shakes
- **Behavior:** Prepend 0 or 1 space to each sprite row, alternating by elapsed time
- **Pattern:** ~100ms cycle: offset / no-offset / offset / ...

### 3. Hit Flash (~0.6s)

- **Trigger:** `lastHit` exists within window
- **Behavior:** Show/hide the existing `💥` marker on ~0.3s toggle cycle
- **After duration:** `💥` disappears

### 4. Type Color Flash (~1.0s)

- **Trigger:** `lastHit.effectiveness === 'super'`
- **Behavior:** HP bar color alternates red/yellow on ~0.2s cycle
- **After duration:** Normal HP color resumes

### 5. Sprite Collapse (~2.0s)

- **Trigger:** `defeatTimestamp` set (player lost)
- **Behavior:** Replace sprite rows from top to bottom with empty space, proportional to progress
- **Formula:** `emptyRows = Math.floor(totalRows * progress)`

## Animation Engine

```
elapsed = Date.now() - timestamp
if elapsed < DURATION:
  progress = clamp(elapsed / DURATION, 0, 1)
  apply animation transforms
else:
  static render (current behavior)
```

Each animation is independent with its own duration constant. Multiple can run concurrently (e.g., shake + flash + drain all from same hit).

## Files to Modify

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `timestamp`, `prevHp` to LastHit; `defeatTimestamp` to BattleStateFile |
| `src/cli/battle-turn.ts` | Record timestamp + prevHp when writing lastHit |
| `src/core/battle-state-io.ts` | Write defeatTimestamp on defeat |
| `src/status-line.ts` | Animation logic in renderBattleMode |

## Constraints

- No animation during idle (status line not called)
- Animation freezes at last computed frame if updates stop
- Zero performance overhead beyond timestamp comparison
- All animations degrade gracefully to static display
