# Shiny (이로치) Feature - Code-level Design

---

## Phase 1 (MVP)

---

### 1. `src/core/types.ts`

**변경 유형**: 수정

**변경할 타입 시그니처**:

```typescript
// PokemonState — shiny 필드 추가
export interface PokemonState {
  // ... 기존 필드 유지 ...
  shiny?: boolean;  // optional: 기존 데이터 하위 호환. true = 이로치 개체
}

// PokedexEntry — shiny_caught 필드 추가
export interface PokedexEntry {
  // ... 기존 필드 유지 ...
  shiny_caught?: boolean;  // optional: 해당 종의 이로치를 한번이라도 잡았는가
}

// State — shiny 카운터 3개 추가
export interface State {
  // ... 기존 필드 유지 ...
  shiny_encounter_count: number;
  shiny_catch_count: number;
  shiny_escaped_count: number;
}

// BattleResult — shiny 필드 추가
export interface BattleResult {
  // ... 기존 필드 유지 ...
  shiny: boolean;
}
```

```typescript
// WildPokemon — types.ts에 정의, selectWildPokemon 반환 타입과 resolveBattle 파라미터 양쪽에서 공유
export interface WildPokemon {
  name: string;
  level: number;
  shiny: boolean;
}
```

**인터페이스 포인트**: PokemonState.shiny와 PokedexEntry.shiny_caught는 optional로 선언하여 기존 JSON 역직렬화 하위 호환을 보장한다. State의 카운터 3개는 required지만 DEFAULT_STATE 병합으로 0이 채워진다. BattleResult.shiny는 required -- 새로 생성되는 결과에는 항상 포함되지만, 기존 last_battle 읽기 시 `?? false` 보정이 필요하다. WildPokemon은 types.ts에 정의하여 encounter.ts와 battle.ts에서 공유한다.

---

### 2. `src/core/state.ts`

**변경 유형**: 수정

**변경 포인트 (3곳)**:

(a) `DEFAULT_STATE` 객체에 카운터 추가:
```typescript
const DEFAULT_STATE: State = {
  // ... 기존 필드 ...
  shiny_encounter_count: 0,
  shiny_catch_count: 0,
  shiny_escaped_count: 0,
};
```

(b) `readState` 함수의 per-pokemon migration 루프에 shiny 보정 추가:
```typescript
// 기존 friendship/ev 보정 루프 내부에 추가
for (const entry of Object.values(result.pokemon)) {
  // ... 기존 friendship, ev 보정 ...
  if (entry.shiny === undefined) (entry as any).shiny = false;
}
```

shiny 카운터 3개는 `DEFAULT_STATE`에 0으로 추가하는 것만으로 충분하다. 기존 `readState`가 `{ ...DEFAULT_STATE, ...parsed }` spread 패턴을 사용하므로 누락된 카운터는 자동으로 0이 채워진다. 별도 `?? 0` 보정은 불필요 (기존 encounter_count, catch_count 등과 동일 패턴).

**인터페이스 포인트**: `readState` 반환값에 shiny 카운터가 항상 존재하게 되므로 소비자는 `??` 없이 사용 가능.

---

### 3. `src/core/encounter.ts`

**변경 유형**: 수정

**변경할 함수 시그니처**:

```typescript
// 신규 함수 — shiny 판정 (export for testability)
export const SHINY_RATE = 1 / 512;

export function rollShiny(): boolean;
// pseudo-code: return Math.random() < SHINY_RATE;
```

```typescript
// 반환 타입 변경: { name, level } → { name, level, shiny }
export function selectWildPokemon(
  state: State,
  config: Config,
): { name: string; level: number; shiny: boolean } | null;
```

**변경 포인트**:

(a) `selectWildPokemon` 내부 — 기존 모든 return 지점에서 반환 객체에 `shiny: rollShiny()` 추가. rollShiny() 호출은 종/레벨 결정 이후 반환 직전 한 번만 수행.

(b) `processEncounter` — resolveBattle 호출을 positional에서 wild 구조체 전달로 변경:
```typescript
// 변경 전: resolveBattle(state, config, wild.name, wild.level)
// 변경 후: resolveBattle(state, config, wild)
```

**인터페이스 포인트**: processEncounter는 resolveBattle의 호출자이므로 battle.ts 변경과 동시에 반영해야 한다.

