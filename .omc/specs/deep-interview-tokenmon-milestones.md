# Deep Interview Spec: Tokenmon Milestones (M0/M1/M2)

## Metadata
- Interview ID: tokenmon-milestones-20260330
- Rounds: 9
- Final Ambiguity Score: 12%
- Type: brownfield
- Generated: 2026-03-30
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 35% | 0.333 |
| Constraint Clarity | 0.80 | 25% | 0.200 |
| Success Criteria | 0.85 | 25% | 0.213 |
| Context Clarity | 0.90 | 15% | 0.135 |
| **Total Clarity** | | | **0.880** |
| **Ambiguity** | | | **12%** |

---

## Goal

Tokenmon 프로젝트를 3단계 마일스톤으로 나누어 순차 실행한다:
- **M0**: 현재 PoC의 치명적 버그 수정 + 경험치 시스템 원작 반영
- **M1**: bash/jq/Python → Node.js/TypeScript 전체 재작성 + Claude Code 플러그인 구조 전환
- **M2**: 마켓플레이스 배포 및 공식 제출

---

## M0: 버그수정 / 안정화

### Goal
현재 PoC에서 발견된 XP 버그와 /tokenmon CLI 미동작을 수정하고, 포켓몬 원작 경험치 그룹 시스템을 적용한다.

### Tickets

#### T-001: 토큰 파싱 버그 수정 (Delta Tracking)
**문제**: `hook-stop.sh`가 매 Stop 이벤트마다 세션 JSONL 파일의 전체 누적 토큰을 읽어 기존 XP에 더함. 델타가 아닌 전체를 매번 추가하는 구조.
**근본 원인**: `scripts/hook-stop.sh` (lines 60-93)에서 JSONL 전체를 파싱하여 합산 후, 그 값을 기존 XP에 additive로 반영.
**수정 방향**:
- state.json에 `last_token_offset` (또는 `last_processed_tokens`) 필드 추가
- Stop 훅에서: `delta = current_total - last_processed_tokens`
- XP는 delta 기반으로만 부여
- `last_processed_tokens`를 업데이트하여 다음 Stop 시 정확한 델타 계산

**Acceptance Criteria**:
- [ ] 동일 세션에서 Stop 훅이 2회 이상 호출되어도 XP가 중복 부여되지 않음
- [ ] state.json에 last_processed_tokens 필드가 세션별로 저장됨
- [ ] 새 세션 시작 시 이전 세션의 offset이 간섭하지 않음

#### T-002: 토큰 종류 필터링 (cache 제외)
**문제**: `cache_creation_input_tokens` + `cache_read_input_tokens`까지 합산하여 실제 소비보다 훨씬 큰 수치가 XP에 반영됨.
**수정 방향**:
- `input_tokens + output_tokens`만 합산
- `cache_creation_input_tokens`, `cache_read_input_tokens` 제외

**Acceptance Criteria**:
- [ ] hook-stop.sh의 Python/jq 파서에서 cache 토큰 필드 제거
- [ ] XP 계산에 input_tokens + output_tokens만 사용됨

#### T-003: tokens_per_xp 기본값 조정
**현재**: `tokens_per_xp=10` (너무 빠름)
**변경**: `tokens_per_xp=100`
**체감**: Medium Slow 기준 첫 진화(Lv.16)에 ~305,900 토큰 (2~3세션), 최종 진화(Lv.36)에 ~3,565,700 토큰.

**Acceptance Criteria**:
- [ ] config.json 기본값이 tokens_per_xp=100
- [ ] install.sh에서 새로 생성하는 config.json도 100

#### T-004: 종별 경험치 그룹 적용
**현재**: 모든 포켓몬이 Medium Fast (n³) 단일 공식
**변경**: 포켓몬 원작의 6종 경험치 그룹 중 해당 종의 공식 적용

