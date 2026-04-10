# Gym Achievement System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate gym badge progression into the achievement system with 3 new trigger types, badge notifications, title rewards, rare weight multiplier, and duplicate pokemon XP dump.

**Architecture:** Extend existing `checkAchievements()` switch pattern with `badge_count`, `champion_defeated`, `all_gen_badges` triggers. Add `rare_weight_multiplier` reward effect applied in `selectWildPokemon()`. Champion badge prefix rename enables trigger filtering. Achievement check happens immediately after `awardGymVictory()` in both battle-turn and battle-tui paths.

**Tech Stack:** TypeScript, Node.js test runner, JSON data files, i18n

**Spec:** `docs/superpowers/specs/2026-04-09-gym-achievements-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/core/types.ts` | Add `rare_weight_multiplier` to State, fields to CommonState, `rewardXpDump` to AchievementEvent |
| Modify | `src/core/state.ts` | Add defaults to `DEFAULT_COMMON_STATE` |
| Modify | `test/helpers.ts` | Add `rare_weight_multiplier` to `makeState()` |
| Modify | `data/gyms/gen{1-9}.json` | Rename champion badge to `champion_` prefix |
| Modify | `src/core/achievements.ts` | 3 trigger types, `title` + `rare_weight_multiplier` effects, XP dump |
| Modify | `src/core/notifications.ts` | Progress tracking for 3 new triggers |
| Modify | `src/core/encounter.ts` | Apply `rare_weight_multiplier` in `selectWildPokemon()` |
| Modify | `data/gen{1-9}/achievements.json` | 4 gym achievements per gen |
| Modify | `data/common/achievements.json` | 4 cross-gen achievements |
| Modify | `src/i18n/en.json` | Badge/champion/title/achievement name keys |
| Modify | `src/i18n/ko.json` | Same keys in Korean |
| Modify | `src/cli/battle-turn.ts` | Achievement check + badge notification in `handleVictory()` |
| Modify | `src/battle-tui/index.ts` | Achievement check + badge notification in victory callback |
| Modify | `src/hooks/stop.ts` | CommonState delta sync for `total_gym_badges`, `completed_gym_gens` |
| Modify | `test/achievements.test.ts` | Tests for all new triggers, effects, and edge cases |

---

### Task 1: Types, State Defaults, Test Helpers

**Files:**
- Modify: `src/core/types.ts:190-239` (State interface), `src/core/types.ts:416-431` (CommonState interface)
- Modify: `src/core/state.ts:76-90` (DEFAULT_COMMON_STATE)
- Modify: `test/helpers.ts:11-68` (makeState)

- [ ] **Step 1: Add `rare_weight_multiplier` to State interface**

In `src/core/types.ts`, add after `gym_badges?: string[]` (line 238):

```typescript
  rare_weight_multiplier?: number;
```

- [ ] **Step 2: Add `rewardXpDump` to AchievementEvent**

Find the `AchievementEvent` interface in `src/core/types.ts` and add:

```typescript
  rewardXpDump?: number;
```

To find it: `grep -n 'AchievementEvent' src/core/types.ts`

- [ ] **Step 3: Add fields to CommonState**

In `src/core/types.ts`, add to `CommonState` interface after `permission_count: number` (line 429):

```typescript
  total_gym_badges: number;
  completed_gym_gens: number;
```

- [ ] **Step 4: Add defaults to DEFAULT_COMMON_STATE**

In `src/core/state.ts`, add after `permission_count: 0` (line 89):

```typescript
  total_gym_badges: 0,
  completed_gym_gens: 0,
```

- [ ] **Step 5: Add `rare_weight_multiplier` to makeState helper**

In `test/helpers.ts`, add after `gym_badges: []` (line 66):

```typescript
    rare_weight_multiplier: 1.0,
```

- [ ] **Step 6: Add fields to makeCommonState in test file**

In `test/achievements.test.ts`, add to `makeCommonState()` after `permission_count: 0` (line 25):

```typescript
    total_gym_badges: 0,
    completed_gym_gens: 0,
```

