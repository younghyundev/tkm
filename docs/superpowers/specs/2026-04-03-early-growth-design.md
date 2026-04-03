# Early Growth Improvement Design

**Date:** 2026-04-03
**Status:** Draft
**Problem:** Light users feel no progression — levels barely move, evolution is unreachable, new Pokémon encounters are sparse. Hard users are fine with the current pace.

---

## 1. Turn Floor (Minimum XP per Turn)

### Concept

Every turn (stop hook call) guarantees a minimum XP regardless of token consumption. If the token-based XP calculation exceeds the floor, the token-based value is used instead. Rest bonus multiplier applies to the floor as well.

### Formula

```
finalXp = max(turnFloor, tokenBasedXp) × restMultiplier
```

### Balance Numbers

| Level Range | Turn Floor | Rationale |
|-------------|-----------|-----------|
| Lv.1–10 | 3 XP | ~333 turns to Lv.10 (medium_fast). Light user doing 5 turns/day reaches Lv.10 in ~67 days (without rest bonus) |
| Lv.11–20 | 2 XP | Slower but still progressing |
| Lv.21+ | 0 (disabled) | Token-based XP dominates; volume tier + achievements carry progression |

**Why these numbers:**
- `medium_fast` Lv.10 = 1,000 cumulative XP. At 3 XP/turn, 333 turns.
- Hard user median turn = ~107k tokens → 10+ XP (normal tier). Floor of 3 XP is irrelevant — token XP always exceeds it.
- Light user typical turn = 5k–20k tokens → 0–2 XP. Floor of 3 XP provides meaningful baseline.
- With rest bonus (3x): floor becomes 9 XP/turn, accelerating catch-up for returning users.

### Implementation

**File:** `src/hooks/stop.ts`

```typescript
function getTurnFloor(level: number): number {
  if (level <= 10) return 3;
  if (level <= 20) return 2;
  return 0;
}

// In the XP calculation (after line ~158):
const floor = getTurnFloor(pokemonLevel);
const finalXp = Math.floor(Math.max(floor, xpPerPokemon) * restMult);
```

Applied per-Pokémon (each party member uses their own level for the floor).

---

## 2. Rest Bonus (Rested XP)

### Concept

When a user returns after being away, they receive an XP multiplier for the next N turns. Longer absence = stronger bonus. This specifically targets light/intermittent users without affecting daily hard users.

### Mechanics

**Trigger:** First turn where `elapsed >= 2 hours` since last turn.

**Tiers:**

| Time Away | XP Multiplier | Duration (turns) | Message |
|-----------|--------------|-------------------|---------|
| 2–5 hours | 1.5x | 3 turns | 💤 휴식 보너스! 다음 3턴 경험치 1.5배 |
| 6–23 hours | 2.0x | 5 turns | 💤 휴식 보너스! 다음 5턴 경험치 2배 |
| 24+ hours | 3.0x | 10 turns | 💤 긴 휴식 보너스! 다음 10턴 경험치 3배 |

**Cap:** 3.0x max, 10 turns max. Prevents abuse from months-long absence creating absurd boosts.

**Application order:**

```
baseXp = floor(deltaTokens / tokensPerXp)
withTier = floor(baseXp * volumeTierMultiplier)
withBonus = floor(withTier * achievementBonus)
finalXp = floor(max(turnFloor, withBonus) * restMultiplier)   // Floor + rest
```

Turn floor catches low-token turns, then rest bonus amplifies everything.

**Battle XP:** Rest bonus also applies to battle XP for the same turns.

### State Changes

**New field in `State` (per-gen):**

```typescript
rest_bonus?: {
  multiplier: number;    // 1.5, 2.0, or 3.0
  turns_remaining: number; // countdown
}
```

**New field in `CommonState` (cross-gen, user-level):**

```typescript
last_turn_ts?: number;  // Unix timestamp of last stop hook call
```

Why CommonState: `last_turn_ts` tracks user activity, not per-gen progress. If stored per-gen, switching generations would create false rest bonuses on the destination gen.

### Turn Countdown

- Each stop hook call decrements `rest_bonus.turns_remaining` by 1.
- When it hits 0, `rest_bonus` is deleted from state.
- The rest bonus message shows remaining turns: `💤 휴식 보너스 2배 (남은 2턴)`

### Display

**Priority in status line (src/status-line.ts:199-204):**

```
1. Battle result (highest)
2. Rest bonus active message (NEW)
3. Tip (lowest)
```

