# Shiny Pokemon (이로치) Feature - High-level Design (Rev.2)

## 1. Overview

### 기능 요약
야생 포켓몬 조우 시 1/512 확률로 이로치(shiny) 개체가 출현하는 시스템. 이로치 포켓몬은 텍스트/스프라이트 양쪽에서 시각적으로 구분되며, 도감에서 별도 추적된다.

### 범위

| Phase | 내용 | 마이그레이션 |
|-------|------|-------------|
| **Phase 1 (MVP)** | 확률 판정, 상태 플래그, 텍스트 이펙트 (★ 마크, "✦ 이로치 발견!"), i18n, 도감 추적 | 불필요 (DEFAULT_STATE 병합 패턴) |
| **Phase 2 (스프라이트)** | braille ANSI 코드 치환 + hueShiftPng 공통 함수 준비 (kitty/iTerm2/sixel은 함수만 준비, status-line 미통합) | 없음 |
| **Phase 3 대비** | 카운터 선행 배치만. 업적/고유 색상/효과음은 나중에 추가 | 없음 |

---

## 2. Data Model Changes

### 2.1 PokemonState 확장

현재 PokemonState는 개체 단위 상태(xp, level, friendship, ev)를 관리한다. 여기에 shiny boolean을 추가한다.

- **추가 개념**: 개체가 이로치인지 여부를 나타내는 플래그
- **기본값**: false (기존 데이터는 DEFAULT_STATE 병합 패턴으로 자동 보정)
- **불변 속성**: 한번 판정되면 변경 불가 (조우 시점에 확정)

### 2.2 PokedexEntry 확장

현재 PokedexEntry는 종(species) 단위로 seen/caught를 추적한다. 이로치 포획 여부를 별도 필드로 추가한다.

- **추가 개념**: 해당 종의 이로치를 포획한 적 있는지 여부
- **기본값**: false
- **의미**: "이 종의 이로치를 한번이라도 잡았는가" (종 단위 도감 완성도)

### 2.3 State (최상위) 확장 - Phase 3 선행 카운터

Phase 3 업적 시스템을 위해 3개 카운터를 선행 배치한다.

- **shiny_encounter_count**: 이로치 조우 횟수 (배틀 결과 무관)
- **shiny_catch_count**: 이로치 포획 성공 횟수
- **shiny_escaped_count**: 이로치를 만났으나 포획 실패 횟수

이 카운터들은 Phase 1에서 증감 로직이 함께 구현되지만, Phase 3 전까지 소비하는 곳은 없다. DEFAULT_STATE에 0으로 선언하면 마이그레이션 없이 동작한다.

### 2.4 파이프라인 전파 구조체 확장

파이프라인 전체에 shiny 정보를 전파하기 위해 두 지점에 shiny boolean을 추가한다.

- **selectWildPokemon 반환값**: 현재 inline `{ name, level }` 형태에 shiny를 추가하여 `{ name, level, shiny }`가 된다. (참고: types.ts에 EncounterResult interface가 정의되어 있으나 현재 미사용 상태이며, 이번 변경과 무관하다.)
- **BattleResult**: resolveBattle 반환값에 shiny를 추가한다. formatBattleMessage에서 이로치 텍스트 이펙트 생성에 사용한다.

### 2.5 마이그레이션 전략

**마이그레이션 불필요**. 기존 패턴 (`{ ...DEFAULT_STATE, ...parsed }`)이 누락 필드를 기본값으로 채운다. PokemonState 개체별 shiny 필드도 읽기 시점에 `?? false` 보정한다 (기존 friendship/ev 마이그레이션과 동일 패턴).

**BattleResult 하위 호환**: state.last_battle에 저장된 구버전 BattleResult에는 shiny 필드가 없다. formatBattleMessage 등에서 result.shiny를 참조할 때 `?? false`로 보정해야 한다. 이는 status-line.ts가 last_battle을 읽어 formatBattleMessage를 호출하는 경로에서 발생한다.

---

## 3. Core Flow

### 3.1 전체 흐름 다이어그램

