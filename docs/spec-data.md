# Data Schema Specification

> 데이터 스키마 기술 명세: State, Config, PokemonDB, 타입 시스템

관련 문서: [@PRD-technical.md](PRD-technical.md) | [@spec-battle.md](spec-battle.md) | [@spec-progression.md](spec-progression.md)

소스: `src/core/types.ts`, `src/core/state.ts`, `src/core/config.ts`, `data/*.json`

## 1. TypeScript Interfaces

### 1.1 PokemonState (개체 상태)

```typescript
interface PokemonState {
  id: number;          // National Pokedex 번호
  xp: number;          // 누적 경험치
  level: number;       // 현재 레벨 (1-100)
  friendship: number;  // 우정도 (진화 조건)
  ev: number;          // 노력치 (0-252, 전투 승리 시 +1)
}
```

### 1.2 State (게임 상태)

```typescript
interface State {
  // === 포켓몬 ===
  pokemon: Record<string, PokemonState>;  // 이름 → 개체 상태
  unlocked: string[];                      // 해금된 포켓몬 목록

  // === 포켓도감 ===
  pokedex: Record<string, PokedexEntry>;   // 이름 → 발견/포획 기록

  // === 전투 통계 ===
  battle_count: number;
  battle_wins: number;
  battle_losses: number;
  encounter_count: number;
  catch_count: number;

  // === 세션 통계 ===
  session_count: number;
  total_tokens_consumed: number;
  last_session_id: string | null;
  last_session_tokens: Record<string, number>;  // 세션별 토큰 추적 (중복 방지)

  // === 기타 통계 ===
  error_count: number;
  permission_count: number;
  evolution_count: number;

  // === 보너스 ===
  xp_bonus_multiplier: number;  // 업적으로 증가 (기본 1.0)

  // === 업적 & 아이템 ===
  achievements: Record<string, boolean>;
  items: Record<string, number>;

  // === 디버그 ===
  cheat_log?: Array<{ timestamp: string; command: string }>;

  // === 디스플레이 (1턴 표시) ===
  last_battle?: BattleResult | null;
  last_tip?: { id: string; text: string } | null;
}
```

**기본값 (DEFAULT_STATE):**
모든 숫자 필드 = 0, 모든 배열/객체 = 빈 값, xp_bonus_multiplier = 1.0

### 1.3 Config (사용자 설정)

```typescript
interface Config {
  // === 핵심 ===
  tokens_per_xp: number;        // 10000 (토큰 → XP 변환 비율)
  party: string[];               // 활성 파티 (최대 max_party_size)
  starter_chosen: boolean;       // 스타터 선택 완료 여부

  // === 오디오/비주얼 ===
  volume: number;                // 0.0 ~ 1.0
  sprite_enabled: boolean;       // ANSI 스프라이트 표시
  cry_enabled: boolean;          // 울음소리 재생

  // === XP ===
  xp_formula: ExpGroup;          // 기본 경험치 그룹
  xp_bonus_multiplier: number;   // 글로벌 XP 배율

  // === 파티 ===
  max_party_size: number;        // 기본 3, 업적으로 최대 6
  default_dispatch: string | null; // 서브에이전트 우선 파견

  // === 지역 ===
  current_region: string;        // 현재 지역

  // === 통합 ===
  peon_ping_integration: boolean;  // peon-ping 연동
  peon_ping_port: number;          // 19998

  // === 표시 모드 ===
  sprite_mode: 'all' | 'ace_only' | 'emoji_all' | 'emoji_ace';
  info_mode: 'ace_full' | 'name_level' | 'all_full' | 'ace_level';
  tips_enabled: boolean;
}
```

### 1.4 Session (세션 상태)

```typescript
interface Session {
  session_id: string | null;
  agent_assignments: AgentAssignment[];
  evolution_events: string[];
  achievement_events: string[];
}

interface AgentAssignment {
  agent_id: string;
  pokemon: string;
  xp_multiplier: number;  // 1.5
}
```

### 1.5 PokedexEntry

```typescript
interface PokedexEntry {
  seen: boolean;
  caught: boolean;
  first_seen: string | null;  // ISO 날짜 (YYYY-MM-DD)
}
```

## 2. Pokemon Database

### 2.1 PokemonData (종족 데이터)

```typescript
interface PokemonData {
  id: number;                    // National Pokedex # (387-493)
  name: string;                  // 한글 이름
  types: string[];               // 타입 배열 (1-2개)
  stage: number;                 // 진화 단계 (1, 2, 3)
  line: string[];                // 진화 라인 전체
  evolves_at: number | null;     // 진화 레벨 (최종 진화는 null)
  evolves_condition?: string;    // 특수 진화 조건
  unlock: string;                // 해금 조건 (업적 ID)
  exp_group: ExpGroup;           // 경험치 그룹
  rarity: Rarity;                // 레어도
  region: string;                // 서식 지역
  base_stats: BaseStats;         // 종족값
  catch_rate: number;            // 포획률 (0-255)
}

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}
```

### 2.2 PokemonDB (전체 DB)