**Messages (activation — shown in tip slot):**

| Situation | Message |
|-----------|---------|
| First turn back (activation) | `💤 {n}시간 휴식 보너스! 다음 {turns}턴 경험치 {mult}배` |
| Battle + rest bonus | Battle result takes priority; rest status shown in footer |

**Rest status indicator (footer, next to pokeball):**

When rest bonus is active, append to the footer info line:

```
🎮Sinnoh (Gen 4) 📍숲 🔴 3 💤 2×(5)
```

Format: `💤 {mult}×({turns_remaining})`

This is always visible while rest is active, regardless of battle/tip priority.

**Rest activation tips (shown in tip slot on first turn back):**

| Voice Tone | Tip (Korean) | Tip (English) |
|------------|-------------|---------------|
| pokemon | 💤 {hours}시간 푹 쉬었더니 컨디션이 좋아진 것 같다! 다음 {turns}턴 경험치 {mult}배 | 💤 A good {hours}h rest boosted their condition! XP ×{mult} for {turns} turns |
| claude | 💤 {hours}시간 휴식 보너스가 적용됩니다! 다음 {turns}턴 경험치 {mult}배 | 💤 {hours}h rest bonus activated! XP ×{mult} for {turns} turns |

**Rest-related general tips (random tip pool):**

| Voice Tone | Tip (Korean) | Tip (English) |
|------------|-------------|---------------|
| pokemon | 💤 가끔 쉬어가면 포켓몬들의 컨디션이 올라간다는 소문이 있다. | 💤 They say Pokémon get a condition boost when you take a break. |
| pokemon | 💤 2시간 이상 쉬면 휴식 보너스가 활성화된다고 한다. | 💤 Resting 2+ hours is said to activate a rest bonus. |
| claude | 💤 가끔 쉬어가면 경험치 보너스를 받을 수 있습니다! | 💤 Take a break sometimes for an XP bonus! |
| claude | 💤 2시간 이상 쉬면 휴식 보너스가 활성화됩니다. | 💤 Rest for 2+ hours to activate rest bonus. |

### Implementation

**File:** `src/hooks/stop.ts`

```typescript
// After reading state, before XP calculation:
const now = Date.now();
const lastTurnTs = state.last_turn_ts ?? now;
const elapsed = now - lastTurnTs;
const TWO_HOURS = 2 * 60 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// Activate rest bonus on first turn back
if (!state.rest_bonus && elapsed >= TWO_HOURS) {
  if (elapsed >= ONE_DAY) {
    state.rest_bonus = { multiplier: 3.0, turns_remaining: 10 };
  } else if (elapsed >= SIX_HOURS) {
    state.rest_bonus = { multiplier: 2.0, turns_remaining: 5 };
  } else {
    state.rest_bonus = { multiplier: 1.5, turns_remaining: 3 };
  }
}

// Apply rest multiplier to XP
const restMult = state.rest_bonus?.multiplier ?? 1.0;

// ... in XP calculation:
const floor = getTurnFloor(level);
const finalXp = Math.floor(Math.max(floor, xpWithBonus) * restMult);

// Decrement at end of turn
if (state.rest_bonus) {
  state.rest_bonus.turns_remaining--;
  if (state.rest_bonus.turns_remaining <= 0) {
    delete state.rest_bonus;
  }
}

// Always update timestamp
state.last_turn_ts = now;
```

**Rest activation display:** On activation turn, stop.ts sets `state.last_tip = { id: 'rest_activate', text: t('rest.activate', ...) }`, which naturally slots into existing battle > tip priority in status-line.ts. No status-line.ts tip-slot changes needed.

**File:** `src/status-line.ts` (footer only)

```typescript
// Footer: append rest indicator when active
// 🎮Sinnoh (Gen 4) 📍숲 🔴 3 💤 2×(5)
const restInfo = state.rest_bonus
  ? ` 💤 ${state.rest_bonus.multiplier}×(${state.rest_bonus.turns_remaining})`
  : '';
const footer = `🎮${genRegion} ${genSuffix} 📍${regionName}${itemInfo}${restInfo}`;
```

---

## 3. Combined Effect Analysis

### Light User Scenario (5 turns/day, normal tier, daily usage)

**Before (current):**
- 5 turns × ~1 XP (10k tokens unlikely) = ~5 XP/day
- Lv.10 (1,000 XP) reached in: **~200 days** (practically never)