---

### 4. `src/core/battle.ts`

**변경 유형**: 수정

**변경할 함수 시그니처**:

```typescript
// WildPokemon은 types.ts에 정의 (Section 1 참조)
// resolveBattle 시그니처 변경
export function resolveBattle(
  state: State,
  config: Config,
  wild: WildPokemon,        // 기존: wildName: string, wildLevel: number
): BattleResult | null;

// formatBattleMessage는 시그니처 불변, 내부 로직 변경
export function formatBattleMessage(result: BattleResult): string;
```

**변경 포인트**:

(a) `resolveBattle` 내부:
- `wildName` → `wild.name`, `wildLevel` → `wild.level`로 참조 변경
- 포획 성공 시 PokemonState 생성 블록에 `shiny: wild.shiny` 추가
- 반환 객체에 `shiny: wild.shiny` 추가

(b) `formatBattleMessage` 내부:
- 구버전 BattleResult 보정: `const isShiny = result.shiny ?? false;`
- shiny인 경우 defenderName에 `getPokemonName(result.defender, undefined, isShiny)` 사용
- shiny이면 배틀 메시지 앞에 `t('battle.shiny_appeared')` 접두
- 포획 성공 + shiny: `t('battle.shiny_catch')` 추가
- 패배/도주 + shiny: `t('battle.shiny_escaped')` 추가

---

### 5. `src/core/pokedex.ts`

**변경 유형**: 수정

**추가할 함수**:

```typescript
/**
 * Mark a pokemon species as shiny-caught in the pokedex.
 */
export function markShinyCaught(state: State, name: string): void;
// pseudo-code: state.pokedex[name]가 존재하면 shiny_caught = true
//              존재하지 않으면 markCaught 호출 후 shiny_caught = true
```

**PokedexCompletion 확장 (Phase 3 대비)**:

```typescript
export interface PokedexCompletion {
  // ... 기존 필드 ...
  shinyCaught: number;      // shiny_caught === true인 종 수
}
```

**인터페이스 포인트**: `markShinyCaught`는 hooks/stop.ts에서 호출된다. 기존 `markCaught`와 동일 패턴.

---

### 6. `src/core/stats.ts`

**변경 유형**: 수정

**추가할 함수 (3개)**:

```typescript
export function recordShinyEncounter(state: State): void;
// pseudo-code: state.shiny_encounter_count++

export function recordShinyCatch(state: State): void;
// pseudo-code: state.shiny_catch_count++

export function recordShinyEscaped(state: State): void;
// pseudo-code: state.shiny_escaped_count++
```

**패턴 차이 참고**: 기존 `recordEncounter`/`recordBattle`/`recordCatch`는 `state.stats.weekly_*`와 `state.stats.total_*`를 모두 증감한다. `recordShiny*` 함수는 `State` 최상위 카운터(`shiny_encounter_count` 등)만 증감하며, weekly/total 분리 추적은 하지 않는다. 이는 shiny 통계에 weekly 리셋이 불필요하다는 설계 판단에 따른 것이다.

**인터페이스 포인트**: hooks/stop.ts에서 battleResult.shiny 기반으로 호출. 호출 패턴은 기존 record* 함수와 동일.

---

### 7. `src/core/pokemon-data.ts`

**변경 유형**: 수정

**변경할 함수 시그니처**:

```typescript
// 기존: export function getPokemonName(id: string | number, gen?: string): string;
// 변경:
export function getPokemonName(
  id: string | number,
  gen?: string,
  shiny?: boolean,    // NEW: true이면 "★" 접두사 추가
): string;
```

**pseudo-code**:
```
name = 기존 로직으로 이름 조회
if shiny: return "★" + name
return name
```

**인터페이스 포인트**: 기존 호출 site는 shiny 파라미터 생략 시 undefined → 기존 동작. Phase 1에서는 battle.ts의 formatBattleMessage와 status-line.ts에서만 shiny=true 전달.

---

### 8. `src/hooks/stop.ts`

**변경 유형**: 수정

**추가 import**:

```typescript
import { markShinyCaught } from '../core/pokedex.js';
import { recordShinyEncounter, recordShinyCatch, recordShinyEscaped } from '../core/stats.js';
```

**변경 포인트** — 기존 recordEncounter/recordBattle/recordCatch 호출 이후에 추가:

```typescript
if (battleResult.shiny) {
  recordShinyEncounter(state);
  if (battleResult.caught) {
    recordShinyCatch(state);
    markShinyCaught(state, battleResult.defender);
  } else {
    recordShinyEscaped(state);
  }
}
```

**인터페이스 포인트**: 기존 record 호출 패턴 바로 아래에 shiny 분기 추가.

---

### 9. `src/status-line.ts`

**변경 유형**: 수정

**변경 포인트**:

파티 이름 표시 — displayName 생성 시:
```typescript
// 변경 전: const displayName = getPokemonName(p.name);
// 변경 후:
const isShiny = state.pokemon[p.name]?.shiny ?? false;
const displayName = getPokemonName(p.name, undefined, isShiny);
```

last_battle의 shiny 보정은 formatBattleMessage 내부에서 `?? false` 처리하므로 status-line.ts 자체 추가 변경 불필요.

---

### 10. `src/cli/tokenmon.ts`

**변경 유형**: 수정

**변경 포인트**:

(a) `cmdStatus` — 파티 표시에서 shiny 구분:
```typescript
const isShiny = state.pokemon[pokemon]?.shiny ?? false;
const displayName = getPokemonName(pokemon, undefined, isShiny);
```

(b) `cmdPokedex` — 상세 뷰에서 shiny_caught 표시:
```typescript
const shinyCaught = pdex?.shiny_caught ?? false;
if (shinyCaught) {
  console.log(`  ${t('cli.pokedex.shiny_caught')}`);
}
```

(c) `cmdStatus` — shiny 통계 (shiny_catch_count > 0인 경우만):
```typescript
if (state.shiny_catch_count > 0) {
  console.log(t('cli.status.stat_shiny_catches', { count: state.shiny_catch_count }));
}
```

---

### 11. `src/i18n/ko.json`

**추가할 키**:

```json
{
  "battle.shiny_appeared": "✦ 이로치 {pokemon:이/가} 나타났다!",
  "battle.shiny_catch": "\n★ 이로치 포획 성공!",
  "battle.shiny_escaped": "\n이로치 {pokemon:이/가} 도망쳤다...",
  "cli.pokedex.shiny_caught": "  ★이로치 포획 완료",
  "cli.status.stat_shiny_catches": "  ★이로치 포획: {count}종"
}
```

---

### 12. `src/i18n/en.json`

**추가할 키**:

```json
{
  "battle.shiny_appeared": "✦ A shiny {pokemon} appeared!",
  "battle.shiny_catch": "\n★ Shiny caught!",
  "battle.shiny_escaped": "\nThe shiny {pokemon} got away...",
  "cli.pokedex.shiny_caught": "  ★Shiny caught",
  "cli.status.stat_shiny_catches": "  ★Shiny catches: {count}"
}
```

---

### 13. `test/helpers.ts`

**변경 유형**: 수정

`makeState` factory에 shiny 카운터 3개 추가:

```typescript
export function makeState(overrides: Partial<State> = {}): State {
  return {
    // ... 기존 필드 ...
    shiny_encounter_count: 0,
    shiny_catch_count: 0,
    shiny_escaped_count: 0,
    ...overrides,
  };
}
```

---

## Phase 2 (스프라이트)

---

### 14. `src/sprites/shiny.ts` (신규)

**변경 유형**: 추가

**함수 시그니처**:

```typescript
export function rgbToHsl(r: number, g: number, b: number): [number, number, number];

export function hslToRgb(h: number, s: number, l: number): [number, number, number];

export function ansi256ToRgb(code: number): [number, number, number];

export function rgbToAnsi256(r: number, g: number, b: number): number;

export const SHINY_HUE_SHIFT = 180;

/**
 * Shift hue of all ANSI 256 color codes in a text string.
 * Parses \x1b[38;5;{N}m and \x1b[48;5;{N}m patterns.
 */
export function shiftAnsiHue(text: string, degrees?: number): string;

/**
 * Hue-shift all pixels in a PNG buffer. Returns a new PNG buffer.
 * Prepared for future kitty/iTerm2/sixel integration.
 */
export function hueShiftPng(pngBuffer: Buffer, degrees?: number): Buffer;
```

**Dependencies**: `pngjs` (기존 sprites/convert.ts에서 이미 사용 중)