```typescript
interface PokemonDB {
  pokemon: Record<string, PokemonData>;  // 이름 → 종족 데이터
  starters: string[];                     // ["모부기", "불꽃숭이", "팽도리"]
  type_colors: Record<string, string>;    // 타입별 ANSI 색상 코드
  type_chart: Record<string, TypeMatchup>; // 18종 타입 상성표
  rarity_weights: RarityWeights;           // 레어도별 조우 가중치
}
```

### 2.3 통계

| 항목 | 수치 |
|------|------|
| 총 포켓몬 | 107종 |
| 세대 | Gen 4 (신오) |
| 타입 | 18종 |
| 레어도 | 5단계 (common ~ mythical) |
| 스타터 | 3종 |
| 지역 | 9곳 |
| 업적 | 25+ |

## 3. Static Data Files

### 3.1 `data/pokemon.json`

```jsonc
{
  "pokemon": {
    "모부기": {
      "id": 387,
      "name": "모부기",
      "types": ["풀", "땅"],
      "stage": 1,
      "line": ["모부기", "수풀부기", "토대부기"],
      "evolves_at": 18,
      "unlock": "starter",
      "exp_group": "medium_slow",
      "rarity": "rare",
      "region": "쌍둥이잎 마을",
      "base_stats": { "hp": 55, "attack": 68, "defense": 64, "speed": 31 },
      "catch_rate": 45
    }
    // ... 106종 더
  },
  "starters": ["모부기", "불꽃숭이", "팽도리"],
  "type_colors": { "불꽃": "\u001b[31m", "물": "\u001b[34m", ... },
  "type_chart": { "불꽃": { "strong": ["풀","벌레","강철","얼음"], "weak": ["물","바위","땅"], "immune": [] }, ... },
  "rarity_weights": { "common": 50, "uncommon": 30, "rare": 15, "legendary": 4, "mythical": 1 }
}
```

### 3.2 `data/achievements.json`

```jsonc
[
  {
    "id": "first_session",
    "name": "첫 발걸음",
    "description": "첫 번째 세션을 시작했다",
    "trigger_type": "session_count",
    "trigger_value": 1,
    "reward_pokemon": "팽도리",
    "rarity": "★☆☆"
  }
  // ... 24종 더
]
```

### 3.3 `data/regions.json`

```jsonc
[
  {
    "id": "twin_leaf",
    "name": "쌍둥이잎 마을",
    "description": "모험이 시작되는 작은 마을",
    "level_range": [1, 10],
    "pokemon_pool": ["찌르꼬", "비달", "꼬링크", ...],
    "unlock_condition": null
  },
  {
    "id": "grassland",
    "name": "풀밭지방",
    "level_range": [10, 20],
    "pokemon_pool": ["포니타", "당메모리", ...],
    "unlock_condition": { "type": "pokedex_caught", "value": 5 }
  }
  // ... 7곳 더
]
```

### 3.4 `data/tips.json`

동적 팁 템플릿 — `{next_region}`, `{region_level}`, `{next_achievement}` 등의 플레이스홀더를 실시간 데이터로 치환.

## 4. Type System

### 4.1 ExpGroup

```typescript
type ExpGroup = 'medium_fast' | 'medium_slow' | 'slow' | 'fast' | 'erratic' | 'fluctuating';
```

### 4.2 Rarity

```typescript
type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
```

### 4.3 타입 목록 (18종)

노말, 불꽃, 물, 풀, 전기, 얼음, 격투, 독, 땅, 비행, 에스퍼, 벌레, 바위, 고스트, 드래곤, 악, 강철, 페어리

### 4.4 TypeMatchup

```typescript
interface TypeMatchup {
  strong: string[];   // 1.5x 효과
  weak: string[];     // 0.67x 효과
  immune: string[];   // 0.25x 효과 (완전 면역은 아님)
}
```

## 5. Migration

### 5.1 필드 추가 마이그레이션

`readState()`에서 로드 시 자동 마이그레이션:

```typescript
for (const entry of Object.values(result.pokemon)) {
  if (entry.friendship === undefined) (entry as any).friendship = 0;
  if (entry.ev === undefined) (entry as any).ev = 0;
}
```

새 필드 추가 시 동일 패턴으로 마이그레이션 추가.

### 5.2 마이그레이션 이력

| 버전 | 필드 | 기본값 |
|------|------|--------|
| v0.0.1 | `friendship` | 0 |
| v0.0.2-rc.3+ | `ev` | 0 |

## 6. File Paths

```typescript
// src/core/paths.ts
const USER_DIR = join(homedir(), '.claude', 'tokenmon');
const LOCAL_DIR = join(process.cwd(), '.tokenmon');

STATE_PATH = join(USER_DIR, 'state.json');
CONFIG_PATH = join(USER_DIR, 'config.json');
SESSION_PATH = join(USER_DIR, 'session.json');
LOCK_PATH = join(USER_DIR, 'state.lock');
```

User scope (`~/.claude/tokenmon/`)이 기본. Local scope (`./.tokenmon/`)는 개발/테스트용.
