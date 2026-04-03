# Volume Tier System — Design Spec

> 2026-04-03 | Addresses: "XP가 너무 안 오른다" feedback from heavy users

## Problem

XP progression feels slow across all levels. The current system is purely linear (`deltaTokens / tokens_per_xp`), giving no bonus for heavy token usage. Battle opportunities are capped at 15% per stop regardless of workload. Heavy users (large deltaTokens per stop) get the same encounter rate and rarity distribution as light users.

## Solution: 3-Axis Volume Tier System

A single tier is determined per stop hook call based on `deltaTokens`. The tier applies multipliers to XP, encounter rate, and rarity weights. Achievement-based encounter rate scaling provides a second, persistent progression axis.

---

## 1. Volume Tiers

Determined by `deltaTokens` (tokens consumed since last stop in the same session).

### Tier Table

| Tier | deltaTokens | XP Multiplier | Encounter Multiplier | Rarity Shift |
|---|---|---|---|---|
| Normal | < 10,000 | 1.0x | 1.0x | (none) |
| Heated | 10,000 – 39,999 | 1.5x | 1.5x | see below |
| Intense | 40,000 – 99,999 | 2.5x | 2.5x | see below |
| Legendary | 100,000+ | 5.0x | 4.0x | see below |

### Rarity Weight Override Per Tier

Common/uncommon weights are **reduced** and rare/legendary/mythical weights are **boosted**. These are full weight replacements applied BEFORE event modifiers. Time-of-day type boosts and day-of-week rare multipliers still apply ON TOP of tier weights (multiplicative stacking).

| Rarity | Normal | Heated | Intense | Legendary |
|---|---|---|---|---|
| common | 0.55 | 0.40 | 0.20 | 0.05 |
| uncommon | 0.30 | 0.25 | 0.20 | 0.15 |
| rare | 0.13 | 0.26 | 0.52 | 1.04 |
| legendary | 0.015 | 0.045 | 0.15 | 0.30 |
| mythical | 0.005 | 0.015 | 0.05 | 0.10 |

Effective probability at each tier (before event modifiers):

| Rarity | Normal | Heated | Intense | Legendary |
|---|---|---|---|---|
| common | 55% | 41% | 21% | 3% |
| uncommon | 30% | 26% | 21% | 9% |
| rare | 13% | 27% | 46% | 63% |
| legendary | 1.5% | 4.6% | 9.3% | 18% |
| mythical | 0.5% | 1.5% | 3.5% | 6% |

### Legendary Pool Interaction

The existing 2% legendary pool substitution check also scales with the tier's rarity multiplier. Rarity multiplier for legendary pool = ratio of tier's legendary weight to Normal's legendary weight:

| Tier | Legendary Pool Chance | Calculation |
|---|---|---|
| Normal | 2.0% | 0.02 × 1.0 |
| Heated | 6.0% | 0.02 × (0.045 / 0.015) = 0.02 × 3.0 |
| Intense | 20.0% | 0.02 × (0.15 / 0.015) = 0.02 × 10.0 |
| Legendary | 40.0% | 0.02 × (0.30 / 0.015) = 0.02 × 20.0, cap 1.0 |

### Encounter Count

Maximum 1 encounter per stop, regardless of tier. A 100% encounter rate means "guaranteed 1 encounter", not multiple.

### Tier Notification Messages (flavor text only — no numbers revealed)

**Korean:**

| Tier | Message |
|---|---|
| Normal | (none) |
| Heated | 풀숲이 크게 흔들리고 있다... |
| Intense | 주변에 수상한 기운이 감돌고 있다... |
| Legendary | 공기 속에 강한 에너지가 차오른다! |

**English (mainline Pokemon reference tone):**

| Tier | Message |
|---|---|
| Normal | (none) |
| Heated | The tall grass is rustling intensely... |
| Intense | Something seems to be lurking nearby... |
| Legendary | The air is crackling with powerful energy! |

---

## 2. Achievement System Restructure

### 2.1 Common vs Gen-Specific Achievements

Achievements are split into two categories:

| Category | Scope | Effect Sharing | Progress Sharing |
|---|---|---|---|
| **Common** | All generations | Shared across gens | Shared across gens |
| **Gen-specific** | Single generation | That gen only | That gen only |