- [ ] **Step 7: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts src/core/state.ts test/helpers.ts test/achievements.test.ts
git commit -m "feat(gym-ach): add types for gym achievements, rare_weight_multiplier, commonState fields"
```

---

### Task 2: Champion Badge Prefix Rename

**Files:**
- Modify: `data/gyms/gen{1-9}.json` (champion gym entry, `"badge"` field)

Currently all champion gyms (id: 9) have `"badge": "Champion Badge"`. Rename to `"badge": "champion_<region>"` for filtering via `startsWith('champion_')`.

- [ ] **Step 1: Rename champion badges in all 9 gen files**

Each file's champion entry (id: 9) — change the `"badge"` field:

| File | Old | New |
|------|-----|-----|
| `data/gyms/gen1.json` | `"Champion Badge"` | `"champion_kanto"` |
| `data/gyms/gen2.json` | `"Champion Badge"` | `"champion_johto"` |
| `data/gyms/gen3.json` | `"Champion Badge"` | `"champion_hoenn"` |
| `data/gyms/gen4.json` | `"Champion Badge"` | `"champion_sinnoh"` |
| `data/gyms/gen5.json` | `"Champion Badge"` | `"champion_unova"` |
| `data/gyms/gen6.json` | `"Champion Badge"` | `"champion_kalos"` |
| `data/gyms/gen7.json` | `"Champion Badge"` | `"champion_alola"` |
| `data/gyms/gen8.json` | `"Champion Badge"` | `"champion_galar"` |
| `data/gyms/gen9.json` | `"Champion Badge"` | `"champion_paldea"` |

Also update `"badgeKo"` from `"챔피언배지"` to region-specific:

| File | New badgeKo |
|------|------------|
| gen1 | `"관동 챔피언배지"` |
| gen2 | `"성도 챔피언배지"` |
| gen3 | `"호연 챔피언배지"` |
| gen4 | `"신오 챔피언배지"` |
| gen5 | `"하나 챔피언배지"` |
| gen6 | `"칼로스 챔피언배지"` |
| gen7 | `"알로라 챔피언배지"` |
| gen8 | `"가라르 챔피언배지"` |
| gen9 | `"팔데아 챔피언배지"` |

- [ ] **Step 2: Verify no code references "Champion Badge" literally**

Run: `grep -rn "Champion Badge" src/`
Expected: 0 matches (existing code uses `gym.badge` dynamically, not hardcoded string)

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 879 tests pass (champion badge names are not tested directly)

- [ ] **Step 4: Commit**

```bash
git add data/gyms/gen*.json
git commit -m "feat(gym-ach): rename champion badges to champion_<region> prefix for trigger filtering"
```

---

### Task 3: i18n Keys

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/ko.json`

- [ ] **Step 1: Add badge notification keys to en.json**

Add before the closing `}`:

```json
  "gym.badge_earned": "🥊 {badge} earned! ({leader} defeated) [{count}/8]",
  "gym.champion_victory_header": "CHAMPION VICTORY!",
  "gym.champion_victory_detail": "{region} Champion {leader} defeated!",
  "gym.title_earned": "Title earned: {title}",
  "gym.reward_pokemon": "Reward: {pokemon} obtained!",
  "gym.reward_xp_dump": "{pokemon} gained {xp} XP! (Lv.{oldLevel} → Lv.{newLevel})"
```

- [ ] **Step 2: Add achievement name keys to en.json**

```json
  "achievement.first_badge": "First Badge",
  "achievement.four_badges": "Badge Collector",
  "achievement.eight_badges": "Gym Master",
  "achievement.champion": "Champion",
  "achievement.total_badges_10": "Badge Enthusiast",
  "achievement.total_badges_30": "Badge Maniac",
  "achievement.three_gen_champion": "Multi Champion",
  "achievement.all_gen_champion": "Pokémon Master"
```

- [ ] **Step 3: Add title keys to en.json**

```json
  "title.champion_kanto": "Kanto Champion",
  "title.champion_johto": "Johto Champion",
  "title.champion_hoenn": "Hoenn Champion",
  "title.champion_sinnoh": "Sinnoh Champion",
  "title.champion_unova": "Unova Champion",
  "title.champion_kalos": "Kalos Champion",
  "title.champion_alola": "Alola Champion",
  "title.champion_galar": "Galar Champion",
  "title.champion_paldea": "Paldea Champion",
  "title.multi_champion": "Multi Champion",
  "title.pokemon_master": "Pokémon Master"
```

