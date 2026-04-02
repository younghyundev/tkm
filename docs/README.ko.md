# Tokémon — 상세 가이드 (한국어)

> tokenmon — 코딩하면서 4세대 포켓몬을 키우세요.

[← 메인 README로 돌아가기](../README.md)

---

## 목차

- [작동 방식](#작동-방식)
- [설치](#설치)
- [명령어](#명령어)
- [설정](#설정)
- [포켓몬 & 지역](#포켓몬--지역)
- [전투 시스템](#전투-시스템)
- [업적 시스템](#업적-시스템)
- [렌더러 옵션](#렌더러-옵션)
- [상태 바](#상태-바)
- [아키텍처](#아키텍처)

## 작동 방식

tokenmon은 Claude Code의 6가지 라이프사이클 이벤트에 연결됩니다:

| 이벤트 | 동작 |
|--------|------|
| **SessionStart** | 세션 초기화, 상태 바에 파티 표시 |
| **Stop** | 토큰 사용량 파싱, XP 지급, 진화 체크 |
| **PermissionRequest** | 권한 승인 추적 (업적용) |
| **PostToolUseFailure** | 에러 추적 (업적용) |
| **SubagentStart** | 서브에이전트에 포켓몬 배치 (디스패치 XP 보너스) |
| **SubagentStop** | 서브에이전트 토큰 데이터 수집 |

토큰 사용량(입력 + 출력, 캐시 제외)이 설정된 비율(기본: 100 토큰 = 1 XP)로 경험치로 변환됩니다. 각 포켓몬은 원작 게임의 경험치 그룹 공식을 그대로 따릅니다.

## 설치

### 마켓플레이스 (권장)

```bash
/plugin marketplace add ThunderConch/tkm
/plugin install tkm@tkm
/reload-plugins
/tkm:setup
```

### 수동 설치

```bash
git clone https://github.com/ThunderConch/tkm.git
cd tkm
npm install
npx tsx install-standalone.ts
```

### 요구사항

- Claude Code v2.1+
- Node.js ≥ 22.0.0

## 명령어

| 명령 | 설명 |
|------|------|
| `/tkm status` | 파티와 통계 보기 |
| `/tkm starter` | 스타터 포켓몬 선택 |
| `/tkm party` | 파티 상세 보기 |
| `/tkm party add <이름>` | 파티에 포켓몬 추가 |
| `/tkm party remove <이름>` | 파티에서 제거 |
| `/tkm party dispatch <이름>` | 디스패치 포켓몬 설정 (서브에이전트에서 1.5x XP) |
| `/tkm unlock list` | 잠금해제된 포켓몬 목록 |
| `/tkm pokedex` | 도감 보기 (`--type`, `--region`, `--rarity` 필터 지원) |
| `/tkm pokedex <이름>` | 포켓몬 상세 정보 |
| `/tkm region` | 현재 지역 보기 |
| `/tkm region list` | 전체 지역 목록 |
| `/tkm region move <지역>` | 지역 이동 |
| `/tkm items` | 아이템 보기 |
| `/tkm achievements` | 업적 진행도 |
| `/tkm config set <키> <값>` | 설정 변경 |
| `/tkm help` | 전체 도움말 |

## 설정

설정 파일: `~/.claude/tokenmon/config.json`

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `tokens_per_xp` | 100 | XP 1당 필요 토큰 수 |
| `volume` | 0.5 | 울음소리 볼륨 (0–1) |
| `sprite_enabled` | true | 터미널 스프라이트 표시 |
| `cry_enabled` | true | 포켓몬 울음소리 재생 |
| `max_party_size` | 6 | 최대 파티 수 |
| `language` | ko | 표시 언어 (`ko` 또는 `en`) |
| `renderer` | braille | 스프라이트 렌더러 (`braille`, `kitty`, `sixel`, `iterm2`) |
| `sprite_mode` | all | 상태 바 스프라이트 모드 (`all`, `ace_only`, `emoji_all`, `emoji_ace`) |
| `info_mode` | ace_full | 상태 바 정보 모드 (`ace_full`, `name_level`, `all_full`, `ace_level`) |

## 포켓몬 & 지역

**107종 포켓몬** — 신오 도감 전체(#387~#493), 18가지 타입, 6가지 경험치 그룹.

### 스타터

| 포켓몬 | 타입 | 진화 |
|--------|------|------|
| 모부기 | 풀 | → 수풀부기 (Lv.18) → 토대부기 (Lv.32) |
| 불꽃숭이 | 불꽃 | → 파이숭이 (Lv.14) → 초염몽 (Lv.36) |
| 팽도리 | 물 | → 팽태자 (Lv.16) → 엠페르트 (Lv.36) |

### 지역

9개 탐험 지역. 각 지역마다 레벨 범위와 고유 포켓몬 풀이 있습니다. 도감 포획 수에 따라 새로운 지역이 잠금해제됩니다. 등장 확률은 희귀도에 따라 다릅니다: 일반, 비일반, 희귀, 전설.

## 전투 시스템

코딩 세션 중 야생 포켓몬을 만날 수 있습니다. 전투는 타입 상성 기반이며, 원작 게임의 스탯(HP, 공격, 방어, 스피드)을 사용합니다. 승리하면 보너스 XP를 획득하고, 몬스터볼을 던져 포획을 시도할 수 있습니다. 포획률은 4세대 원작 공식을 따릅니다.

## 업적 시스템

21개 업적으로 총 XP, 포획 수, 진화, 특수 조건 등의 마일스톤을 추적합니다. 업적 달성 시 희귀 포켓몬 잠금해제, 몬스터볼, XP 보너스, 파티 슬롯 추가 등의 보상을 받습니다.

## 렌더러 옵션

| 렌더러 | 품질 | 호환성 |
|--------|------|--------|
| **Braille** | ⬛⬛⬜⬜⬜ | 모든 터미널 |
| **Kitty** | ⬛⬛⬛⬛⬛ | Kitty 터미널 |
| **Sixel** | ⬛⬛⬛⬛⬜ | Sixel 지원 터미널 |
| **iTerm2** | ⬛⬛⬛⬛⬜ | iTerm2 및 호환 터미널 |

`/tkm:setup`에서 선택하거나 나중에 변경: `/tkm config set renderer kitty`

## 상태 바

Claude Code의 상태 바에 파티 포켓몬을 스프라이트, 이름, 레벨, 경험치 바와 함께 표시합니다. `sprite_mode`와 `info_mode` 설정으로 표시 방식을 변경할 수 있습니다.

다른 플러그인의 상태 바와 자동 생성된 래퍼 스크립트를 통해 공존합니다.

## 아키텍처

```
hooks/          → Claude Code 라이프사이클 이벤트 핸들러
src/core/       → 게임 로직 (XP, 전투, 진화, 인카운터, 업적)
src/cli/        → CLI 명령어 (tokenmon.ts)
src/status-line → 상태 바 렌더러
src/i18n/       → 다국어 지원 (ko, en)
src/audio/      → 울음소리 및 효과음 재생
data/           → 포켓몬 DB, 지역, 업적, i18n 데이터
sprites/        → 터미널 아트 (braille) + PNG 스프라이트 (kitty/sixel/iterm2)
cries/          → 포켓몬 울음소리 (.ogg)
sfx/            → 효과음 (.wav)
skills/         → Claude Code 플러그인 스킬
```
