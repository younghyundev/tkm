# Tokenmon — Technical PRD

> 아키텍처, 훅 시스템, Claude Code 통합 기술 명세

관련 문서: [@PRD-concept.md](PRD-concept.md) | [@spec-battle.md](spec-battle.md) | [@spec-progression.md](spec-progression.md) | [@spec-data.md](spec-data.md)

## 1. System Architecture

```
Claude Code Runtime
  │
  ├── Hook Events ──────────────────────┐
  │   ├── sessionStart                  │
  │   ├── stop (session end)            │
  │   ├── permissionRequest             │
  │   ├── subagentStart                 │
  │   └── subagentStop                  │
  │                                     ▼
  │                          ┌──────────────────────┐
  │                          │   src/hooks/*.ts      │
  │                          │   (Event Handlers)    │
  │                          └──────┬───────────────┘
  │                                 │
  │                          ┌──────▼───────────────┐
  │                          │   src/core/*.ts       │
  │                          │   (Game Logic)        │
  │                          └──────┬───────────────┘
  │                                 │
  │                          ┌──────▼───────────────┐
  │                          │   data/*.json         │
  │                          │   (Static Data)       │
  │                          └──────┬───────────────┘
  │                                 │
  │                          ┌──────▼───────────────┐
  │                          │   ~/.claude/tokenmon/ │
  │                          │   (User State)        │
  │                          └──────────────────────┘
  │
  ├── StatusLine ───── src/status-line.ts ───── 실시간 상태 표시
  │
  ├── Skills ───── skills/*/SKILL.md ───── CLI 인터페이스
  │   ├── /tkm <subcommand>
  │   ├── /tkm setup
  │   ├── /tkm doctor
  │   ├── /tkm reset
  │   └── /tkm uninstall
  │
  └── CLI ───── src/cli/tokenmon.ts ───── 명령어 디스패처
```

## 2. Module Dependency Graph

```
types.ts ◄──── 모든 모듈이 참조
    │
paths.ts ◄──── state.ts, config.ts, pokemon-data.ts
    │
pokemon-data.ts ◄──── battle.ts, encounter.ts, evolution.ts, achievements.ts
    │
    ├── state.ts ◄──── hooks/*.ts (읽기/쓰기)
    ├── config.ts ◄──── hooks/*.ts, cli/tokenmon.ts
    │
    ├── xp.ts ◄──── battle.ts, hooks/stop.ts
    ├── type-chart.ts ◄──── battle.ts
    │
    ├── battle.ts ◄──── hooks/stop.ts
    ├── encounter.ts ◄──── hooks/stop.ts
    ├── evolution.ts ◄──── hooks/stop.ts
    ├── achievements.ts ◄──── hooks/stop.ts, hooks/session-start.ts
    ├── pokedex.ts ◄──── battle.ts, cli/tokenmon.ts
    ├── regions.ts ◄──── cli/tokenmon.ts, encounter.ts
    ├── items.ts ◄──── battle.ts
    └── guide.ts ◄──── cli/tokenmon.ts
```

## 3. Hook System

### 3.1 Hook Protocol

모든 훅은 동일한 입출력 프로토콜을 따른다:

```typescript
// Input: Claude Code가 stdin으로 JSON 전달
interface HookInput {
  session_id?: string;
  tool_name?: string;
  // ... hook-specific fields
}

// Output: stdout으로 JSON 반환
interface HookOutput {
  continue: boolean;        // 항상 true (훅이 실행을 차단하지 않음)
  system_message?: string;  // Claude에게 전달할 메시지 (진화, 전투 결과 등)
}
```

### 3.2 Hook Details

#### `session-start.ts`
- **트리거**: 새 Claude Code 세션 시작
- **동작**: session_count 증가, 업적 체크 (first_session, ten_sessions 등)
- **출력**: 달성 업적이 있으면 system_message에 포함

#### `stop.ts` (핵심 훅)
- **트리거**: Claude Code 세션 종료
- **동작** (순서대로):
  1. JSONL 파일에서 토큰 소비량 파싱
  2. 토큰 → XP 변환 (config.tokens_per_xp 비율)
  3. 파티 전원에게 동일 XP 분배
  4. 각 포켓몬 레벨업 체크 → 진화 체크
  5. 야생 포켓몬 조우 롤 (15%)
  6. 조우 시 전투 → 승리 시 포획 + EV
  7. 업적 체크
  8. 울음소리 재생 + 효과음