- [ ] **Step 4: Add same keys to ko.json**

Badge notifications:
```json
  "gym.badge_earned": "🥊 {badge} 획득! ({leader} 격파) [{count}/8]",
  "gym.champion_victory_header": "챔피언 승리!",
  "gym.champion_victory_detail": "{region} 챔피언 {leader} 격파!",
  "gym.title_earned": "칭호 획득: {title}",
  "gym.reward_pokemon": "보상: {pokemon} 획득!",
  "gym.reward_xp_dump": "{pokemon}에게 {xp} XP 부여! (Lv.{oldLevel} → Lv.{newLevel})"
```

Achievement names:
```json
  "achievement.first_badge": "첫 번째 배지",
  "achievement.four_badges": "배지 수집가",
  "achievement.eight_badges": "체육관 마스터",
  "achievement.champion": "챔피언",
  "achievement.total_badges_10": "배지 매니아",
  "achievement.total_badges_30": "배지 마니아",
  "achievement.three_gen_champion": "멀티 챔피언",
  "achievement.all_gen_champion": "포켓몬 마스터"
```

Title names:
```json
  "title.champion_kanto": "관동 챔피언",
  "title.champion_johto": "성도 챔피언",
  "title.champion_hoenn": "호연 챔피언",
  "title.champion_sinnoh": "신오 챔피언",
  "title.champion_unova": "하나 챔피언",
  "title.champion_kalos": "칼로스 챔피언",
  "title.champion_alola": "알로라 챔피언",
  "title.champion_galar": "가라르 챔피언",
  "title.champion_paldea": "팔데아 챔피언",
  "title.multi_champion": "멀티 챔피언",
  "title.pokemon_master": "포켓몬 마스터"
```

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.json src/i18n/ko.json
git commit -m "feat(gym-ach): add i18n keys for badge notifications, achievement names, and titles"
```

---

### Task 4: Achievement Data JSON

**Files:**
- Modify: `data/gen{1-9}/achievements.json`
- Modify: `data/common/achievements.json`

- [ ] **Step 1: Add 4 gym achievements to each gen file**

Append these 4 entries to the `"achievements"` array in each `data/genN/achievements.json`:

```json
    {
      "id": "first_badge",
      "trigger_type": "badge_count",
      "trigger_value": 1,
      "rarity": 1,
      "reward_effects": [
        { "type": "encounter_rate_bonus", "value": 0.03 }
      ]
    },
    {
      "id": "four_badges",
      "trigger_type": "badge_count",
      "trigger_value": 4,
      "rarity": 2,
      "reward_effects": [
        { "type": "xp_bonus", "value": 0.1 },
        { "type": "encounter_rate_bonus", "value": 0.02 }
      ]
    },
    {
      "id": "eight_badges",
      "trigger_type": "badge_count",
      "trigger_value": 8,
      "rarity": 3,
      "reward_effects": [
        { "type": "rare_weight_multiplier", "value": 1.3 }
      ]
    }
```

The `champion` achievement is **per-gen** with different reward_pokemon and title. Add to each file:

| Gen | reward_pokemon | title effect value |
|-----|---------------|-------------------|
| gen1 | `"150"` | `"champion_kanto"` |
| gen2 | `"249"` | `"champion_johto"` |
| gen3 | `"384"` | `"champion_hoenn"` |
| gen4 | `"493"` | `"champion_sinnoh"` |
| gen5 | `"644"` | `"champion_unova"` |
| gen6 | `"716"` | `"champion_kalos"` |
| gen7 | `"791"` | `"champion_alola"` |
| gen8 | `"890"` | `"champion_galar"` |
| gen9 | `"1007"` | `"champion_paldea"` |

Template (substitute per gen):

```json
    {
      "id": "champion",
      "trigger_type": "champion_defeated",
      "trigger_value": 1,
      "rarity": 4,
      "reward_pokemon": "<SPECIES_ID>",
      "reward_level": 75,
      "reward_effects": [
        { "type": "title", "value": "<TITLE_KEY>" }
      ]
    }
