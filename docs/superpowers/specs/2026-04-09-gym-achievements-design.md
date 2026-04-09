# Gym Achievement System Design

**Date:** 2026-04-09
**Status:** Approved
**Branch:** feat/battle-system

## Overview

체육관 배지 획득을 업적 시스템과 연동하여, 배지 진행도 알림 + 체육관 전용 업적 + 칭호 보상을 제공한다. 세대별 업적(gen-specific)과 크로스 세대 업적(common) 이중 구조로 구현.

## Decisions

| 항목 | 결정 | 근거 |
|------|------|------|
| 트리거 범위 | 세대별 + 크로스 세대 | 기존 gen/common 이중 구조 활용 |
| 배지 알림 | 진행도 포맷 + 챔피언 특별 연출 | 배지는 특별 이벤트, 차별화 필요 |
| 보상 | 기존 효과 + 칭호(title) | `state.titles[]` 인프라 이미 존재 |
| 트리거 구현 | 새 trigger_type 추가 | 현재 switch 패턴과 일관성 유지 |
| 체크 시점 | awardGymVictory 직후 | 배지 획득 즉시 피드백 |

## New Trigger Types

`checkAchievements()`의 switch문에 3종 추가:

### `badge_count`

배지 총 개수 비교.

```typescript
case 'badge_count':
  triggered = (state.gym_badges ?? []).length >= ach.trigger_value;
  break;
```

### `champion_defeated`

챔피언 배지 개수 비교. 챔피언 배지는 `champion_` 접두사로 식별.

```typescript
case 'champion_defeated': {
  const championBadges = (state.gym_badges ?? []).filter(b => b.startsWith('champion_'));
  triggered = championBadges.length >= ach.trigger_value;
  break;
}
```

**참고:** 현재 챔피언 체육관(id: 9)의 badge 필드 형식 확인 필요. 기존 데이터에 `champion_` 접두사가 없다면 gym JSON에서 챔피언 배지명을 통일해야 함 (예: `"badge": "champion_kanto"`).

### `all_gen_badges`

한 세대에서 9개 배지(8 관장 + 1 챔피언) 모두 획득한 세대 수 비교.

```typescript
case 'all_gen_badges': {
  // 각 세대별로 모든 배지를 가졌는지 확인
  // loadGymData(gen)로 전체 배지 목록 조회, state.gym_badges에 모두 포함되는지 체크
  let completedGens = 0;
  for (const gen of ALL_GENERATIONS) {
    const gyms = loadGymData(gen);
    if (gyms.length > 0 && gyms.every(g => badges.includes(g.badge))) {
      completedGens++;
    }
  }
  triggered = completedGens >= ach.trigger_value;
  break;
}
```

**`getAchievementProgress()`** (notifications.ts)에도 동일 3종 추가하여 90% 근접 알림 지원.

## Achievement Data

### Gen-Specific (`data/genN/achievements.json` × 9세대)

각 세대에 4개 체육관 업적 추가:

| ID | trigger_type | trigger_value | rarity | 보상 |
|----|-------------|---------------|--------|------|
| `first_badge` | `badge_count` | 1 | 1 | `add_item: pokeball × 3` |
| `four_badges` | `badge_count` | 4 | 2 | `xp_bonus: 0.1` |
| `eight_badges` | `badge_count` | 8 | 3 | `add_item: pokeball × 10` |
| `champion` | `champion_defeated` | 1 | 4 | 칭호 + 보상 포켓몬 (세대별 전설) |

**챔피언 보상 포켓몬 (세대별):**

| 세대 | 칭호 | reward_pokemon |
|------|------|----------------|
| Gen1 | 관동 챔피언 | 150 (뮤츠) |
| Gen2 | 성도 챔피언 | 249 (루기아) |
| Gen3 | 호연 챔피언 | 384 (레쿠쟈) |
| Gen4 | 신오 챔피언 | 493 (아르세우스) |
| Gen5 | 하나 챔피언 | 644 (제크로무) |
| Gen6 | 칼로스 챔피언 | 716 (제르네아스) |
| Gen7 | 알로라 챔피언 | 791 (솔가레오) |
| Gen8 | 가라르 챔피언 | 890 (무한다이노) |
| Gen9 | 팔데아 챔피언 | 1007 (코라이돈) |

**주의:** `reward_pokemon`이 해당 세대 pokemon DB에 존재하는지 구현 시 확인 필요. 없으면 `reward_pokemon`을 null로 두고 칭호만 부여.

### Cross-Gen (`data/common/achievements.json`)

| ID | trigger_type | trigger_value | rarity | 보상 |
|----|-------------|---------------|--------|------|
| `total_badges_10` | `badge_count` | 10 | 2 | `add_item: pokeball × 5` |
| `total_badges_30` | `badge_count` | 30 | 3 | `xp_bonus: 0.15` |
| `three_gen_champion` | `all_gen_badges` | 3 | 4 | 칭호: "멀티 챔피언" |
| `all_gen_champion` | `all_gen_badges` | 9 | 5 | 칭호: "포켓몬 마스터" |

## Badge Notification Format

### Regular Badge

배지 획득 시 한 줄 포맷으로 진행도 표시:

```
🥊 Boulder Badge earned! (웅 defeated) [1/8]
```

```
🥊 블루배지 획득! (이슬 격파) [2/8]
```

i18n 키: `gym.badge_earned` — `"{badge} earned! ({leader} defeated) [{count}/8]"`