```
 hooks/stop.ts
     |
     v
 encounter.ts: selectWildPokemon()
     |
     +--- 종/레벨 결정 (기존 로직)
     |
     +--- ★ NEW: rollShiny()  <-- 1/512 독립 확률 판정
     |
     v
 반환: { name, level, shiny }
     |
     v
 encounter.ts: processEncounter()
     |
     +--- encounter_count++ (기존)
     |
     +--- ★ NEW: wild 구조체를 그대로 resolveBattle에 전달
     |
     v
 battle.ts: resolveBattle(state, config, wild)   <-- wild = { name, level, shiny }
     |
     +--- markSeen() (기존)
     |
     +--- 배틀 로직 (기존, shiny는 전투력에 영향 없음)
     |
     +--- 포획 성공 시:
     |      +--- markCaught() (기존)
     |      +--- ★ NEW: PokemonState에 shiny=true 기록
     |
     v
 반환: BattleResult { ...기존, shiny }
     |
     v
 hooks/stop.ts (기존 stats 기록 패턴에 shiny 분기 추가)
     |
     +--- recordEncounter() (기존)
     +--- recordBattle() (기존)
     +--- ★ NEW: shiny이면 recordShinyEncounter()
     +--- 포획 성공 시:
     |      +--- recordCatch() (기존)
     |      +--- ★ NEW: shiny이면 recordShinyCatch()
     |      +--- ★ NEW: shiny이면 markShinyCaught()
     +--- 패배/도주 시:
     |      +--- ★ NEW: shiny이면 recordShinyEscaped()
     |
     v
 battle.ts: formatBattleMessage(result)
     |
     +--- ★ NEW: shiny이면 이름에 ★ 접두, "✦ 이로치 발견!" 추가
     |        (result.shiny ?? false로 구버전 BattleResult 보정)
     |
     v
 hooks/stop.ts: messages에 합류 -> system_message 출력
```

### 3.2 판정 시점과 이유

**조우(encounter) 시점**에 판정한다.

- 선택지 A: 조우 시 판정 (채택)
- 선택지 B: 배틀 승리 후 판정
- 선택지 C: 포획 확정 후 판정

**A를 선택한 이유**: 원작 게임과 동일한 시맨틱. "이로치가 나타났다!" 메시지를 배틀 전에 보여줄 수 있다. 패배/도주 시에도 "이로치를 놓쳤다" 경험이 가능하여 게임플레이 긴장감을 높인다.

### 3.3 selectWildPokemon 변경

현재 반환값 `{ name, level }`에 shiny를 추가하여 `{ name, level, shiny }`가 된다. 이로치 판정은 종/레벨 결정과 완전히 독립적이다 (1/512 단순 확률). 이 함수는 encounter.ts의 processEncounter 내부에서만 호출되므로 변경 영향 범위가 제한적이다.

### 3.4 resolveBattle 호출 패턴 변경

현재 resolveBattle은 positional 파라미터 4개 (state, config, wildName, wildLevel)를 받는다. processEncounter에서는 selectWildPokemon 결과의 name, level을 분해하여 전달한다.

shiny를 5번째 positional boolean으로 추가하는 대신, **selectWildPokemon이 반환하는 구조체 자체를 wild 파라미터 하나로 전달하는 패턴을 채택한다**. 이유:

- processEncounter가 이미 구조체를 받고 있어 자연스러운 전달 경로
- 향후 wild에 추가 속성이 필요할 때 positional 확장 없이 대응 가능
- wildName/wildLevel 분해가 불필요해져 호출부가 단순해짐

### 3.5 shiny 카운터 증감 책임

**기존 패턴을 따른다.** 현재 stats.ts에 recordEncounter, recordBattle, recordCatch가 정의되어 있고, 이들은 모두 hooks/stop.ts에서 battleResult를 기반으로 호출된다. resolveBattle 내부에서는 직접 카운터 증감만 수행하고, weekly/total 통계는 stats.ts의 record 함수가 담당한다.

shiny 카운터도 동일 패턴으로 구현한다:

- **stats.ts**: recordShinyEncounter, recordShinyCatch, recordShinyEscaped 함수 추가
- **hooks/stop.ts**: battleResult.shiny 확인 후 해당 함수 호출
- **resolveBattle 내부**: shiny 카운터 증감을 수행하지 않음 (기존 패턴과 일관성 유지)

---

## 4. Sprite Hue-shift Architecture (Phase 2)

### 4.1 status-line의 현재 스프라이트 사용 현황