- **동시성**: 파일 락 기반 (exclusive `wx` 플래그, 5초 타임아웃, 10ms 폴링)

#### `permission.ts`
- **트리거**: 사용자가 권한 요청 승인
- **동작**: permission_count 증가, permission_master 업적 체크

#### `subagent-start.ts`
- **트리거**: 서브에이전트 생성
- **동작**: 미할당 포켓몬을 에이전트에 파견 (1.5x XP 멀티플라이어)
- **선택 순서**: `default_dispatch` 설정 우선 → 미할당 포켓몬 순차 선택

#### `subagent-stop.ts`
- **트리거**: 서브에이전트 종료
- **동작**: 에이전트-포켓몬 할당 해제

### 3.3 Concurrency Control

```
Lock acquire: fs.openSync(lockPath, 'wx')
    ↓
Read state → Mutate → Write state
    ↓
Lock release: fs.unlinkSync(lockPath)
```

- 락 파일: `~/.claude/tokenmon/state.lock`
- 최대 대기: 5초 (500회 × 10ms 폴링)
- Stale 락 감지: 30초 초과 시 강제 해제

## 4. Data Flow

### 4.1 Token → XP Pipeline

```
JSONL 파일 (Claude Code 생성)
    │
    ▼ parseJsonl()
토큰 카운트 (input_tokens + output_tokens)
    │
    ▼ delta = total - last_session_tokens[session_id]
세션 델타 토큰
    │
    ▼ xp = floor(delta / tokens_per_xp)
XP 포인트
    │
    ▼ xp * xp_bonus_multiplier * (dispatch ? 1.5 : 1.0)
최종 XP (파티 전원 동일 수령)
    │
    ▼ xpToLevel(pokemon.xp + finalXp, expGroup)
레벨 계산 (binary search)
```

### 4.2 Battle Flow

```
야생 포켓몬 선택 (지역 풀 + 레어도 가중치)
    │
    ▼ selectBattlePokemon()
파티 최적 전투원 선택 (타입 상성 기반)
    │
    ▼ calculatePartyMultiplier()
파티 멀티플라이어 계산 (기하급수 가중치)
    │
    ▼ calculateWinRate()
승률 계산 (타입 × 레벨 × 스탯 × EV)
    │
    ▼ Math.random() < finalWinRate
승패 판정
    │
    ├── 승리: 몬스터볼 보유 시 포획 + EV +1 (전원) + XP + 아이템 드롭 (20%)
    └── 패배: 아이템 드롭 (5%)
```

## 5. File System Layout

### 5.1 Package Structure (소스 레포)
```
/
├── package.json          # tkm@0.0.2-rc.3, ESM, Node ≥ 22
├── tsconfig.json         # strict, ES2022, NodeNext
├── data/
│   ├── pokemon.json      # 107종 Gen 4 포켓몬 DB
│   ├── achievements.json # 25+ 업적 정의
│   ├── regions.json      # 9개 신오 지역
│   └── tips.json         # 동적 팁 템플릿
├── src/
│   ├── core/             # 게임 로직 (15 모듈)
│   ├── cli/              # CLI 디스패처 (660줄)
│   ├── hooks/            # 6개 훅 핸들러
│   ├── audio/            # 울음소리 + 효과음
│   ├── sprites/          # PNG → ANSI 변환
│   └── setup/            # 설치 + StatusLine
├── skills/               # 5개 Claude Code 스킬
├── test/                 # 309 테스트
└── assets/               # 울음소리 wav, 스프라이트 png
```

### 5.2 User Data (설치 후)
```
~/.claude/tokenmon/
├── state.json            # 게임 상태 (see @spec-data.md)
├── session.json          # 현재 세션 상태
├── config.json           # 사용자 설정
├── state.lock            # 동시성 락 파일
└── status-wrapper.mjs    # StatusLine 래퍼 (coexistence)
```

## 6. StatusLine Integration

StatusLine은 Claude Code 하단에 실시간 상태를 표시한다.

