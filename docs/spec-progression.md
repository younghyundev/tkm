# Progression System Specification

> 성장 시스템 기술 명세: XP, 레벨, 진화, 업적, 지역

관련 문서: [@spec-battle.md](spec-battle.md) | [@spec-data.md](spec-data.md)

소스: `src/core/xp.ts`, `src/core/evolution.ts`, `src/core/achievements.ts`, `src/core/regions.ts`, `src/core/encounter.ts`

## 1. Experience System

### 1.1 XP 획득 경로

| 경로 | 설명 | 수식 |
|------|------|------|
| 토큰 소비 | 세션 종료 시 자동 | `floor(deltaTokens / tokens_per_xp)` |
| 전투 승리 | 야생 전투 승리 보상 | `(50 + level×3 + typeBonus + rarityBonus) × multiplier` |

**멀티플라이어 스택:**
- `xp_bonus_multiplier`: 업적으로 증가 (기본 1.0, ten_sessions 달성 시 1.2)
- 서브에이전트 파견: 1.5x (파견된 포켓몬만)

### 1.2 경험치 그룹 (6종)

원작 포켓몬과 동일한 공식. `levelToXp(level, group)`은 해당 레벨까지 필요한 누적 XP.

| 그룹 | 공식 | Lv.50 필요 XP | 대표 포켓몬 |
|------|------|--------------|------------|
| `medium_fast` | n³ | 125,000 | 모부기, 팽도리 |
| `medium_slow` | 6n³/5 - 15n² + 100n - 140 | 117,360 | 럭시오 |
| `slow` | 5n³/4 | 156,250 | 불꽃숭이, 가브리아스 |
| `fast` | 4n³/5 | 100,000 | 찌르꼬 |
| `erratic` | 구간별 (4구간) | 가변 | 비달 |
| `fluctuating` | 구간별 (3구간) | 가변 | 꼬링크 |

### 1.3 Level Calculation

```typescript
// XP → Level 변환 (binary search, O(log n))
function xpToLevel(xp: number, group: ExpGroup): number {
  let lo = 1, hi = 100;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (levelToXp(mid, group) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
```

최대 레벨: 100 (Lv.100의 levelToXp가 XP 상한)

## 2. Evolution System

### 2.1 진화 조건 타입

| 조건 | 필드 | 예시 |
|------|------|------|
| 레벨 도달 | `evolves_at: number` | 모부기 Lv.18 → 수풀부기 |
| 우정도 | `evolves_condition: "friendship"` | 리오르 friendship≥220 → 루카리오 |
| 교환 (업적 대체) | `evolves_condition: "trade"` | ten_sessions 업적 → 진화 |
| 아이템 | `evolves_condition: "item:stone"` | 아이템 보유 시 진화 |
| 지역 | `evolves_condition: "location:region"` | 특정 지역에서 레벨업 시 |
| 기술 | `evolves_condition: "move:type"` | 특정 타입 기술 습득 시 |

### 2.2 진화 체크 로직

```typescript
function checkEvolution(pokemonName: string, ctx: EvolutionContext): EvolutionResult | null {
  // 1. DB에서 포켓몬 데이터 조회
  // 2. evolves_at이 null이면 최종 진화 → null
  // 3. 이미 진화 레벨을 지나갔으면 (oldLevel >= evolves_at) → null
  // 4. 조건 체크:
  //    - 레벨: newLevel >= evolves_at
  //    - friendship: ctx.friendship >= 220
  //    - trade: ctx.unlockedAchievements.includes('ten_sessions')
  //    - item: ctx.items[itemName] > 0
  //    - location: ctx.currentRegion === regionName
  // 5. 조건 충족 시 EvolutionResult 반환
}
```

### 2.3 진화 적용

```typescript
function applyEvolution(state, config, evolution, currentXp): void {
  // 1. 기존 포켓몬에서 friendship, ev 이월
  // 2. 새 포켓몬 state 생성 (id, xp, level, friendship, ev 유지)
  // 3. unlocked에 추가
  // 4. config.party에서 교체
  // 5. pokedex 갱신 (seen + caught)
  // 6. evolution_count 증가
}
```