status-line.ts의 loadSprite는 braille (.txt)과 terminal (.txt) 파일만 로드한다. kitty/iTerm2/sixel 렌더러에 대한 호출 경로(generateKitty, generateIterm2, generateSixel)는 status-line.ts에 존재하지 않으며, 현재 미통합 상태이다.

```
sprites/braille/{id}.txt  -- loadSprite가 우선 탐색
sprites/terminal/{id}.txt -- braille 없을 때 fallback
```

### 4.2 Phase 2 범위: braille/terminal만 대상

Phase 2에서 status-line에 실제 통합하는 범위는 **braille와 terminal 텍스트 스프라이트**로 한정한다.

```
                        ┌───────────────────────────┐
sprites/raw/{id}.png ──>│  hueShiftPng(buffer, D)   │──> shifted PNG buffer
                        │  (범용 유틸리티, 준비만)    │
                        └───────────────────────────┘
                                    |
                        Phase 2에서는 직접 소비처 없음
                        (kitty/iTerm2/sixel이 status-line 통합될 때 자동 적용)


sprites/braille/{id}.txt ──> 런타임 로드 ──> ANSI escape 코드 파싱
                                                    |
                                                    v
                                         색상 코드 치환 (HSL hue 회전)
                                                    |
                                                    v
                                         ★ shiny 스프라이트 출력

sprites/terminal/{id}.txt ──> 런타임 로드 ──> ANSI escape 코드 파싱
                                                    |
                                                    v
                                         색상 코드 치환 (HSL hue 회전)
                                                    |
                                                    v
                                         ★ shiny 스프라이트 출력
```

### 4.3 hueShiftPng 범용 함수 (준비만)

PNG pixel 레벨에서 hue-shift를 수행하는 공통 유틸리티를 준비한다. 이 함수는 RGBA pixel 배열의 각 픽셀에 대해 RGB-to-HSL 변환 후 H 값을 회전시키고 다시 RGB로 변환하여 새 PNG buffer를 생성한다.

Phase 2 시점에서 이 함수의 직접 소비처는 없다. 향후 kitty/iTerm2/sixel이 status-line에 통합될 때 자동으로 적용되는 확장 포인트로 기능한다.

**hue-shift 각도**: 포켓몬별 고유 값이 아닌, 전역 고정값을 Phase 2 기본값으로 사용. Phase 3에서 종별 고유 색상 매핑으로 확장 가능.

### 4.4 Braille/Terminal ANSI 코드 치환

braille와 terminal 스프라이트는 빌드 타임에 사전 생성된 `.txt` 파일로, ANSI 256 escape 코드가 포함된 텍스트다. 두 포맷 모두 동일한 ANSI 코드 치환 로직을 공유한다.

```
.txt 파일 런타임 로드
     |
     v
ANSI escape 코드 파싱 --> 색상 코드 치환 --> 출력
                              |
                 ┌────────────┘
                 v
       \x1b[38;5;{N}m  -->  ANSI 256 코드 N을
                              HSL 변환 -> H 회전 -> RGB -> 새 ANSI 256 코드로 치환
```

### 4.5 Status-line 통합

status-line.ts의 loadSprite 함수가 스프라이트를 로드하는 시점에서, 해당 포켓몬이 shiny인지 확인 후 ANSI 코드 치환을 적용한다.

```
loadSprite(pokemonId, isShiny)
     |
     +-- isShiny=false --> 기존 경로 (변경 없음)
     |
     +-- isShiny=true  --> .txt 로드 --> ANSI 코드 치환 --> 반환
```

---

## 5. Module Impact Map

### Phase 1 (MVP)

