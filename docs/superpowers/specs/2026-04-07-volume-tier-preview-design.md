# Volume Tier Preview — Status Bar Integration Design

**Date:** 2026-04-07
**Status:** Approved

## Problem

Volume tier flavor messages ("풀숲이 크게 흔들리고 있다...") are shown via `system_message` in the Claude Code chat. Users rarely notice them. The tier effect (XP/encounter multipliers) is applied immediately on the same turn with no preview, so there's no anticipation.

## Solution: Tier Preview on Status Bar + Delayed Application

### Behavior Change

1. **This turn:** Compute tier from `deltaTokens` → store as `state.pending_tier` → show preview on status bar
2. **Next turn:** Read `state.pending_tier` → apply its XP/encounter multipliers → compute new tier → store again
3. **Remove** tier message from `system_message` (no longer in chat)

### Status Bar Layout

```
[Sprite]
[Achievement line]
[Battle result / Drop / Tip]        ← existing, unchanged
[Tier preview]                       ← NEW line, only shown when tier != normal
[Party info]
[Footer: gen/region/balls/rest]
```

Tier preview is an independent line. It always shows when `pending_tier` is not normal, regardless of whether a battle result exists on the same turn.

### Tier Preview Messages

**Korean:**
| Tier | Message |
|------|---------|
| heated | 풀숲이 크게 흔들리고 있다... (다음 턴 조우율 1.5x, XP 1.5x) |
| intense | 주변에 수상한 기운이 감돌고 있다... (다음 턴 조우율 2.5x, XP 2.5x) |
| legendary | 공기 속에 강한 에너지가 차오른다! (다음 턴 조우율 4x, XP 5x) |

**English:**
| Tier | Message |
|------|---------|
| heated | The tall grass is rustling intensely... (Next: encounter 1.5x, XP 1.5x) |
| intense | Something seems to be lurking nearby... (Next: encounter 2.5x, XP 2.5x) |
| legendary | The air is crackling with powerful energy! (Next: encounter 4x, XP 5x) |

Normal tier: no preview line shown.

### Delayed Application Flow

**stop.ts execution order:**

1. Read `state.pending_tier` from previous turn (default: `null` → treat as normal)
2. Use `pending_tier` for this turn's XP multiplier and encounter multiplier
3. Compute new tier from this turn's `deltaTokens`
4. Store new tier name as `state.pending_tier` (or `null` if normal)
5. Status bar reads `state.pending_tier` and renders the preview line

**First session:** No pending tier → normal multipliers. Tier computed and stored for next turn.

### State Changes

Add to `State` interface in `src/core/types.ts`:

```typescript
pending_tier?: string | null;  // volume tier name to apply next turn
```

### Implementation Scope

**Files to modify:**
- `src/core/types.ts` — add `pending_tier` field to State
- `src/hooks/stop.ts` — remove `messages.push(tier)`, read/write `pending_tier`, apply delayed tier
- `src/status-line.ts` — render tier preview line
- `src/core/volume-tier.ts` — add helper to get tier by name, add preview message formatter
- `src/i18n/ko.json` — update tier messages with effect descriptions
- `src/i18n/en.json` — update tier messages with effect descriptions
- `src/i18n/ko.pokemon.json` — update tier messages with effect descriptions
- `src/i18n/en.pokemon.json` — update tier messages with effect descriptions

**Unchanged:**
- `src/core/encounter.ts` — still receives tier object, no changes
- `src/core/battle.ts` — unaffected
- Achievement/milestone systems — unaffected

### Testing

- Unit test: `getVolumeTierByName()` returns correct tier for each name
- Unit test: tier preview message formatter returns correct i18n string with multipliers
- Unit test: `pending_tier` defaults to null/normal when missing (backward compat)
- Integration: verify stop.ts applies `pending_tier` from previous turn, not current tier