**Common achievements** use universal triggers (session_count, battle_wins, total_tokens, error_count, evolution_count, catch_count, battle_count, permission_count) that are meaningful regardless of generation.

**Gen-specific achievements** involve gen-specific pokemon or mechanics (catch_151/Mew, eevee_trio, gen4 starters, etc.).

### 2.2 Data Structure

새 generation 추가 시 필요한 작업: `data/<genN>/achievements.json`에 gen-specific 업적만 추가. 공통 업적은 자동으로 적용됨.

```
data/
  common/
    achievements.json       # common achievements (shared across all gens)
  gen1/
    achievements.json       # gen1-specific achievements only
  gen4/
    achievements.json       # gen4-specific achievements only
  gen5/                     # future gen — just add this directory
    achievements.json       # gen5-specific achievements only
```

**Achievement loading logic** (generation-agnostic):
```
function loadAchievements(gen: string): Achievement[] {
  const common = loadJSON(`data/common/achievements.json`);
  const genSpecific = loadJSON(`data/${gen}/achievements.json`);
  return [...common, ...genSpecific];
}
```

새 gen이 추가되면 코드 변경 없이 data 디렉토리만 추가하면 됨.

**Common state** is stored outside the gen directory. ALL common achievement rewards persist here — not in per-gen state:
```
~/.claude/tokenmon/
  common_state.json         # common achievement progress + ALL shared rewards
  gen1/
    state.json              # gen-specific state only
  gen4/
    state.json
  gen5/                     # future gen — auto-created on first use
    state.json
```

**CommonState fields:**
```typescript
interface CommonState {
  achievements: Record<string, boolean>;  // common achievement completion
  encounter_rate_bonus: number;           // cumulative from achievements
  xp_bonus_multiplier: number;            // cumulative from common achievements
  items: Record<string, number>;          // items granted by common achievements
  max_party_size_bonus: number;           // cumulative party slot bonuses from common achievements
  // trigger counters (shared across gens)
  session_count: number;
  total_tokens_consumed: number;
  battle_count: number;
  battle_wins: number;
  catch_count: number;
  evolution_count: number;
  error_count: number;
  permission_count: number;
}
```

**State loading logic** (generation-agnostic):
```
function loadFullState(gen: string): { common: CommonState, gen: State } {
  const common = loadJSON(`common_state.json`);
  const genState = loadJSON(`${gen}/state.json`);
  return { common, gen: genState };
}
```