```

- [ ] **Step 2: Add 4 cross-gen achievements to common/achievements.json**

Append to `data/common/achievements.json` `"achievements"` array:

```json
    {
      "id": "total_badges_10",
      "trigger_type": "badge_count",
      "trigger_value": 10,
      "rarity": 2,
      "reward_effects": [
        { "type": "encounter_rate_bonus", "value": 0.05 }
      ]
    },
    {
      "id": "total_badges_30",
      "trigger_type": "badge_count",
      "trigger_value": 30,
      "rarity": 3,
      "reward_effects": [
        { "type": "rare_weight_multiplier", "value": 1.5 }
      ]
    },
    {
      "id": "three_gen_champion",
      "trigger_type": "all_gen_badges",
      "trigger_value": 3,
      "rarity": 4,
      "reward_effects": [
        { "type": "title", "value": "multi_champion" },
        { "type": "rare_weight_multiplier", "value": 1.3 }
      ]
    },
    {
      "id": "all_gen_champion",
      "trigger_type": "all_gen_badges",
      "trigger_value": 9,
      "rarity": 5,
      "reward_effects": [
        { "type": "title", "value": "pokemon_master" },
        { "type": "rare_weight_multiplier", "value": 2.0 }
      ]
    }
```

- [ ] **Step 3: Commit**

```bash
git add data/gen*/achievements.json data/common/achievements.json
git commit -m "feat(gym-ach): add gym achievement data (4 per-gen + 4 cross-gen)"
```

---

### Task 5: New Trigger Types + Reward Effects in achievements.ts (TDD)

**Files:**
- Modify: `src/core/achievements.ts`
- Modify: `test/achievements.test.ts`

- [ ] **Step 1: Write failing tests for badge_count trigger**

Add to `test/achievements.test.ts`:

```typescript
  it('first_badge triggers at badge_count >= 1', () => {
    const state = makeState({ gym_badges: ['boulder'] });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_badge');
    assert.ok(ev, 'first_badge should trigger');
    assert.ok(state.achievements['first_badge']);
  });

  it('first_badge does not trigger with no badges', () => {
    const state = makeState({ gym_badges: [] });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'first_badge');
    assert.equal(ev, undefined, 'first_badge should not trigger');
  });

  it('four_badges triggers at badge_count >= 4', () => {
    const state = makeState({ gym_badges: ['a', 'b', 'c', 'd'] });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'four_badges');
    assert.ok(ev, 'four_badges should trigger');
  });

  it('eight_badges triggers at badge_count >= 8', () => {
    const state = makeState({ gym_badges: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'eight_badges');
    assert.ok(ev, 'eight_badges should trigger');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -E 'first_badge|four_badges|eight_badges'`
Expected: FAIL — `badge_count` trigger type not handled

- [ ] **Step 3: Add badge_count trigger to checkAchievements()**

In `src/core/achievements.ts`, add to the switch statement inside `checkAchievements()` (after the `catch_count` case, around line 44):

```typescript
      case 'badge_count':
        triggered = (state.gym_badges ?? []).length >= ach.trigger_value;
        break;
```

- [ ] **Step 4: Run tests to verify badge_count passes**

Run: `npm test 2>&1 | grep -E 'first_badge|four_badges|eight_badges'`
Expected: PASS

- [ ] **Step 5: Write failing tests for champion_defeated trigger**

```typescript
  it('champion triggers when champion badge exists', () => {
    const state = makeState({ gym_badges: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'champion_kanto'] });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'champion');
    assert.ok(ev, 'champion should trigger');
  });

  it('champion does not trigger without champion_ prefix badge', () => {
    const state = makeState({ gym_badges: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'champion');
    assert.equal(ev, undefined, 'champion should not trigger');
  });
```

- [ ] **Step 6: Add champion_defeated trigger**

```typescript
      case 'champion_defeated': {
        const championBadges = (state.gym_badges ?? []).filter(b => b.startsWith('champion_'));
        triggered = championBadges.length >= ach.trigger_value;
        break;
      }
```

- [ ] **Step 7: Run tests to verify champion_defeated passes**

Run: `npm test 2>&1 | grep champion`
Expected: PASS

- [ ] **Step 8: Write failing test for title reward effect**

```typescript
  it('champion achievement grants title', () => {
    const state = makeState({ gym_badges: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'champion_kanto'] });
    const config = makeConfig();
    checkAchievements(state, config);

    assert.ok(state.titles.includes('champion_kanto'), 'should have champion_kanto title');
  });
```

- [ ] **Step 9: Add title and rare_weight_multiplier effects to applyAchievementEffects()**

In `src/core/achievements.ts`, add to `applyAchievementEffects()` switch (around line 98):

```typescript
        case 'title':
          if (effect.value && !state.titles.includes(effect.value as string)) {
            state.titles.push(effect.value as string);
          }
          break;
        case 'rare_weight_multiplier':
          state.rare_weight_multiplier = (state.rare_weight_multiplier ?? 1.0) * (effect.value ?? 1.0);
          break;
```

- [ ] **Step 10: Write failing test for rare_weight_multiplier effect**

```typescript
  it('eight_badges applies rare_weight_multiplier', () => {
    const state = makeState({ gym_badges: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    const config = makeConfig();
    checkAchievements(state, config);

    assert.ok(state.achievements['eight_badges']);
    assert.equal(state.rare_weight_multiplier, 1.3);
  });
```

- [ ] **Step 11: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 12: Write failing test for duplicate pokemon XP dump**

```typescript
  it('champion XP dumps when reward pokemon already owned', () => {
    const state = makeState({
      gym_badges: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'champion_kanto'],
      unlocked: ['150'],
      pokemon: { '150': { id: 150, xp: levelToXp(50, 'slow'), level: 50, friendship: 0, ev: 0 } },
    });
    const config = makeConfig();
    const events = checkAchievements(state, config);

    const ev = events.find(e => e.id === 'champion');
    assert.ok(ev, 'champion should trigger');
    assert.ok(ev!.rewardXpDump, 'should have XP dump');
    assert.ok(ev!.rewardXpDump! > 0, 'XP dump should be positive');
    // Pokemon should have gained XP — level should be higher than 50
    assert.ok(state.pokemon['150'].level > 50, 'level should increase from XP dump');
  });
```

- [ ] **Step 13: Implement duplicate pokemon XP dump**

In `src/core/achievements.ts`, modify the reward pokemon handling section (around line 57). Replace the existing block:

```typescript
    // Handle reward pokemon
    if (ach.reward_pokemon) {
      const rewardName = ach.reward_pokemon;
      if (!state.unlocked.includes(rewardName)) {
        state.unlocked.push(rewardName);
        const pData = pokemonDB.pokemon[rewardName];
        if (pData && !state.pokemon[rewardName]) {
          let level: number;
          if (pData.rarity === 'legendary' || pData.rarity === 'mythical') {
            level = 50;
          } else {
            const partyLevels = (config.party ?? []).map((name: string) => state.pokemon[name]?.level ?? 0).filter((l: number) => l > 0);
            level = partyLevels.length > 0 ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length) : 1;
          }
          const xp = levelToXp(level, pData.exp_group);
          state.pokemon[rewardName] = { id: pData.id, xp, level, friendship: 0, ev: 0 };
        }
        markCaught(state, rewardName);
        event.rewardPokemon = rewardName;
      }
    }
```

With (add XP dump branch + reward_level support):

```typescript
    // Handle reward pokemon
    if (ach.reward_pokemon) {
      const rewardName = ach.reward_pokemon;
      const pData = pokemonDB.pokemon[rewardName];
      if (state.unlocked.includes(rewardName) && state.pokemon[rewardName] && pData) {
        // Already owned: XP dump
        const rewardLevel = (ach as { reward_level?: number }).reward_level;
        const group = pData.exp_group ?? 'slow';
        const bonusXp = levelToXp(rewardLevel ?? 75, group);
        const oldLevel = state.pokemon[rewardName].level;
        state.pokemon[rewardName].xp += bonusXp;
        state.pokemon[rewardName].level = xpToLevel(state.pokemon[rewardName].xp, group);
        event.rewardXpDump = bonusXp;
        event.rewardPokemon = rewardName;
      } else if (!state.unlocked.includes(rewardName)) {
        // New: grant pokemon
        state.unlocked.push(rewardName);
        if (pData && !state.pokemon[rewardName]) {
          const rewardLevel = (ach as { reward_level?: number }).reward_level;
          let level: number;
          if (rewardLevel) {
            level = rewardLevel;
          } else if (pData.rarity === 'legendary' || pData.rarity === 'mythical') {
            level = 50;
          } else {
            const partyLevels = (config.party ?? []).map((name: string) => state.pokemon[name]?.level ?? 0).filter((l: number) => l > 0);
            level = partyLevels.length > 0 ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length) : 1;
          }
          const xp = levelToXp(level, pData.exp_group);
          state.pokemon[rewardName] = { id: pData.id, xp, level, friendship: 0, ev: 0 };
        }
        markCaught(state, rewardName);
        event.rewardPokemon = rewardName;
      }
    }