### 6.1 설치 전략
```
기존 StatusLine 없음?
    → 직접 등록: settings.json에 tokenmon 스크립트 경로

기존 StatusLine 있음?
    → 래퍼 스크립트 생성 (status-wrapper.mjs)
    → 기존 + tokenmon 출력을 병합
```

### 6.2 표시 내용
```
[스프라이트] 모부기 Lv.18 ████░░░░ 72% [풀][땅] 쌍둥이잎 마을 🔄×3
```
- 스프라이트: Braille art 또는 Terminal ASCII art (설정 가능)
- 레벨 + XP 바 (진행률)
- 타입 이모지
- 현재 지역
- 리트라이 토큰 수
- 서브에이전트 파견 상태
- 최근 전투/팁 결과 (1턴 표시 후 소멸)

### 6.3 표시 모드
| sprite_mode | 설명 |
|------------|------|
| `all` | 파티 전원 스프라이트 (기본) |
| `ace_only` | 첫 번째 포켓몬만 |
| `emoji_all` | 이모지로 전원 |
| `emoji_ace` | 이모지로 첫 번째만 |

| info_mode | 설명 |
|-----------|------|
| `ace_full` | 에이스 상세정보 (기본) |
| `name_level` | 이름 + 레벨만 |
| `all_full` | 전원 상세 |
| `ace_level` | 에이스 레벨만 |

## 7. Skill System

Claude Code 스킬로 CLI 인터페이스를 제공한다.

### 7.1 스킬 구조
```
skills/
├── tkm/SKILL.md          # 메인 CLI (tokenmon.ts 호출)
├── setup/SKILL.md        # 초기 설정 워크플로우
├── doctor/SKILL.md       # 9단계 진단
├── reset/SKILL.md        # 데이터 초기화
└── uninstall/SKILL.md    # 플러그인 제거
```

### 7.2 Doctor 진단 항목
1. 플러그인 캐시 확인
2. npm 의존성 확인
3. StatusLine 등록 확인
4. CLI 실행 가능 확인
5. 데이터 파일 무결성
6. 에셋 파일 존재 확인
7. 스타터 선택 상태
8. 비주얼 QA (스프라이트 렌더링)
9. 전체 기능 통합 테스트

## 8. Error Handling & Recovery

### 8.1 Lock Recovery
- Stale 락 (30초+) → 자동 해제
- 락 획득 실패 → 5초 후 타임아웃, 훅 skip (게임 이벤트 손실 최소화)

### 8.2 State Recovery
- JSON 파싱 실패 → DEFAULT_STATE로 초기화
- 필드 누락 → 마이그레이션 (friendship, ev 등 default 0)
- 치트 로그는 reset에서도 보존

### 8.3 Audio Fallback
- WSL2: PowerShell → 실패 시 무음
- macOS: afplay
- Linux: paplay → ffplay → mpv → cvlc (순차 시도)
- 모든 오디오 실패 시 게임 로직에 영향 없음

## 9. Build & Test

```bash
npm run build    # tsc (TypeScript → dist/)
npm test         # node --import tsx --test test/*.test.ts
                 # 309 tests, 61 suites
```

### 9.1 Test Coverage
| 영역 | 파일 | 테스트 수 |
|------|------|----------|
| 전투 | battle.test.ts | ~30 (타입, 승률, XP, 파티, EV) |
| 진화 | evolution.test.ts | ~10 (레벨, 우정, 적용, EV 유지) |
| 조우 | encounter.test.ts | ~15 (확률, 선택, 지역) |
| 업적 | achievements.test.ts | ~15 (트리거, 보상, 중복) |
| 상태 | state.test.ts | ~10 (읽기/쓰기, 라운드트립) |
| XP | xp.test.ts | ~10 (6개 경험치 그룹, 변환) |

## 10. Deployment

```bash
# 개발
npm install
npm run build
npm test

# 사용자 설치
npm install -g tkm        # 또는 Claude Code 플러그인으로 설치
/tkm setup                # 초기 설정
```

### 10.1 Claude Code Plugin Registration
```json
// plugin.json
{
  "name": "tkm",
  "skills": "./skills/"
}
```

훅은 `.claude-plugin/` 디렉토리의 hook 설정으로 자동 등록된다.