**이월 필드:** friendship, ev (진화해도 유지)
**리셋 필드:** 없음 (xp, level도 그대로 유지)

### 2.4 Friendship System

```typescript
function addFriendship(state: State, pokemonName: string, amount: number): void {
  state.pokemon[pokemonName].friendship = (state.pokemon[pokemonName].friendship ?? 0) + amount;
}
```

- 세션 종료 시 자동 증가 (hooks/stop.ts에서 호출)
- 진화 임계값: 220
- 진화 후에도 우정도 유지

## 3. Achievement System

### 3.1 트리거 타입

| trigger_type | 비교 대상 | 예시 업적 |
|-------------|----------|----------|
| `session_count` | state.session_count | first_session (1), ten_sessions (10) |
| `error_count` | state.error_count | first_error (1) |
| `evolution_count` | state.evolution_count | first_evolution (1) |
| `total_tokens` | state.total_tokens_consumed | hundred_k_tokens (100000) |
| `permission_count` | state.permission_count | permission_master (50) |
| `battle_wins` | state.battle_wins | ten_battle_wins (10) |
| `battle_count` | state.battle_count | hundred_battles (100) |
| `catch_count` | state.catch_count | twenty_five_caught (25) |

### 3.2 보상 타입

| 보상 | 설명 | 예시 |
|------|------|------|
| `reward_pokemon` | 새 포켓몬 해금 | first_session → 팽도리 |
| `reward_item` | 아이템 지급 | 특정 업적 → pokeball ×5 |
| `max_party_size` | 파티 크기 증가 | permission_master → max 6 |
| `xp_bonus` | XP 배율 증가 | ten_sessions → 1.2x |

### 3.3 체크 로직

```typescript
function checkAchievements(state, config): AchievementEvent[] {
  const events = [];
  for (const achievement of achievementsDB) {
    if (state.achievements[achievement.id]) continue;  // 이미 달성
    if (state[achievement.trigger_type] >= achievement.trigger_value) {
      state.achievements[achievement.id] = true;
      // 보상 적용
      events.push(achievement);
    }
  }
  return events;
}
```

업적은 **한 번만** 달성 가능하며, 여러 업적이 동시에 달성될 수 있다.

## 4. Region System

### 4.1 지역 구조

| 지역 | 레벨 범위 | 해금 조건 | 풀 크기 |
|------|----------|----------|--------|
| 쌍둥이잎 마을 | 1-10 | 기본 | ~10종 |
| 풀밭지방 | 10-20 | 5 caught | ~12종 |
| 시티 | 15-25 | 10 seen | ~10종 |
| 마운틴 | 30-40 | 25 caught | ~8종 |
| ... | ... | ... | ... |

### 4.2 해금 조건

```typescript
interface UnlockCondition {
  type: 'pokedex_seen' | 'pokedex_caught';
  value: number;
}
```

### 4.3 지역 이동

```typescript
function moveToRegion(config, regionName): boolean {
  // 해금 여부 확인 후 config.current_region 변경
}
```

지역은 조우 포켓몬 풀과 레벨 범위를 결정한다.

## 5. Encounter System

### 5.1 조우 확률

```typescript
function rollEncounter(partyAvgLevel, regionMinLevel): boolean {
  let rate = 0.15;  // 15% 기본
  if (partyAvgLevel < regionMinLevel) rate -= 0.05;  // 저레벨 패널티
  return Math.random() < clamp(0.05, 0.25, rate);
}
```

### 5.2 야생 포켓몬 선택

```typescript
function selectWildPokemon(regionPool, pokemonDB): { name, level } {
  // 1. 레어도 가중치 기반 랜덤 선택
  //    common > uncommon > rare > legendary > mythical
  // 2. 지역 레벨 범위 내 랜덤 레벨
}
```

### 5.3 포획

전투 승리 시 자동 포획:
- 이미 보유한 포켓몬이면 무시
- 미보유 시: state.pokemon에 추가 (ev=0, friendship=0)
- 파티에 빈 자리 있으면 자동 합류
- pokedex에 caught 기록
- catch_count 증가