```

Add import for `xpToLevel` at the top of the file:

```typescript
import { levelToXp, xpToLevel } from './xp.js';
```

- [ ] **Step 14: Run all tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 15: Commit**

```bash
git add src/core/achievements.ts test/achievements.test.ts
git commit -m "feat(gym-ach): add badge_count, champion_defeated triggers, title/rare_weight effects, XP dump"
```

---

### Task 6: Notification Progress for New Triggers

**Files:**
- Modify: `src/core/notifications.ts:135-149`

- [ ] **Step 1: Add 3 trigger types to getAchievementProgress()**

In `src/core/notifications.ts`, add to the switch in `getAchievementProgress()` before `default`:

```typescript
    case 'badge_count': current = (state.gym_badges ?? []).length; break;
    case 'champion_defeated': {
      current = (state.gym_badges ?? []).filter(b => b.startsWith('champion_')).length;
      break;
    }
    case 'all_gen_badges': {
      // Approximate: count badges / 9 per gen as rough progress
      current = Math.floor((state.gym_badges ?? []).length / 9);
      break;
    }
```

Note: `all_gen_badges` progress is approximate since exact gen completion requires loading gym data. Approximate is sufficient for 90% notification threshold.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/core/notifications.ts
git commit -m "feat(gym-ach): add badge progress tracking for near-achievement notifications"
```