**After (with floor + rest bonus):**
- Returns after 6h+ gap → rest bonus 2x for 5 turns
- 5 turns × max(3, ~1) × 2.0 = 5 × 6 = 30 XP/day
- Lv.10 reached in: **~33 days**

### Light User Scenario (5 turns/day, returns after 24h+)

- Rest bonus 3x for 10 turns, but only uses 5 turns/day
- Day 1: 5 turns × 3 × 3 = 45 XP (5 rest turns consumed)
- Day 2: 5 turns × 3 × 3 = 45 XP (remaining 5 rest turns) — if 24h+ gap again, new rest bonus activates
- Effective: ~45 XP/day
- Lv.10 reached in: **~22 days**

### Hard User Scenario (50+ turns/day, heated/intense tier)

**Before:**
- Median turn ~107k tokens → 10+ XP base, with legendary tier = 50+ XP/turn
- High token volume → 500–5,000+ XP/day from tokens + battles

**After:** Virtually identical. Turn floor of 3 is irrelevant (token XP always 10+). Rest bonus rarely triggers (turns happen every few minutes, never hits 2h gap).

### Edge Case: User Leaves for 30 Days

- Returns with 3x bonus for 10 turns
- At Lv.1 with floor: 3 × 3 = 9 XP/turn × 10 turns = 90 XP
- That's ~Lv.4 from rest bonus alone — welcome-back boost, not broken
- The cap (3x, 10 turns) prevents "I left for a year and came back at Lv.50"

---

## 4. i18n Keys

**ko.json (claude voice):**
```json
{
  "rest.activate": "💤 {hours}시간 휴식 보너스가 적용됩니다! 다음 {turns}턴 경험치 {mult}배",
  "tip.rest_info": "💤 가끔 쉬어가면 경험치 보너스를 받을 수 있습니다!",
  "tip.rest_threshold": "💤 2시간 이상 쉬면 휴식 보너스가 활성화됩니다."
}
```

**ko.pokemon.json (pokemon voice, overrides):**
```json
{
  "rest.activate": "💤 {hours}시간 푹 쉬었더니 컨디션이 좋아진 것 같다! 다음 {turns}턴 경험치 {mult}배",
  "tip.rest_info": "💤 가끔 쉬어가면 포켓몬들의 컨디션이 올라간다는 소문이 있다.",
  "tip.rest_threshold": "💤 2시간 이상 쉬면 휴식 보너스가 활성화된다고 한다."
}
```

---

## 5. Files to Modify

| File | Change |
|------|--------|
| `src/hooks/stop.ts` | Session floor logic, rest bonus activation/decrement, last_turn_ts tracking |
| `src/status-line.ts` | Rest bonus display between battle and tip |
| `src/core/types.ts` | Add `rest_bonus` and `last_turn_ts` to State type |
| `src/i18n/ko.json` | Rest bonus message strings (Korean) |
| `src/i18n/en.json` | Rest bonus message strings (English) |
| `docs/spec-progression.md` | Update XP section with floor and rest bonus |

---

## 6. Voice Tone Rename: `classic` → `claude`

### Rationale

- `pokemon`: 본가 NPC 어조 (`~다고 한다`, `~소문이 있다`)
- `claude`: 일반 AI 모델 말투 (`~합니다`, `~하세요`) — 기존 `classic`에서 rename

기존 팁 내용은 변경하지 않음. 이름만 rename.

### Migration

**File:** `src/hooks/stop.ts` or startup path

```typescript
// Migrate classic → claude (one-time)
if (globalConfig.voice_tone === 'classic') {
  globalConfig.voice_tone = 'claude';
  writeGlobalConfig(globalConfig);
}
```

### Files to Modify

| File | Change |
|------|--------|
| `src/core/types.ts` | `VoiceTone = 'claude' \| 'pokemon'` |
| `src/i18n/index.ts` | Default `'classic'` → `'claude'`, overlay lookup key change |
| `src/i18n/en.pokemon.json` | No change (overlay stays same) |
| `src/i18n/ko.pokemon.json` | No change (overlay stays same) |
| `src/hooks/stop.ts` | Add migration for existing users |
| `skills/*/SKILL.md` | Update references from `classic` to `claude` |

---

## 7. Not in Scope

- XP curve formula changes (exp_group formulas unchanged)
- Encounter rate changes for light users (separate concern)
- Evolution requirement changes (separate concern)
- UI/config for toggling rest bonus (always on, no config needed)