| 모듈 | 변경 성격 | 상세 |
|------|----------|------|
| **types.ts** | 수정 | PokemonState, PokedexEntry, State, BattleResult에 shiny 관련 필드 추가 (EncounterResult는 미사용이므로 변경 불필요) |
| **encounter.ts** | 수정 | selectWildPokemon 반환값에 shiny 추가, rollShiny 판정 함수 추가 |
| **battle.ts** | 수정 | resolveBattle가 wild 구조체를 받도록 변경, formatBattleMessage에 이로치 텍스트 이펙트 + 구버전 BattleResult 보정 |
| **pokedex.ts** | 수정 | markShinyCaught 함수 추가, getCompletion에 shiny 통계 선택적 추가 |
| **state.ts** | 수정 | DEFAULT_STATE에 shiny 카운터 3개 추가, PokemonState 읽기 시 shiny 기본값 보정 |
| **pokemon-data.ts** | 수정 | getPokemonName에 optional shiny 파라미터 추가 (★ 접두 처리) |
| **stats.ts** | 수정 | recordShinyEncounter, recordShinyCatch, recordShinyEscaped 함수 추가 |
| **hooks/stop.ts** | 수정 | battleResult.shiny 기반으로 shiny record 함수 호출 + markShinyCaught 호출 |
| **status-line.ts** | 수정 | 파티 내 shiny 포켓몬 이름에 ★ 마크 표시, last_battle 읽기 시 shiny 보정 |
| **cli/tokenmon.ts** | 수정 | 도감/상태 표시에서 shiny 포켓몬 구분 표시 |
| **i18n/ko.json** | 수정 | 이로치 관련 i18n 문자열 추가 |
| **i18n/en.json** | 수정 | shiny 관련 i18n 문자열 추가 |

### Phase 2 (스프라이트)

| 모듈 | 변경 성격 | 상세 |
|------|----------|------|
| **sprites/shiny.ts** (신규) | 추가 | hueShiftPng 범용 유틸리티 (준비만) + braille/terminal ANSI 코드 치환 함수 |
| **status-line.ts** | 수정 | loadSprite에 shiny 분기 추가 (braille/terminal 대상) |

### 의존 관계 영향

```
                         types.ts (Phase 1)
                            ^
          ┌─────────────────┼──────────────────┐
          |                 |                  |
     encounter.ts      battle.ts          state.ts
       (Phase 1)       (Phase 1)          (Phase 1)
          |                 |
          +-- pokemon-data.ts (Phase 1: getPokemonName)
          |
     pokedex.ts (Phase 1)
          |
     stats.ts (Phase 1)
          |
     hooks/stop.ts (Phase 1: shiny record 함수 호출 + markShinyCaught)

     sprites/shiny.ts (Phase 2, 신규)
          ^
          |
     status-line.ts (Phase 2: loadSprite shiny 분기)
```

---

## 6. i18n

### 추가 필요한 문자열 카테고리

**배틀 메시지 (battle.*)**
- 이로치 발견 알림: "✦ 이로치 {pokemon} 발견!" / "✦ A shiny {pokemon} appeared!"
- 이로치 포획 성공: "★ 이로치 {pokemon} 포획!" / "★ Shiny {pokemon} caught!"
- 이로치 도주/패배: "이로치 {pokemon}이(가) 도망쳤다..." / "The shiny {pokemon} got away..."

**도감/CLI (cli.*)**
- 도감 shiny 상태 표시: "★이로치" / "★Shiny"
- 도감 통계: "이로치 포획: {count}종" / "Shiny caught: {count}"

**이름 접두사 패턴**
- getPokemonName의 shiny 파라미터가 true일 때 "★" 접두사를 반환값에 추가. 이 접두사는 i18n 문자열이 아닌 하드코딩 유니코드 문자로 처리 (모든 언어에서 동일).

### 한국어 조사 처리

기존 i18n 시스템이 `{pokemon:을/를}` 패턴의 한국어 조사 처리를 지원한다. ★ 접두사가 붙어도 마지막 글자 기준 조사 판정이므로 동작에 문제가 없다.

---

## 7. Phase 3 Readiness

### 7.1 선행 배치 데이터

| 데이터 | 위치 | 용도 (Phase 3) |
|--------|------|----------------|
| shiny_encounter_count | State | 업적 트리거 ("이로치 10회 조우") |
| shiny_catch_count | State | 업적 트리거 ("이로치 5종 포획") |
| shiny_escaped_count | State | 업적 트리거 ("이로치를 3번 놓치다") |
| shiny_caught (per species) | PokedexEntry | 도감 완성도 세분화 ("이로치 도감 완성") |

### 7.2 확장 포인트

**업적 시스템**: 새 trigger_type (`shiny_catch_count` 등)을 achievements.json에 추가하면 확장 가능. checkAchievements의 switch문에 case 추가 필요.

**종별 고유 색상**: hueShiftPng(buffer, delta)의 delta를 외부 JSON 테이블에서 주입하면 함수 수정 없이 확장.

**효과음**: playSfx('shiny') 패턴으로 호출 한 줄 추가면 완성.

---

## 8. Risks