| 경험치 그룹 | 공식 | 해당 포켓몬 (Tokenmon PoC) |
|-----------|------|------------------------|
| Medium Slow | 6n³/5 − 15n² + 100n − 140 | 모부기/수풀부기/토대부기 (#387-389) |
| Slow | 5n³/4 | 불꽃숭이/파이숭이/초염몽 (#390-392) |
| Medium Slow | 6n³/5 − 15n² + 100n − 140 | 팽도리/팽태자/엠페르트 (#393-395) |
| Medium Slow | 6n³/5 − 15n² + 100n − 140 | 새박이/찌르버드/찌르호크 (#396-398) |
| Medium Slow | 6n³/5 − 15n² + 100n − 140 | 꼬지모/럭시오/럭시레이 (#403-405) |
| Medium Slow | 6n³/5 − 15n² + 100n − 140 | 리오르/루카리오 (#447-448) |

**수정 범위**:
- `data/pokemon.json`에 `exp_group` 필드 추가
- `hook-stop.sh`의 레벨 계산 함수를 6종 경험치 그룹 지원으로 확장
- `xp_to_level()`, `level_to_xp()` 함수에 그룹별 분기

**Acceptance Criteria**:
- [ ] pokemon.json의 모든 포켓몬에 exp_group 필드 존재
- [ ] 레벨 계산이 종별 경험치 그룹 공식을 사용
- [ ] Medium Slow, Slow 등 최소 2종 이상의 공식이 구현됨
- [ ] 기존 Medium Fast 공식은 해당 그룹 포켓몬에만 적용 (현재 PoC에는 해당 없음)

#### T-005: /tokenmon CLI 미동작 수정
**문제**: `UserPromptSubmit` 훅에 `hook-tokenmon-cmd.sh`가 등록되어 있으나 Claude Code 내에서 `/tokenmon` 명령어가 동작하지 않음.
**조사 필요**: UserPromptSubmit 훅의 matcher 패턴, 훅 실행 결과 반환 방식, Claude Code 내 slash command 인터셉트 메커니즘 확인.

**Acceptance Criteria**:
- [ ] Claude Code 세션 내에서 `/tokenmon status` 입력 시 파티 상태 출력
- [ ] `/tokenmon party`, `/tokenmon achievements` 등 서브커맨드 동작

#### T-006: install.sh --reset 플래그
**목적**: 버그 수정 후 기존의 잘못된 state.json을 초기화할 수 있어야 함.
**동작**: `install.sh --reset` 실행 시 state.json을 초기 상태로 리셋 (config.json은 유지).

**Acceptance Criteria**:
- [ ] `install.sh --reset` 실행 시 state.json이 초기값으로 리셋
- [ ] config.json, 에셋 파일은 보존
- [ ] 리셋 전 확인 프롬프트 출력

---

## M1: npm/TypeScript 전환

### Goal
Tokenmon을 bash/jq/Python에서 Node.js/TypeScript로 전체 재작성하고, Claude Code 공식 플러그인 구조(`.claude-plugin/plugin.json`)로 전환한다.

### Tickets

#### T-101: 프로젝트 스캐폴드 (TS + Plugin 구조)
```
tokenmon/
├── .claude-plugin/
│   └── plugin.json          # 플러그인 매니페스트
├── skills/
│   └── tokenmon/
│       └── SKILL.md         # /tokenmon:status 등 CLI 대체
├── hooks/
│   └── hooks.json           # 이벤트 핸들러 등록
├── src/
│   ├── hooks/
│   │   ├── session-start.ts
│   │   ├── stop.ts          # JSONL 파싱 + XP
│   │   ├── permission.ts
│   │   ├── tool-fail.ts
│   │   ├── subagent-start.ts
│   │   └── subagent-stop.ts
│   ├── core/
│   │   ├── xp.ts            # 6종 경험치 그룹 공식
│   │   ├── evolution.ts
│   │   ├── achievements.ts
│   │   └── state.ts         # state.json CRUD
│   ├── audio/
│   │   └── play-cry.ts      # cross-platform 오디오
│   ├── sprites/
│   │   └── convert.ts       # PNG → 터미널 아트 (순수 TS, Pillow 제거)
│   └── status-line.ts
├── data/
│   ├── pokemon.json
│   └── achievements.json
├── assets/
│   ├── sprites/             # 터미널 아트 캐시
│   └── cries/               # 울음소리 파일
├── package.json
├── tsconfig.json
└── README.md
```

**Acceptance Criteria**:
- [ ] `plugin.json` 매니페스트 존재 (name, description, version, author)
- [ ] `hooks/hooks.json`에 6개 이벤트 핸들러 등록
- [ ] TypeScript 컴파일 성공
- [ ] `npm install` 후 즉시 사용 가능

#### T-102: JSONL 파서 + XP 엔진 (TypeScript)
- Node.js의 readline/stream으로 JSONL 파싱
- 6종 경험치 그룹 공식 구현
- Delta tracking 내장
- jq 의존성 완전 제거

**Acceptance Criteria**:
- [ ] input_tokens + output_tokens만 파싱
- [ ] 6종 경험치 그룹별 레벨 계산 정확
- [ ] 델타 추적으로 중복 XP 없음
- [ ] jq 없이 동작

#### T-103: 오디오 시스템 (cross-platform)
- WSL2: PowerShell MediaPlayer (기존 방식 유지)
- macOS: afplay
- Linux: aplay/ffplay fallback
- Node.js child_process로 통합

**Acceptance Criteria**:
- [ ] WSL2에서 울음소리 재생
- [ ] macOS/Linux fallback 구현
- [ ] 비동기 실행 (훅 블로킹 없음)

#### T-104: 스프라이트 변환 (순수 TS)
- Pillow 의존성 제거
- sharp 또는 순수 PNG 파서로 대체
- 터미널 ▀▄ 하프블록 + ANSI 256색 변환

**Acceptance Criteria**:
- [ ] Python/Pillow 없이 PNG → 터미널 아트 변환
- [ ] 기존과 동등한 품질의 출력
- [ ] npm install 시 자동 설치 (native addon 최소화)

#### T-105: statusLine + Skills (CLI 대체)
- `status-line.ts`로 statusLine 출력
- `/tokenmon:status`, `/tokenmon:party`, `/tokenmon:achievements` 등 스킬로 CLI 대체
- `$ARGUMENTS` 활용

**Acceptance Criteria**:
- [ ] statusLine에 포켓몬 스프라이트 + Lv + XP바 출력
- [ ] `/tokenmon:status` 등 스킬이 Claude Code 내에서 동작
- [ ] 기존 tokenmon.sh CLI와 동등한 기능

#### T-106: 진화 + 업적 시스템 (TS)
- 진화 로직 TypeScript 포팅
- 업적 트리거 + 해금 로직
- state.json 관리

**Acceptance Criteria**:
- [ ] 진화 레벨 도달 시 종 변경 + 알림
- [ ] 업적 조건 충족 시 자동 해금
- [ ] state.json 무결성 유지

#### T-107: 설치/마이그레이션 스크립트
- `npm install` 후 postinstall로 초기 세팅
- 기존 bash 버전에서의 마이그레이션 가이드
- state.json 호환성 (기존 데이터 보존)

**Acceptance Criteria**:
- [ ] `npm install tokenmon` 후 즉시 사용 가능
- [ ] 기존 state.json이 있으면 데이터 마이그레이션
- [ ] 기존 bash 버전 자동 감지 및 정리 안내

---

## M2: 마켓플레이스 배포

### Goal
Tokenmon을 Claude Code 공식 마켓플레이스에 등록하여 `/plugin install`로 설치 가능하게 한다.

### Tickets

#### T-201: marketplace.json 구조 구성
```json
{
  "name": "tokenmon-marketplace",
  "owner": {
    "name": "minsiwon00"
  },
  "plugins": [
    {
      "name": "tokenmon",
      "source": "./",
      "description": "Gen 4 포켓몬 기반 Claude Code 경험치 시스템",
      "version": "1.0.0",
      "category": "productivity",
      "tags": ["pokemon", "gamification", "xp"],
      "keywords": ["pokemon", "tokenmon", "xp", "level", "evolution"]
    }
  ]
}
```

**Acceptance Criteria**:
- [ ] `.claude-plugin/marketplace.json` 유효
- [ ] `claude plugin validate .` 통과
- [ ] 플러그인 소스가 올바르게 참조됨

#### T-202: GitHub 레포 배포
- 공개 GitHub 레포 생성/정리
- README.md 작성 (설치 방법, 스크린샷, 기능 설명)
- `/plugin marketplace add owner/repo`로 설치 가능

**Acceptance Criteria**:
- [ ] GitHub 레포에서 `/plugin marketplace add`로 마켓플레이스 추가 가능
- [ ] `/plugin install tokenmon@tokenmon-marketplace`로 설치 가능
- [ ] 설치 후 모든 기능 정상 동작

#### T-203: 공식 마켓플레이스 제출
- claude.ai/settings/plugins/submit 통해 제출
- 제출 요구사항 충족 확인
- 리뷰 대응

**Acceptance Criteria**:
- [ ] 제출 양식 완료
- [ ] 리뷰 통과
- [ ] 공식 마켓플레이스에서 검색/설치 가능

---

## Constraints

- **OMC 완전 독립**: oh-my-claudecode 설치 여부와 무관하게 동작
- **한국어 기준**: 포켓몬 이름, UI 메시지 전부 한글 (다국어 backlog)
- **4세대 (신오지방)**: 스프라이트/울음소리/포켓몬 전부 Gen 4 기준
- **WSL2/Linux/macOS**: cross-platform 지원 (M1부터)
- **M0은 bash 유지**: M0에서는 기존 bash 스크립트 수정만. TS 전환은 M1에서.
- **`${CLAUDE_PLUGIN_ROOT}`**: M1부터 hooks에서 플러그인 경로 참조 시 사용

## Non-Goals

- 배틀 시스템 / 아이템 시스템
- 클라우드 동기화 / 멀티 기기
- 포켓몬 트레이드
- 다국어 지원 (별도 마일스톤)
- 5세대 이후 포켓몬 추가 (별도 마일스톤)

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Stop 훅에서 토큰 수를 얻을 수 있다 | payload에 토큰 없음 | JSONL 파싱으로 해결 (확인됨) |
| cache 토큰도 XP에 반영해야 한다 | cache는 시스템 최적화이지 사용자 활동이 아님 | input+output만 XP로 (사용자 결정) |
| Medium Fast 단일 공식이면 충분하다 | 원작 재미를 살리려면 종별 차이가 필요 | 6종 경험치 그룹 적용 (사용자 결정) |
| tokens_per_xp=10이 적절하다 | 한 세션에 Lv.160 도달 | tokens_per_xp=100으로 상향 (사용자 결정) |
| bash PoC를 유지할 수 있다 | 마켓플레이스 배포에는 플러그인 구조 필요 | M1에서 TS 전환, M0은 bash 유지 (사용자 결정) |
| Claude Code 마켓플레이스가 없다 | 2026년 3월 기준 공식 마켓플레이스 존재 확인 | M2에서 마켓플레이스 배포 (공식 문서 확인) |

## Technical Context

### 현재 코드베이스 (M0 수정 대상)
- `~/claude/tokenmon/scripts/hook-stop.sh`: JSONL 파싱 + XP 계산 (lines 60-93 수정)
- `~/claude/tokenmon/scripts/hook-stop.sh`: 레벨 계산 함수 (lines 25-44 확장)
- `~/claude/tokenmon/data/pokemon.json`: exp_group 필드 추가
- `~/claude/tokenmon/config.json`: tokens_per_xp 기본값 변경
- `~/claude/tokenmon/scripts/hook-tokenmon-cmd.sh`: /tokenmon 미동작 조사
- `~/claude/tokenmon/install.sh`: --reset 플래그 추가

### Claude Code 플러그인 구조 (M1 전환 대상)
- `.claude-plugin/plugin.json`: 매니페스트 (name, description, version)
- `hooks/hooks.json`: 이벤트 핸들러 등록 (settings.json 대신)
- `skills/`: SKILL.md로 slash command 정의 (`/tokenmon:status`)
- `${CLAUDE_PLUGIN_ROOT}`: 플러그인 설치 경로 변수
- `${CLAUDE_PLUGIN_DATA}`: 영구 데이터 경로 (state.json 등)

### 마켓플레이스 배포 (M2)
- `.claude-plugin/marketplace.json`: 마켓플레이스 카탈로그
- GitHub source 또는 npm source로 배포
- `claude plugin validate .`로 검증
- claude.ai/settings/plugins/submit으로 공식 제출

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Tokenmon Plugin | core domain | name, version, hooks, skills, statusLine | contains Pokemon, XP System, Achievement System |
| Pokemon | core domain | id, name, type, exp_group, evolution_level, species_line | belongs to Party, has Experience Group |
| XP System | core domain | tokens_per_xp, delta_tracking, last_processed_tokens | calculates Level via Experience Group |
| Experience Group | core domain | formula (Medium Slow, Slow, Fast, etc.), level_to_xp(), xp_to_level() | determines Pokemon's leveling curve |
| Level/Evolution | core domain | current_level, evolution_trigger_level, species_change | triggered by XP System |
| Achievement | supporting | id, trigger_condition, reward_pokemon, rarity | unlocks Pokemon |
| Party | supporting | members (max 6), xp_share | contains Pokemon, allocates XP |
| Plugin Manifest | supporting | plugin.json, marketplace.json, hooks.json | defines Plugin structure |
| State | supporting | state.json, config.json, session.json | persists Pokemon/XP/Achievement data |
| Marketplace | external | marketplace.json, source, GitHub repo | distributes Plugin |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 6 | 2 | 0 | 4 | 67% |
| 3 | 7 | 1 | 1 | 5 | 83% |
| 4 | 7 | 0 | 0 | 7 | 100% |
| 5 | 7 | 0 | 0 | 7 | 100% |
| 6 | 8 | 1 | 0 | 7 | 88% |
| 7 | 9 | 1 | 0 | 8 | 89% |
| 8 | 10 | 1 | 0 | 9 | 90% |
| 9 | 10 | 0 | 0 | 10 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (9 rounds)</summary>

### Round 1
**Q:** "Claude Code plugin only로 설치 가능해야 함"의 의미를 구체화하고 싶습니다. 현재 install.sh는 jq 바이너리 다운로드, uv/pip3로 Pillow 설치 등 외부 의존성을 직접 설치합니다. 여기서 "plugin only"란 어떤 수준?
**A:** npm 패키지로 전환 + Claude Code 마켓플레이스
**Ambiguity:** 71% (Goal: 0.4, Constraints: 0.2, Criteria: 0.1, Context: 0.5)

### Round 2
**Q:** 이 deep interview에서 나올 스펙의 범위는? 버그 수정만? 전체 로드맵? 마일스톤 분리?
**A:** 마일스톤 분리 (M0/M1/M2 각각 별도 스펙)
**Ambiguity:** 62% (Goal: 0.55, Constraints: 0.25, Criteria: 0.15, Context: 0.6)

### Round 3
**Q:** 어떤 토큰을 XP로 치는 게 맞다고 보세요? (input+output, output만, 전체 유지)
**A:** input+output만. 레벨업 속도 조정 가능하도록. 포켓몬 게임 규칙 따라가도 좋을 듯.
**Ambiguity:** 49% (Goal: 0.7, Constraints: 0.4, Criteria: 0.25, Context: 0.65)

### Round 4 (Contrarian Mode)
**Q:** 종별 경험치 그룹 6종을 적용할까요, 단일 공식으로 충분할까요?
**A:** 종별 경험치 그룹 (원작 그대로)
**Ambiguity:** 42% (Goal: 0.75, Constraints: 0.55, Criteria: 0.3, Context: 0.7)

### Round 5
**Q:** tokens_per_xp 기본값은? (10/50/100)
**A:** tokens_per_xp=100 (첫 진화에 2~3세션)
**Ambiguity:** 36% (Goal: 0.8, Constraints: 0.65, Criteria: 0.35, Context: 0.75)

### Round 6 (Simplifier Mode)
**Q:** M0에 포함할 범위는? (버그만 / 버그+경험치그룹 / 버그+경험치+업적)
**A:** 버그 2건 + 경험치 그룹. state 리셋은 install.sh --reset.
**Ambiguity:** 29% (Goal: 0.85, Constraints: 0.7, Criteria: 0.5, Context: 0.75)

### Round 7
**Q:** M1 npm 전환 범위는? (전체 재작성 / npm 패키징만 / 핵심만 Node.js)
**A:** 전체 Node.js/TypeScript 재작성
**Ambiguity:** 26% (Goal: 0.9, Constraints: 0.7, Criteria: 0.55, Context: 0.75)

### Round 8 (Documentation Research)
**Q:** M2 마켓플레이스의 실제 목표는?
**A:** 공식 마켓플레이스 존재 확인 (code.claude.com/docs/ko/plugin-marketplaces). 문서 확인 후 구조 파악.
**Ambiguity:** 21% (Goal: 0.9, Constraints: 0.75, Criteria: 0.6, Context: 0.9)

### Round 9
**Q:** 각 마일스톤 완료 기준 확인 (M0 6건, M1 7건, M2 3건)
**A:** 이대로 확정
**Ambiguity:** 12% (Goal: 0.95, Constraints: 0.8, Criteria: 0.85, Context: 0.9)

</details>