### Champion Victory

챔피언 격파 시 멀티라인 특별 연출:

```
═══════════════════════════════
  🏆 CHAMPION VICTORY! 🏆
  관동 챔피언 그린 격파!
  칭호 획득: 관동 챔피언
  보상: 뮤츠 획득!
═══════════════════════════════
```

i18n 키:
- `gym.champion_victory_header` — `"CHAMPION VICTORY!"`
- `gym.champion_victory_detail` — `"{region} Champion {leader} defeated!"`
- `gym.title_earned` — `"Title earned: {title}"`

### Output Integration

`battle-turn.ts`의 JSON output에 필드 추가:

```json
{
  "status": "victory",
  "badge": {
    "name": "boulder",
    "earned": true,
    "count": 1,
    "total": 8
  },
  "achievements": [
    { "id": "first_badge", "name": "First Badge!" }
  ]
}
```

## CommonState Sync

크로스 세대 업적은 `commonState`의 카운터로 트리거됨. 현재 `commonState`에는 gym 관련 필드가 없으므로 2개 추가:

```typescript
export interface CommonState {
  // ... existing fields ...
  total_gym_badges: number;     // 전체 세대 배지 합산
  completed_gym_gens: number;   // 9배지 올클한 세대 수
}
```

**동기화 시점:** `stop.ts` hook에서 기존 `battle_count`/`battle_wins` delta 동기화와 동일 패턴:

```typescript
// stop.ts — commonState sync section
const prevBadges = preBadgeCount; // stop hook 진입 시 snapshot
const currentBadges = (state.gym_badges ?? []).length;
commonState.total_gym_badges += currentBadges - prevBadges;
// completed_gym_gens는 전체 세대 상태를 봐야 하므로, 현 세대 올클 여부만 체크
```

`checkCommonAchievements()` switch문에서:
- `badge_count` → `commonState.total_gym_badges >= trigger_value`
- `all_gen_badges` → `commonState.completed_gym_gens >= trigger_value`
- `champion_defeated` → `commonState`에 별도 카운터 불필요. `completed_gym_gens`로 충분 (올클 = 챔피언 포함)

**`completed_gym_gens` 업데이트:** `awardGymVictory()` 후 현재 세대의 모든 배지를 가졌는지 확인. 올클 달성 시 `commonState.completed_gym_gens++`.

## Code Changes

### `src/core/types.ts`

- `CommonState`에 `total_gym_badges: number`, `completed_gym_gens: number` 추가

### `src/core/achievements.ts`

- `checkAchievements()` switch문에 `badge_count`, `champion_defeated`, `all_gen_badges` 추가
- 칭호 보상 효과 처리: `reward_effects`에 `{ type: "title", value: "관동 챔피언" }` 추가
  - `applyAchievementEffects()`에 `case 'title'` 추가 → `state.titles.push(effect.value)`

### `src/core/notifications.ts`

- `getAchievementProgress()`에 3종 trigger_type 추가
- `badge_count`: `badges.length / triggerValue`
- `champion_defeated`: `championBadges.length / triggerValue`
- `all_gen_badges`: `completedGens / triggerValue`

### `src/core/gym.ts`

- `awardGymVictory()` 자체는 변경 없음
- 챔피언 배지 네이밍 확인: `champion_` 접두사 통일

### `src/cli/battle-turn.ts`

- 승리 처리 후 `checkAchievements()` 호출
- 배지 획득 시 `gym.badge_earned` 포맷 출력
- 챔피언 승리 시 특별 연출 출력
- JSON output에 `achievements` 필드 추가

### `src/battle-tui/index.ts`

- 동일하게 승리 후 `checkAchievements()` 호출
- 배지/챔피언 포맷 출력

### `src/hooks/stop.ts`

- commonState 동기화 섹션에 `total_gym_badges`, `completed_gym_gens` delta 동기화 추가
- 기존 `battle_count`/`battle_wins` 패턴과 동일

### `data/genN/achievements.json` (×9)

- 4개 체육관 업적 추가 (`first_badge`, `four_badges`, `eight_badges`, `champion`)

### `data/common/achievements.json`

- 4개 크로스 세대 업적 추가 (`total_badges_10`, `total_badges_30`, `three_gen_champion`, `all_gen_champion`)

### `src/i18n/en.json`, `src/i18n/ko.json`

- 배지 알림 키 6개 추가
- 업적 이름 키 8개 추가 (gen 4 + common 4)
- 칭호 이름 키 11개 추가 (9세대 + 멀티챔피언 + 포켓몬마스터)

### `data/gyms/genN.json` (×9)

- 챔피언 체육관 badge 필드를 `champion_` 접두사로 통일 (현재 값 확인 후 필요 시)

## Testing

- `badge_count` trigger: 배지 0→1→4→8 시뮬레이션
- `champion_defeated` trigger: 챔피언 배지 추가 시 트리거
- `all_gen_badges` trigger: 세대 올클 카운트
- 알림 포맷: 일반 배지 vs 챔피언 출력 검증
- 칭호 부여: `state.titles`에 정상 추가
- 중복 방지: 재도전 시 업적 재트리거 안 됨
- 기존 업적 회귀: 기존 trigger_type들 정상 동작

## Scope Exclusions

- 배지 수집 UI (별도 CLI 명령) — 이번 스코프 아님
- 업적 알림 사운드 — 기존 시스템 따름
- PvP 관련 업적 — PvP 시스템 구현 시 별도 설계
