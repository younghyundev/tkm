# Pokéball Economy Rebalance — Soft Cap Design

**Date:** 2026-04-07
**Status:** Approved

## Problem

Pokéball inventory inflates to hundreds due to:
- `rollItemDrop()` fires every tool call via stop hook
- Volume tiers multiply encounter rate up to 4x (legendary tier: 60% per tool call)
- No inventory cap — balls accumulate indefinitely
- Only consumption is catching, which doesn't keep pace with drops

## Solution: Soft Cap with Diminishing Drop Rates

### Drop Rate Dampening

Apply a multiplier to drop probability based on current Pokéball count:

| Inventory | Drop Rate Multiplier | Effective Win Drop | Effective Loss Drop |
|-----------|---------------------|--------------------|---------------------|
| 0–99      | 1.0x                | 30%                | 12%                 |
| 100–199   | 0.5x                | 15%                | 6%                  |
| 200–299   | 0.25x               | 7.5%               | 3%                  |
| 300+      | 0.1x                | 3%                  | 1.2%                |

### Drop Quantity Nerf

Reduce per-drop quantity alongside rate dampening:

| Condition | Before | After |
|-----------|--------|-------|
| Victory   | 1–5    | 1–3   |
| Loss      | 1–2    | 1     |

### Unchanged

- Achievement rewards (fixed ball grants)
- Milestone rewards (pokedex-rewards.json)
- Chain completion rewards
- Ball cost formula (`getBallCost()`)
- Catch mechanics

## Expected Behavior

- **0–99 balls:** Same feel as current. Fast recovery after catching a mythical (82 balls).
- **100–200:** Gradual slowdown. Player notices drops are less frequent.
- **200–300:** Clear deceleration. Accumulation nearly stalls.
- **300+:** Near-zero drops. Inventory effectively capped without a hard limit.
- **Mythical catch at 300 → drops to 218:** Returns to 0.25x zone, recovers naturally.

## Implementation Scope

**Single file change:** `src/core/items.ts` — modify `rollItemDrop()` function.

1. Add `getDropRateMultiplier(state)` helper that reads current pokeball count and returns the tier multiplier
2. Apply multiplier to `rate` in `rollItemDrop()`
3. Change victory quantity from `randInt(1, 5)` to `randInt(1, 3)`
4. Change loss quantity from `randInt(1, 2)` to `1`

No changes needed to battle.ts, encounter.ts, achievements, or any other system.

## Testing

- Unit test: verify `getDropRateMultiplier()` returns correct values at boundaries (0, 99, 100, 199, 200, 299, 300, 500)
- Unit test: verify `rollItemDrop()` applies multiplier correctly
- Unit test: verify quantity ranges (victory 1-3, loss 1)