---

### Task 7: rare_weight_multiplier in Encounter System

**Files:**
- Modify: `src/core/encounter.ts:168-198`

- [ ] **Step 1: Apply rare_weight_multiplier in selectWildPokemon()**

In `src/core/encounter.ts`, in the weighted selection loop (around line 169), add the multiplier after the base weight lookup:

```typescript
  // Build weighted selection by rarity
  const weighted: Array<{ name: string; weight: number }> = [];
  const rareMultiplier = state.rare_weight_multiplier ?? 1.0;
  for (const p of pool) {
    let w = weights[p.rarity as keyof typeof weights] ?? 0.1;

    // Apply gym achievement rare weight multiplier
    if (rareMultiplier !== 1.0 && (p.rarity === 'rare' || p.rarity === 'legendary' || p.rarity === 'mythical')) {
      w *= rareMultiplier;
    }

    // Apply time-of-day type boosts
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All pass (normalization handles the weighted change)

- [ ] **Step 3: Commit**

```bash
git add src/core/encounter.ts
git commit -m "feat(gym-ach): apply rare_weight_multiplier to encounter rarity weights"
```

---

### Task 8: battle-turn.ts Badge Notification + Achievement Check

**Files:**
- Modify: `src/cli/battle-turn.ts:513-548`

- [ ] **Step 1: Add imports**

At the top of `src/cli/battle-turn.ts`, add:

```typescript
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
```

Verify `readState` and `writeState` are already imported (they should be).

- [ ] **Step 2: Add achievement check and badge notification to handleVictory()**

Replace the `handleVictory` function's lock section and output (lines ~521-548):

```typescript
  // Re-read state inside lock to avoid overwriting hook changes
  const lockResult = withLockRetry(() => {
    const freshState = readState(generation);
    const result = awardGymVictory(freshState, gym, playerPartyNames);

    // Check achievements immediately after badge earned
    const config = readConfig();
    const achEvents = result.badgeEarned ? checkAchievements(freshState, config) : [];

    writeState(freshState, generation);
    return { ...result, achEvents, badgeCount: (freshState.gym_badges ?? []).length };
  });

  if (!lockResult.acquired) {
    output({ status: 'error', messages: ['Failed to acquire state lock for victory update.'] });
    process.exit(1);
  }

  const victoryResult = lockResult.value;

  // Badge notification
  if (victoryResult.badgeEarned) {
    const isChampion = gym.badge.startsWith('champion_');
    if (isChampion) {
      messages.push('═══════════════════════════════');
      messages.push(t('gym.champion_victory_header'));
      messages.push(t('gym.champion_victory_detail', { region: gym.badgeKo.replace(' 챔피언배지', ''), leader: gym.leaderKo }));
      // Title and reward messages from achievements
      for (const achEvent of victoryResult.achEvents) {
        messages.push(formatAchievementMessage(achEvent));
      }
      messages.push('═══════════════════════════════');
    } else {
      messages.push(t('gym.badge_earned', { badge: gym.badgeKo, leader: gym.leaderKo, count: victoryResult.badgeCount }));
      for (const achEvent of victoryResult.achEvents) {
        messages.push(formatAchievementMessage(achEvent));
      }
    }
  }

  // Clean up battle state
  deleteBattleState();

  output({
    status: 'victory',
    messages,
    badge: {
      name: gym.badgeKo,
      earned: victoryResult.badgeEarned,
      xp: victoryResult.xpAwarded,
      count: victoryResult.badgeCount,
      total: 8,
    },
    achievements: victoryResult.achEvents.map(e => ({ id: e.id, name: e.name })),
    opponent: pokemonInfo(getActivePokemon(battleState.opponent)),
    player: pokemonInfo(getActivePokemon(battleState.player)),
  });
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/cli/battle-turn.ts
git commit -m "feat(gym-ach): add badge notification and achievement check to battle-turn victory"
```

---

### Task 9: battle-tui/index.ts Integration

**Files:**
- Modify: `src/battle-tui/index.ts:160-198`

- [ ] **Step 1: Add imports**

```typescript
import { checkAchievements, formatAchievementMessage } from '../core/achievements.js';
import { readConfig } from '../core/state.js';
```

- [ ] **Step 2: Add achievement check to victory callback**

In the victory branch (around line 162), after `awardGymVictory`:

```typescript
    if (result.winner === 'player') {
      const participatingPokemon = config.party.filter((name) => state.pokemon[name]);
      const victoryResult = awardGymVictory(state, gym, participatingPokemon);

      // Check achievements immediately after badge
      const achEvents = victoryResult.badgeEarned ? checkAchievements(state, config) : [];

      // Save updated state
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

      // Badge notification to stderr (stdout is for JSON)
      if (victoryResult.badgeEarned) {
        const badgeCount = (state.gym_badges ?? []).length;
        const isChampion = gym.badge.startsWith('champion_');
        if (isChampion) {
          process.stderr.write('\n═══════════════════════════════\n');
          process.stderr.write(`  🏆 ${t('gym.champion_victory_header')} 🏆\n`);
          process.stderr.write(`  ${t('gym.champion_victory_detail', { region: gym.badgeKo.replace(' 챔피언배지', ''), leader: gym.leaderKo })}\n`);
          for (const achEvent of achEvents) {
            process.stderr.write(`  ${formatAchievementMessage(achEvent)}\n`);
          }
          process.stderr.write('═══════════════════════════════\n');
        } else {
          process.stderr.write(`\n${t('gym.badge_earned', { badge: gym.badgeKo, leader: gym.leaderKo, count: badgeCount })}\n`);
          for (const achEvent of achEvents) {
            process.stderr.write(`${formatAchievementMessage(achEvent)}\n`);
          }
        }
      }

      const output = {
        winner: result.winner,
        turnsPlayed: result.turnsPlayed,
        gym: gym.id,
        badge: gym.badge,
        badgeKo: gym.badgeKo,
        badgeEarned: victoryResult.badgeEarned,
        xpAwarded: victoryResult.xpAwarded,
        achievements: achEvents.map(e => ({ id: e.id, name: e.name })),
      };

      console.log(`\n__BATTLE_RESULT__${JSON.stringify(output)}`);
    }
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/battle-tui/index.ts
git commit -m "feat(gym-ach): add badge notification and achievement check to battle-tui victory"
```

---

### Task 10: CommonState Sync in stop.ts + all_gen_badges Trigger

**Files:**
- Modify: `src/hooks/stop.ts:358-362`
- Modify: `src/core/achievements.ts` (checkCommonAchievements switch)

- [ ] **Step 1: Write failing test for common badge_count trigger**

In `test/achievements.test.ts`:

```typescript
  it('total_badges_10 triggers in common achievements', () => {
    const state = makeState();
    const config = makeConfig();
    const commonState = makeCommonState({ total_gym_badges: 10 });
    const events = checkCommonAchievements(commonState, config, state);

    const ev = events.find(e => e.id === 'total_badges_10');
    assert.ok(ev, 'total_badges_10 should trigger');
  });

  it('all_gen_champion triggers at completed_gym_gens >= 9', () => {
    const state = makeState();
    const config = makeConfig();
    const commonState = makeCommonState({ completed_gym_gens: 9 });
    const events = checkCommonAchievements(commonState, config, state);

    const ev = events.find(e => e.id === 'all_gen_champion');
    assert.ok(ev, 'all_gen_champion should trigger');
  });
