# Pokeball Drop Rate Rebalance

**Date**: 2026-04-08
**Goal**: Reduce ball inflation so inventory naturally stays in the 50~300 range.

## Problem

Current drop rates produce ~0.7 balls/turn while consumption is ~0.15 balls/turn (4-5x surplus). Inventory grows unchecked — 80 sessions produced 478 balls. The existing soft cap (starts at 100) only slows accumulation, never reverses it.

## Design

### 1. Remove battle drops entirely

| Route | Before | After |
|-------|--------|-------|
| Victory drop | 30%, 1~3 balls | Removed |
| Defeat drop | 12%, 1 ball | Removed |

Simplifies the economy to a single income source.

### 2. Adjust non-battle drop

| Metric | Before | After |
|--------|--------|-------|
| Drop chance | 20% | 10% |
| Drop count | 1~5 | 1~3 |

Expected income: ~0.2 balls/turn (vs ~0.15 consumption).

### 3. Redesign soft cap

Inventory-based multiplier applied to the base drop chance:

| Inventory | Multiplier | Effective rate |
|-----------|------------|----------------|
| 0~49 | 2.0x | 20% |
| 50~149 | 1.0x | 10% |
| 150~299 | 0.3x | 3% |
| 300+ | 0.1x | 1% |

This creates a self-correcting system:
- Below 50: boosted recovery pulls inventory up
- 50~149: equilibrium zone (income ~= consumption)
- 150+: strong deceleration pushes inventory back down
- 300+: near-stall but not fully blocked

### 4. Existing inventory

Do not reset or modify existing user inventories. Users with 300+ balls will naturally deplete through encounters as new drops are near-zero at that level.

## Files to change

- `src/core/items.ts` — Remove `VICTORY_DROP_RATE`, `LOSS_DROP_RATE`, battle drop logic. Replace soft cap table with new tiers.
- `src/hooks/stop.ts` — Update non-battle drop chance (20% -> 10%) and count range (1~5 -> 1~3). Remove battle ball drop calls.
- Tests — Update constants in any tests referencing old drop rates.

## Expected outcome

- Inventory converges to 50~300 range regardless of starting point
- No manual resets needed
- Simpler economy (one income source instead of three)