**Reward resolution at runtime:**
- `xp_bonus_multiplier`: `Math.max(config.xp_bonus_multiplier, common.xp_bonus_multiplier + gen.xp_bonus_multiplier)`
- `max_party_size`: `config.base_max_party_size + common.max_party_size_bonus + gen.max_party_size_bonus`
- `items`: merge common.items + gen.items (additive)
- `encounter_rate_bonus`: from common state only (gen-specific achievements don't grant this)

Common state의 trigger counters (`session_count`, `total_tokens_consumed` 등)는 **모든 gen에서 공유**되므로, gen을 전환해도 공통 업적 진행도가 이어짐.

### 2.3 Common Achievements List

These are the achievements that grant `encounter_rate_bonus` and other cross-gen effects:

| ID | Trigger Type | Trigger Value | Rewards | encounter_rate_bonus |
|---|---|---|---|---|
| `first_battle_win` | battle_wins | 1 | pokeball ×3 | +2%p |
| `ten_sessions` | session_count | 10 | xp_bonus +0.2 | +2%p |
| `ten_catches` | catch_count | 10 | xp_bonus +0.1, party_slot +1 | +2%p |
| `hundred_k_tokens` | total_tokens | 100,000 | — | +2%p |
| `battle_50` | battle_count | 50 | xp_bonus +0.15 | +3%p |
| `pokedex_50` | catch_count | 50 | unlock_legendary | +2%p |
| `battle_wins_25` | battle_wins | 25 | pokeball ×10 | — |
| `pokedex_25` | catch_count | 25 | pokeball ×5 | — |
| `fifty_sessions` | session_count | 50 | pokeball ×5 | — |
| `five_hundred_k_tokens` | total_tokens | 500,000 | — | +2%p |
| `hundred_sessions` | session_count | 100 | — | — |
| `evolution_10` | evolution_count | 10 | xp_bonus +0.1 | — |
| `error_50` | error_count | 50 | pokeball ×10 | — |
| `permission_master` | permission_count | 50 | party_slot +1 | — |
| `one_million_tokens` | total_tokens | 1,000,000 | — | — |
| `two_million_tokens` | total_tokens | 2,000,000 | — | — |
| `five_million_tokens` | total_tokens | 5,000,000 | — | — |

Total encounter_rate_bonus from common achievements: **+15%p** (15% → 30%).

### 2.4 Gen-Specific Achievements (remain in gen directories)

**Gen1 examples:** `first_session`(reward: gen1 pokemon), `first_error`, `first_evolution`, `catch_151` (Mew), `eevee_trio`, `all_starters` (Bulbasaur/Charmander/Squirtle), `all_types`, `streak_7`, `streak_30`, etc.

**Gen4 examples:** `first_session`(reward: gen4 pokemon), `first_error`, `first_evolution`, token milestone reward pokemon (Dialga, Palkia, Giratina, Arceus, Darkrai) — these stay gen4-specific with `total_tokens` triggers.

### 2.5 Generation Extension Checklist

새 generation 추가 시:

1. `data/<genN>/` 디렉토리 생성
2. `data/<genN>/achievements.json` — gen-specific 업적 정의 (reward_pokemon, gen 고유 메카닉 등)
3. `data/<genN>/pokemon.json`, `data/<genN>/regions.json` 등 기존 gen 데이터 패턴 따름
4. **코드 변경 불필요** — 공통 업적 로딩, common_state, 볼륨 티어는 gen-agnostic

### 2.6 Migration for Achievement Restructure

On session-start, if `common_state.json` does not exist:

1. Create `common_state.json` with default values
2. Scan **all** installed gens' `state.achievements` using legacy ID mapping
3. Merge completion status to `common_state.json` (any gen에서 달성했으면 달성으로)
4. Migrate trigger counters from gen states to common state (take max across gens)
5. Recalculate all cumulative effects (`encounter_rate_bonus`, `xp_bonus_multiplier`, `items`, `max_party_size_bonus`)

### 2.7 Legacy Achievement ID Mapping

Gen1 uses different achievement IDs than the new common IDs. Migration must map legacy → common:

| Common ID | Gen4 Legacy ID | Gen1 Legacy ID |
|---|---|---|
| `first_battle_win` | `first_battle_win` | (none — gen1 has `win_10`) |
| `ten_sessions` | `ten_sessions` | (none) |
| `ten_catches` | `ten_catches` | `catch_10` |
| `hundred_k_tokens` | `hundred_k_tokens` | (none) |
| `battle_50` | `battle_50` | (none — gen1 has `win_50` for battle_wins) |
| `pokedex_50` | `pokedex_50` | `catch_50` |
| `battle_wins_25` | `battle_wins_25` | (none — gen1 has `win_10`, `win_50`) |
| `pokedex_25` | `pokedex_25` | `catch_25` |
| `fifty_sessions` | `fifty_sessions` | (none) |
| `five_hundred_k_tokens` | `five_hundred_k_tokens` | (none) |
| `hundred_sessions` | `hundred_sessions` | (none) |
| `evolution_10` | `evolution_10` | `evolve_10` |
| `error_50` | `error_50` | (none) |
| `permission_master` | `permission_master` | (none) |
| `one_million_tokens` | `one_million_tokens` | (none) |
| `two_million_tokens` | `two_million_tokens` | (none) |
| `five_million_tokens` | `five_million_tokens` | (none) |

**Migration logic:**
```
const LEGACY_MAP: Record<string, Record<string, string>> = {
  gen1: {
    'catch_10': 'ten_catches',
    'catch_25': 'pokedex_25',
    'catch_50': 'pokedex_50',
    'evolve_10': 'evolution_10',
  },
  gen4: {
    // gen4 IDs already match common IDs — no mapping needed
  },
};

for (const gen of installedGens) {
  const genState = loadGenState(gen);
  const map = LEGACY_MAP[gen] ?? {};
  for (const [legacyId, achieved] of Object.entries(genState.achievements)) {
    if (!achieved) continue;
    const commonId = map[legacyId] ?? legacyId;
    if (isCommonAchievement(commonId)) {
      commonState.achievements[commonId] = true;
    }
  }
}
```

**Test coverage required:**
- gen1-only user upgrade → catch_10 maps to ten_catches
- gen4-only user upgrade → IDs match directly
- mixed gen user → union of both gens' achievements
- unknown legacy IDs → silently ignored

---

## 3. Immediate Effect Application Principle

**Rule: All reward effects (multipliers, rates, bonuses) are applied at the moment of unlock. No deferred application. No "wait until next session." This applies to ALL effects, both new and existing.**

### Where this applies:

| Effect Type | Application Point | Current Behavior | Required Behavior |
|---|---|---|---|
| `encounter_rate_bonus` | NEW | N/A | Immediate in `applyAchievementEffects` |
| `xp_bonus` | `applyAchievementEffects` | `state.xp_bonus_multiplier +=` | Already immediate — **verify no deferred paths** |
| `party_slot` | `applyAchievementEffects` | `config.max_party_size +=` | Already immediate — **verify no deferred paths** |
| `add_item` | `applyAchievementEffects` | `state.items[item] +=` | Already immediate — **verify no deferred paths** |
| `unlock_legendary` | `applyAchievementEffects` | Flag only | Already immediate |

### Session-start recalculation

Session-start recalculation exists **only** as a migration/consistency mechanism:
- Catches newly added effect types for existing users (e.g., `encounter_rate_bonus` added in this update)
- Acts as a safety net if state gets out of sync
- Does NOT replace real-time application — effects MUST also apply at unlock time

---

## 4. Encounter Rate Formula

### Final Formula

```
baseRate = 0.15 + state.encounter_rate_bonus    // common achievement cumulative, max 0.30
            + regionPenalty                       // existing: -0.05 if underleveled
baseRate = clamp(baseRate, 0.05, 0.30)

finalRate = min(1.0, baseRate * tierEncounterMult)
```

Example: achievement bonus 24% base × Intense 2.5x = 60% encounter rate.

---

## 5. XP Formula Change

### Current
```
xpBonus = Math.max(config.xp_bonus_multiplier, state.xp_bonus_multiplier)
xpTotal = floor((deltaTokens / tokens_per_xp) * xpBonus)
```

### New
```
xpBonus = Math.max(config.xp_bonus_multiplier, state.xp_bonus_multiplier)
tier = getVolumeTier(deltaTokens)
xpTotal = floor((deltaTokens / tokens_per_xp) * xpBonus * tier.xpMultiplier)
```

- `Math.max` logic unchanged (config is user/debug override, state is achievement-accumulated)
- Tier multiplier is multiplicative on top
- Battle XP (`calculateBattleXp`) is NOT affected by volume tier — only token XP is

---

## 6. Tips (New)

Added to guide/tip system. Shown when no battle occurs (existing behavior).

**Korean:**

| ID | Message |
|---|---|
| `tip_volume_xp` | 한번에 많은 토큰을 사용하면 경험치를 더 많이 받을 수 있다고 한다. |
| `tip_volume_encounter` | 긴 작업을 하면 야생 포켓몬이 더 자주 나타나는 것 같다. |
| `tip_volume_rare` | 복잡한 작업일수록 강한 포켓몬이 나타날 확률이 높아진다는 소문이 있다. |

**English:**

| ID | Message |
|---|---|
| `tip_volume_xp` | Using more tokens at once seems to yield more experience points. |
| `tip_volume_encounter` | Wild Pokémon appear more often during longer tasks. |
| `tip_volume_rare` | There are rumors that stronger Pokémon appear during complex tasks. |

---

## 7. CLI Query Command

`/tkm:tkm` natural language command: `사용 토큰별 경험치 배율` / `volume multiplier` / `토큰 배율`

Output (no exact numbers — directional only):

```
[ 토큰 사용량별 보너스 ]
  ~10,000 토큰   보통
  ~40,000 토큰   경험치↑ 인카운터↑
  ~100,000 토큰  경험치↑↑ 인카운터↑↑ 레어↑
  100,000+ 토큰  경험치↑↑↑ 인카운터↑↑↑ 레어↑↑
```

---

## 8. Migration: Existing Users

### 8.1 Common State Migration (session-start)

Authoritative migration flow — identical to Section 2.6. On session start, if `common_state.json` does not exist:

1. Create `common_state.json` with default values
2. Scan **all** installed gens' `state.achievements` using legacy ID mapping (Section 2.7)
3. Merge completion status to `common_state.json` (any gen에서 달성했으면 달성으로)
4. Migrate trigger counters from gen states to common state (take max across gens)
5. Recalculate all cumulative effects (`encounter_rate_bonus`, `xp_bonus_multiplier`, `items`, `max_party_size_bonus`)

### 8.2 Consistency Recalculation (session-start)

On **every** session start (not just first migration), recalculate all cumulative common effects as a safety net:

```
// pseudo — recalculates ALL common reward effects, not just encounter_rate_bonus
let encounterBonus = 0, xpBonus = 0, partyBonus = 0;
const items: Record<string, number> = {};

for (const ach of commonAchievements) {
  if (commonState.achievements[ach.id]) {
    for (const effect of ach.reward_effects) {
      switch (effect.type) {
        case 'encounter_rate_bonus': encounterBonus += effect.value; break;
        case 'xp_bonus': xpBonus += effect.value; break;
        case 'party_slot': partyBonus += effect.count; break;
        case 'add_item': items[effect.item] = (items[effect.item] ?? 0) + effect.count; break;
      }
    }
  }
}

commonState.encounter_rate_bonus = encounterBonus;
commonState.xp_bonus_multiplier = xpBonus;
commonState.max_party_size_bonus = partyBonus;
// items: only add missing items (don't remove consumed items)
```

This is a **consistency mechanism only** — the primary path is immediate application at unlock time (Section 3).

---

## 9. Implementation Scope

### Files to Modify

| File | Changes |
|---|---|
| `src/core/types.ts` | Add `encounter_rate_bonus: number` to State, define `VolumeTier` type, add `CommonState` type |
| `src/core/encounter.ts` | `rollEncounter`: apply achievement bonus + tier multiplier. `selectWildPokemon`: use tier rarity weights (then event modifiers on top). Legendary pool chance scales with tier. |
| `src/hooks/stop.ts` | Compute tier from deltaTokens, apply XP multiplier, emit tier message, pass tier to encounter |
| `src/core/achievements.ts` | Handle `encounter_rate_bonus` effect type with immediate application. Load common vs gen-specific achievements separately. |
| `src/core/state.ts` | Add `CommonState` read/write, default `encounter_rate_bonus: 0`, common_state.json path |
| `src/hooks/session-start.ts` | Common state migration, encounter_rate_bonus recalculation safety net |
| `src/i18n/` | Tier messages (4 × ko/en), tip messages (3 × ko/en) |
| `src/core/guide.ts` | Add 3 volume tips |
| `src/cli/tokenmon.ts` | Add volume multiplier query command |

### New Files

| File | Contents |
|---|---|
| `src/core/volume-tier.ts` | `getVolumeTier(deltaTokens)` function, tier constants, rarity weight tables |
| `data/common/achievements.json` | Common achievements with `encounter_rate_bonus` effects |
| `test/volume-tier.test.ts` | Tier determination, boundary values, rarity weight selection |
| `test/common-achievements.test.ts` | Common vs gen-specific achievement loading, migration, immediate effect application |

### Data Changes

| File | Changes |
|---|---|
| `data/common/achievements.json` | NEW — common achievements extracted from gen4 + gen1 |
| `data/gen4/achievements.json` | Remove common achievements, keep gen4-specific only (token milestone reward pokemon, etc.) |
| `data/gen1/achievements.json` | Remove common achievements, keep gen1-specific only (catch_151, eevee_trio, all_starters, etc.) |

### Test Changes

| File | Changes |
|---|---|
| `test/encounter.test.ts` | Encounter rate with achievement bonus, tier encounter multiplier, rarity boost, legendary pool scaling |
| `test/achievements.test.ts` | `encounter_rate_bonus` immediate application, common vs gen-specific split |
| `test/xp.test.ts` | Tier XP multiplier application |

---

## 10. What This Does NOT Change

- Battle XP formula (remains based on wild level/rarity/type)
- Level curve (still cubic/exp-group based)
- tokens_per_xp config value (still 10,000 default)
- Encounter rate region penalty logic
- Shiny rate (still 1/512)
- Existing gen-specific achievement rewards (untouched, just moved to gen-specific file)