| ID | 위험 | 영향도 | 완화 |
|----|------|--------|------|
| R1 | getPokemonName 호출 site 산재 — shiny 파라미터 누락 시 ★ 마크 미표시 | 중 | Phase 1에서 battleMessage/status-line만 대상, 점진 확대 |
| R2 | braille/terminal ANSI 256 양자화로 hue-shift 색상 구분 어려움 | 저 | hue-shift 각도를 60도 이상으로 설정 |
| R3 | 1/512 x 15% = 세션당 ~0.03%, 장기 플레이어도 못 볼 수 있음 | 저 | 확률을 상수로 분리, 이벤트 시스템에서 부스트 확장 가능 |
| R4 | State JSON 크기 증가 (boolean 필드 추가) | 매우 낮 | 500종 기준 ~10KB, 무시 가능 |
| R5 | hueShiftPng 함수 준비 후 소비처 부재로 dead code 상태 | 저 | kitty/iTerm2/sixel status-line 통합 시 자동 소비. 테스트로 함수 정합성 보장 |
| R6 | 구버전 BattleResult (last_battle)에 shiny 필드 부재 | 중 | formatBattleMessage에서 ?? false 보정. Phase 1 필수 구현 사항 |
| R7 | 이로치 발견 시 시각 이펙트만 있고 효과음이 없는 UX gap | 저 | Phase 3에서 playSfx('shiny') 추가 예정. Phase 1은 ★ 마크와 텍스트 메시지로 충분한 피드백 제공 |

---

## Architecture Decision Summary

| 결정 | 선택 | 핵심 이유 |
|------|------|----------|
| 판정 시점 | 조우 시 | 원작 시맨틱, "놓침" 경험 가능 |
| shiny 전파 | selectWildPokemon inline 반환값 + BattleResult | 파이프라인 전체에 자연스러운 전파. EncounterResult (미사용)와 무관 |
| resolveBattle 호출 | wild 구조체로 전달 | positional 확장 대신 구조체 전달. processEncounter 흐름과 자연스러운 연결 |
| shiny 카운터 증감 책임 | stats.ts record 함수 + hooks/stop.ts 호출 | 기존 recordEncounter/recordBattle/recordCatch 패턴과 일관 |
| hue-shift 레벨 | PNG pixel 공통 처리 (함수 준비만) | 향후 렌더러 통합 시 자동 적용 |
| Phase 2 범위 | braille/terminal만 status-line 통합 | kitty/iTerm2/sixel은 status-line 미사용 상태 |
| braille/terminal 처리 | 런타임 ANSI 코드 치환 | 파일 2배 증가 방지 |
| 마이그레이션 | 불필요 | DEFAULT_STATE 병합 패턴 활용 + BattleResult 읽기 보정 |
| Phase 3 준비 | 카운터만 선행 배치 | 최소 비용으로 확장 경로 확보 |

## Implementation Order

```
Phase 1 (MVP) - 권장 순서:
  1. types.ts         -- BattleResult에 shiny 추가, PokemonState에 shiny 추가,
                         PokedexEntry에 shiny_caught 추가, State에 카운터 3개 추가
  2. state.ts         -- DEFAULT_STATE에 카운터 추가 + PokemonState 읽기 시 shiny 보정
  3. encounter.ts     -- rollShiny + selectWildPokemon 반환값 확장
  4. battle.ts        -- resolveBattle가 wild 구조체 수용 + BattleResult에 shiny 포함
                         + formatBattleMessage 이로치 이펙트 + 구버전 BattleResult 보정
  5. pokedex.ts       -- markShinyCaught
  6. stats.ts         -- recordShinyEncounter, recordShinyCatch, recordShinyEscaped
  7. pokemon-data.ts  -- getPokemonName shiny 파라미터
  8. i18n/*.json      -- 이로치 관련 문자열
  9. hooks/stop.ts    -- shiny 기반 record 함수 호출 + markShinyCaught 호출
 10. status-line.ts   -- ★ 마크 표시 + last_battle shiny 보정
 11. cli/tokenmon.ts  -- 도감/상태에 shiny 정보 표시

Phase 2 (스프라이트):
  1. sprites/shiny.ts (신규) -- hueShiftPng 범용 함수 + braille/terminal ANSI 치환 함수
  2. status-line.ts          -- loadSprite에 shiny 분기 (braille/terminal 대상)
```