---

### 15. `src/status-line.ts` (Phase 2 추가 변경)

**변경 유형**: 수정

**변경할 함수 시그니처**:

```typescript
function loadSprite(pokemonId: number, isShiny?: boolean): string[];
```

**변경 포인트**:

```typescript
function loadSprite(pokemonId: number, isShiny: boolean = false): string[] {
  // 기존 파일 로드 로직 유지
  const lines = /* 기존 .txt 파일 읽기 */;
  if (isShiny && lines.length > 0) {
    return lines.map(line => shiftAnsiHue(line));
  }
  return lines;
}
```

**호출부 변경**:

```typescript
// 변경 전: spriteEntries.push(loadSprite(p.pokemonId));
// 변경 후:
const isShiny = state.pokemon[p.name]?.shiny ?? false;
spriteEntries.push(loadSprite(p.pokemonId, isShiny));
```

**추가 import**:

```typescript
import { shiftAnsiHue } from './sprites/shiny.js';
```

---

## 테스트 전략

### Phase 1 테스트

| 테스트 파일 | 대상 | 핵심 시나리오 |
|------------|------|-------------|
| `test/encounter.test.ts` (수정) | `rollShiny`, `selectWildPokemon` | rollShiny boolean 반환, selectWildPokemon에 shiny 필드 존재 |
| `test/battle.test.ts` (수정) | `resolveBattle`, `formatBattleMessage` | **기존 positional 호출 10+건을 전부 wild 구조체로 변경 필수**. BattleResult.shiny 일치, shiny=true일 때 "✦" 포함, shiny=undefined 시 crash 없음 |
| `test/pokedex.test.ts` (수정) | `markShinyCaught` | 기존 entry에 shiny_caught=true, 존재하지 않는 종에 entry 생성, 멱등성 |
| `test/stats.test.ts` (수정) | `recordShiny*` | 각 함수 카운터 1 증가, 기존 record와 독립 |
| `test/state.test.ts` (수정) | `readState` shiny 보정 | 카운터 누락 시 0, PokemonState.shiny 누락 시 false |
| `test/pokemon-data.test.ts` (수정) | `getPokemonName` shiny | shiny=true일 때 "★" 접두, false/undefined일 때 기존 동작 |

### Phase 2 테스트

| 테스트 파일 | 대상 | 핵심 시나리오 |
|------------|------|-------------|
| `test/shiny-sprite.test.ts` (신규) | `sprites/shiny.ts` | rgbToHsl/hslToRgb round-trip, shiftAnsiHue 구조 유지, hueShiftPng 360도=원본, 0도=불변 |

### 통합 테스트

기존 `processEncounter` 통합 테스트에 shiny 경로 추가 (Math.random stub으로 shiny=true 강제).

**참고**: `test/encounter.test.ts`의 `formatBattleMessage` 테스트에서 BattleResult literal을 직접 구성하는 곳에도 `shiny: false` (또는 `shiny: true`) 필드 추가 필수 — BattleResult.shiny가 required로 변경되므로 누락 시 컴파일 오류 발생.

---

## 변경 순서

```
Phase 1:
  1. types.ts           ← 모든 타입 정의 (선행 필수)
  2. test/helpers.ts    ← makeState factory 동기화
  3. state.ts           ← DEFAULT_STATE + readState 보정
  4. encounter.ts       ← rollShiny + selectWildPokemon 반환값
  5. battle.ts          ← resolveBattle(wild 구조체) + formatBattleMessage
     (4, 5는 processEncounter 호출 경로에서 동시 변경 필요)
  6. pokedex.ts         ← markShinyCaught
  7. stats.ts           ← recordShiny* 3개
  8. pokemon-data.ts    ← getPokemonName shiny 파라미터
  9. i18n/ko.json       ← shiny 문자열
  10. i18n/en.json      ← shiny 문자열
  11. hooks/stop.ts     ← shiny record 호출 + markShinyCaught
  12. status-line.ts    ← displayName shiny 마크 (Phase 1)
  13. cli/tokenmon.ts   ← status/pokedex shiny 표시

Phase 2:
  14. sprites/shiny.ts  ← 신규: hueShiftPng + shiftAnsiHue
  15. status-line.ts    ← loadSprite shiny 분기
```