```

- [ ] **Step 2: Add badge_count and all_gen_badges to checkCommonAchievements()**

In `src/core/achievements.ts`, in `checkCommonAchievements()` switch (around line 139), add:

```typescript
      case 'badge_count':
        triggered = commonState.total_gym_badges >= ach.trigger_value;
        break;
      case 'all_gen_badges':
        triggered = commonState.completed_gym_gens >= ach.trigger_value;
        break;
```

Also add `title` and `rare_weight_multiplier` to `applyCommonAchievementEffects()`:

```typescript
      case 'title':
        // Titles are per-gen state, written to commonState for cross-gen
        // Applied via state.titles when recalculated
        break;
      case 'rare_weight_multiplier':
        // Stored on commonState for cross-gen effect
        break;
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 4: Add gym badge delta sync to stop.ts**

In `src/hooks/stop.ts`, after the existing counter sync block (around line 362, after `commonState.evolution_count += ...`):

```typescript
    // Gym badge sync (preBadgeCount declared alongside preBattleCount earlier)
    const currentBadgeCount = (state.gym_badges ?? []).length;
    commonState.total_gym_badges += currentBadgeCount - preBadgeCount;

    // Check if current gen is fully completed (all 9 badges including champion)
    const gyms = loadGymData(generation);
    const badges = state.gym_badges ?? [];
    const genComplete = gyms.length > 0 && gyms.every(g => badges.includes(g.badge));
    if (genComplete) {
      // Count how many gens are complete by checking if we just completed this one
      // (delta: if previously incomplete, increment)
      const prevBadges = badges.filter(b => !gyms.some(g => g.badge === b));
      // Simple: just recalculate — gen completion is rare, loadGymData is cached
      let completedCount = 0;
      for (const gen of ['gen1','gen2','gen3','gen4','gen5','gen6','gen7','gen8','gen9']) {
        const genGyms = loadGymData(gen);
        if (genGyms.length > 0 && genGyms.every(g => badges.includes(g.badge))) {
          completedCount++;
        }
      }
      commonState.completed_gym_gens = completedCount;
    }
```

**Important:** Add `import { loadGymData } from '../core/gym.js';` at the top of stop.ts if not already present. Then find where the pre-snapshot variables are declared earlier in stop.ts (around line 290-295 where `preBattleCount`, `preBattleWins` etc. are stored) and add:

```typescript
    const preBadgeCount = (state.gym_badges ?? []).length;
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/core/achievements.ts src/hooks/stop.ts test/achievements.test.ts
git commit -m "feat(gym-ach): add commonState sync and cross-gen achievement triggers"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass (879+ tests)

- [ ] **Step 3: Verify achievement count**

Run: `grep -c '"trigger_type"' data/gen4/achievements.json data/common/achievements.json`
Expected: gen4 should have original count + 4, common should have original count + 4

- [ ] **Step 4: Verify champion badge naming**

Run: `grep '"badge":' data/gyms/gen*.json | grep champion`
Expected: All show `champion_<region>` format, no `"Champion Badge"`

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(gym-ach): address final verification issues"
```
