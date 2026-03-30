# M1: Tokenmon npm/TypeScript 전환 — 합의 계획

## RALPLAN-DR Summary

### Principles
1. **Feature parity**: M0 완료된 bash 코드의 모든 기능을 TypeScript로 동등하게 구현
2. **Plugin-native**: Claude Code 공식 플러그인 구조 (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `skills/`)
3. **Zero external deps for core**: jq, python3 의존성 제거. JSON은 Node.js 내장, 스프라이트 변환은 순수 TS 또는 경량 라이브러리
4. **Incremental migration**: 기존 state.json/config.json 호환 유지. 데이터 손실 없이 마이그레이션
5. **Single npm install**: `npm install` 한 줄로 모든 의존성 해결, postinstall로 초기 세팅

### Decision Drivers
1. **마켓플레이스 대응**: M2에서 `.claude-plugin/` 구조가 필수 — M1이 이를 준비
2. **유지보수성**: 2,178줄의 bash를 TS로 전환하면 타입 안전성 + 테스트 가능성 확보
3. **Cross-platform**: bash/jq/python3 의존성 제거로 macOS/Linux/WSL2 모두 지원

### Viable Options

**Option A: 순수 TypeScript + tsx 실행 (Recommended)**
- TypeScript 소스를 `tsx` (또는 `ts-node`)로 직접 실행
- hooks.json에서 `"$CLAUDE_PLUGIN_ROOT/node_modules/.bin/tsx" "$CLAUDE_PLUGIN_ROOT/src/hooks/stop.ts"` 형태로 호출
- Pros: 빌드 스텝 불필요, 개발 속도 빠름, 소스 = 실행 파일
- Cons: tsx 런타임 의존성 (dependencies에 포함 필수), node_modules/.bin/tsx 절대경로 의존

**Option B: 빌드된 JavaScript 배포**
- `tsc`로 dist/ 빌드 후 `node dist/hooks/stop.js`로 실행
- Pros: 런타임 의존성 최소, 실행 속도 빠름
- Cons: 빌드 스텝 필요, postinstall에서 빌드 필요, 개발 시 watch 필요

**Option B 보류 근거**: OMC 자체는 빌드된 .cjs/.mjs를 사용하므로 Option B도 유효함. 그러나 M1 초기 단계에서는 tsx 직접 실행이 이터레이션 속도에 유리. M2 마켓플레이스 배포 시 Option B로 전환 검토 가능.

---

## Requirements Summary

Deep Interview 스펙 M1 섹션 기준:
- T-101: 프로젝트 스캐폴드 (TS + Plugin 구조)
- T-102: JSONL 파서 + XP 엔진
- T-103: 오디오 시스템 (cross-platform)
- T-104: 스프라이트 변환 (순수 TS)
- T-105: statusLine + Skills (CLI 대체)
- T-106: 진화 + 업적 시스템
- T-107: 설치/마이그레이션 스크립트

---

## Target Directory Structure

```
tokenmon/
├── .claude-plugin/
│   └── plugin.json                # 플러그인 매니페스트
├── hooks/
│   └── hooks.json                 # Claude Code 훅 등록
├── skills/
│   └── tokenmon/
│       └── SKILL.md               # /tokenmon slash command
├── commands/
│   └── tokenmon.md                # (skills로 대체될 수 있으나 호환용 유지)
├── src/
│   ├── hooks/
│   │   ├── session-start.ts       # SessionStart 훅
│   │   ├── stop.ts                # Stop 훅 (JSONL 파싱 + XP)
│   │   ├── permission.ts          # PermissionRequest 훅
│   │   ├── tool-fail.ts           # PostToolUseFailure 훅
│   │   ├── subagent-start.ts      # SubagentStart 훅
│   │   └── subagent-stop.ts       # SubagentStop 훅
│   ├── core/
│   │   ├── xp.ts                  # 6종 경험치 그룹 공식
│   │   ├── evolution.ts           # 진화 로직
│   │   ├── achievements.ts        # 업적 시스템
│   │   ├── state.ts               # state.json CRUD (atomic write)
│   │   └── config.ts              # config.json 관리
│   ├── audio/
│   │   └── play-cry.ts            # cross-platform 오디오
│   ├── sprites/
│   │   └── convert.ts             # PNG → 터미널 아트 (순수 TS)
│   ├── cli/
│   │   └── tokenmon.ts            # CLI 엔트리포인트 (tokenmon status 등)
│   └── status-line.ts             # statusLine 출력
├── data/
│   ├── pokemon.json               # 포켓몬 데이터 (exp_group 포함)
│   └── achievements.json          # 업적 정의
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Steps

### Step 1: T-101 — 프로젝트 스캐폴드

**1.1 package.json 생성**
```json
{
  "name": "tokenmon",
  "version": "1.0.0",
  "description": "Gen 4 포켓몬 기반 Claude Code 경험치 플러그인",
  "type": "module",
  "bin": {
    "tokenmon": "./src/cli/tokenmon.ts"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "postinstall": "./node_modules/.bin/tsx src/setup/postinstall.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tsx": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  }
}
```

> **CLI shebang**: `src/cli/tokenmon.ts`의 첫 줄에 `#!/usr/bin/env -S npx tsx` 추가

**1.2 tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**1.3 .claude-plugin/plugin.json**
```json
{
  "name": "tokenmon",
  "description": "Gen 4 포켓몬 기반 Claude Code 경험치 플러그인",
  "version": "1.0.0",
  "author": {
    "name": "Sangwon Lee"
  },
  "repository": "https://github.com/ThunderConch/tokenmon",
  "keywords": ["pokemon", "gamification", "xp", "level"]
}
```

**1.4 hooks/hooks.json** — 훅 엔트리포인트를 tsx로 실행
```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/hooks/session-start.ts"}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/hooks/stop.ts"}]}],
    "PermissionRequest": [{"hooks": [{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/hooks/permission.ts"}]}],
    "PostToolUseFailure": [{"hooks": [{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/hooks/tool-fail.ts"}]}],
    "SubagentStart": [{"hooks": [{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/hooks/subagent-start.ts"}]}],
    "SubagentStop": [{"hooks": [{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/hooks/subagent-stop.ts"}]}]
  }
}
```

**1.5 skills/tokenmon/SKILL.md** — /tokenmon 슬래시 명령
```markdown
---
description: Tokenmon 상태 확인 및 파티 관리
---
사용자가 Tokenmon 명령을 실행하려고 합니다. Bash 도구를 사용하여 다음 명령을 실행하고 결과를 보여주세요:
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" $ARGUMENTS
$ARGUMENTS가 비어있으면 status를 기본값으로 사용하세요.
```

**Acceptance Criteria**:
- [ ] `npm install` 성공 (tsx, typescript 설치)
- [ ] `npx tsc --noEmit` 타입체크 통과
- [ ] `.claude-plugin/plugin.json` 존재
- [ ] `hooks/hooks.json` 6개 훅 등록
- [ ] `skills/tokenmon/SKILL.md` 존재

### Step 2: T-102 — JSONL 파서 + XP 엔진 (src/core/)

**2.1 src/core/xp.ts** — 6종 경험치 그룹 공식
- `levelToXp(level: number, group: ExpGroup): number`
- `xpToLevel(xp: number, group: ExpGroup): number`
- `type ExpGroup = 'medium_fast' | 'medium_slow' | 'slow' | 'fast' | 'erratic' | 'fluctuating'`
- M0에서 구현한 Python 공식을 그대로 TS로 포팅

**2.2 src/core/paths.ts** — 데이터 경로 해석
```typescript
import { homedir } from 'os';
import { join } from 'path';

export const DATA_DIR = join(
  process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'),
  'tokenmon'
);
export const STATE_PATH = join(DATA_DIR, 'state.json');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');
export const SESSION_PATH = join(DATA_DIR, 'session.json');
```
> **주의**: `${CLAUDE_PLUGIN_DATA}`는 존재하지 않음. 실제 패턴은 `CLAUDE_CONFIG_DIR ?? ~/.claude` + `/tokenmon/`

**2.3 src/core/state.ts** — state.json atomic read/write
- `readState(): State` / `writeState(state: State): void`
- atomic write: `writeFileSync(statePath + '.tmp')` → `renameSync(...)` (같은 파일시스템 보장)
- `last_session_tokens` 딕셔너리 관리 + 10개 pruning (**값 기준 내림차순 정렬, 상위 10개 유지** — M0 `hook-stop.sh:300` 동일)
- `State` 타입 정의 (모든 M0 필드: pokemon, unlocked, achievements, total_tokens_consumed, session_count, error_count, permission_count, evolution_count, last_session_id, xp_bonus_multiplier, last_session_tokens)
- state.json 없을 때 기본값 생성 (M0 초기화 템플릿 동일)

**2.4 src/core/config.ts** — config.json 관리
- `readConfig(): Config` / `writeConfig(config: Config): void`
- `Config` 타입 정의: `tokens_per_xp`, `party: string[]`, `starter_chosen`, `volume`, `sprite_enabled`, `cry_enabled`, `xp_formula`, `xp_bonus_multiplier`, `max_party_size`, `peon_ping_integration`, `peon_ping_port`
- config.json 없을 때 기본값 생성 (tokens_per_xp=100 등)

**2.4 src/hooks/stop.ts** — JSONL 파싱 + 델타 XP 부여
- readline/stream으로 JSONL 파싱 (input_tokens + output_tokens만)
- 델타 추적: `last_session_tokens[session_id]` 기반
- XP 분배: `xpPerPokemon = xpTotal / partySize`
- 레벨업 + 진화 체크
- 업적 체크
- total_tokens_consumed 업데이트

**Acceptance Criteria**:
- [ ] `xp.ts`: Medium Slow Lv.16 = 2535, Slow Lv.14 = 3430 검증
- [ ] `state.ts`: atomic write 구현 (임시 파일 → rename)
- [ ] `stop.ts`: JSONL에서 input_tokens + output_tokens만 합산
- [ ] `stop.ts`: cache 토큰 미포함
- [ ] `stop.ts`: 델타 기반 XP (중복 카운팅 없음)
- [ ] `stop.ts`: `last_session_tokens` 10개 pruning
- [ ] jq 의존성 없음

### Step 3: T-103 — 오디오 시스템 (src/audio/)

**3.1 src/audio/play-cry.ts**
- Platform 감지: `process.platform` + WSL2 체크 (`/proc/version`)
- WSL2: `child_process.spawn('powershell.exe', ['-NoProfile', '-File', 'tokenmon-play.ps1', winPath, volume])`
- macOS: `child_process.spawn('afplay', ['-v', volume, cryPath])`
- Linux: `child_process.spawn('aplay', [cryPath])` 또는 `ffplay` fallback
- 비동기 실행 (spawn + detach, 훅 블로킹 없음)
- Party 2마리 이상: 랜덤 선택

**Acceptance Criteria**:
- [ ] WSL2에서 PowerShell 경로 자동 탐색
- [ ] 비동기 실행 (훅 타임아웃 미초과)
- [ ] python3 의존성 없음

### Step 4: T-104 — 스프라이트 변환 (src/sprites/)

**4.1 src/sprites/convert.ts**
- 순수 TS PNG 파서 또는 경량 npm 패키지 (예: `pngjs`)
- PNG → ▀▄ 하프블록 + ANSI 256색 변환
- Pillow 완전 제거
- convert.py 로직을 TS로 포팅

**Acceptance Criteria**:
- [ ] Python/Pillow 없이 PNG → 터미널 아트 변환
- [ ] 기존과 동등한 품질
- [ ] `pngjs`가 유일한 추가 의존성 (또는 순수 TS)

### Step 5: T-105 — statusLine + Skills

**5.1 src/status-line.ts**
- state.json에서 파티 읽기
- 포켓몬별: 스프라이트 + 이름 + Lv + XP바
- exp_group 반영 XP바 계산
- 에이전트 배치 표시

**5.2 skills/tokenmon/SKILL.md** (Step 1에서 생성)

**5.3 src/cli/tokenmon.ts** — CLI 엔트리포인트
- `status`, `starter`, `party add/remove`, `unlock list`, `achievements`, `config set`, `help`
- 기존 tokenmon.sh 기능 1:1 포팅
- ANSI 색상 출력

**Acceptance Criteria**:
- [ ] statusLine에 포켓몬 스프라이트 + Lv + XP바 출력
- [ ] `/tokenmon` skill이 CLI를 호출
- [ ] 기존 bash CLI와 동등한 기능 (status, starter, party, achievements 등)

### Step 6: T-106 — 진화 + 업적 시스템

**6.1 src/core/evolution.ts**
- `checkEvolution(pokemon, newLevel, pokemonData): EvolutionResult | null`
- 진화 시: state에서 종 변경, config에서 party 업데이트, evolution_count 증가

**6.2 src/core/achievements.ts**
- `checkAchievements(state, config): AchievementEvent[]`
- 트리거: session_count, total_tokens, evolution_count, error_count, permission_count
- 해금 시: unlocked 배열 추가, 보상 포켓몬 초기화

**Acceptance Criteria**:
- [ ] 진화 레벨 도달 시 종 변경 + 알림
- [ ] 업적 조건 충족 시 자동 해금
- [ ] state.json 무결성 유지

### Step 7: T-107 — 나머지 훅 + 설치

**7.1 나머지 훅 스크립트** (session-start, permission, tool-fail, subagent-start/stop)
- 각각 기존 bash 로직을 TS로 포팅
- stdin JSON 읽기 → 처리 → stdout JSON 출력

**7.2 src/setup/postinstall.ts** — 마이그레이션 + 초기화
- 데이터 경로: `paths.ts`의 `DATA_DIR` (= `CLAUDE_CONFIG_DIR ?? ~/.claude` + `/tokenmon/`)
- `mkdirSync(DATA_DIR, { recursive: true })`
- **마이그레이션 로직** (기존 bash 설치에서):
  - Source: `~/.claude/hooks/tokenmon/state.json`
  - Destination: `DATA_DIR/state.json`
  - 마이그레이션 전 source 파일 자동 백업 (`.state.json.bak`)
  - 모든 M0 필드 복사 (pokemon, unlocked, achievements, total_tokens_consumed 등)
  - 누락 필드는 기본값으로 채움 (예: last_session_tokens 없으면 `{}`)
- **config.json 마이그레이션**:
  - Source: `~/.claude/hooks/tokenmon/config.json`
  - Destination: `DATA_DIR/config.json`
  - party, tokens_per_xp, volume, sprite_enabled, cry_enabled 등 전체 필드 복사
- **session.json 마이그레이션**: 동일 패턴
- state/config가 이미 DATA_DIR에 있으면 마이그레이션 스킵
- 기존 bash 훅 정리 안내 메시지 출력

**마이그레이션 성공 기준**: 마이그레이션 전후 모든 포켓몬의 XP/레벨 값이 동일

**7.3 기존 bash 파일 정리**
- 기존 bash 소스는 `legacy/` 디렉토리로 이동 (참조용)
- 또는 삭제하고 git history에만 보존

**Acceptance Criteria**:
- [ ] 6개 훅 모두 TS로 동작
- [ ] postinstall로 초기 state/config 생성
- [ ] 기존 state.json 마이그레이션 (데이터 보존)
- [ ] bash/jq/python3 의존성 완전 제거

---

## Execution Order

```
Step 1 (스캐폴드) → Step 2 (XP 엔진) → Step 6 (진화/업적) → Step 5 (CLI/statusLine) → Step 3 (오디오) → Step 4 (스프라이트) → Step 7 (나머지 훅 + 설치)
```

Step 2를 먼저 하는 이유: XP/레벨/state가 모든 다른 모듈의 기반.
Step 6을 Step 5 전에 하는 이유: CLI의 status 출력이 진화 상태에 의존.
Step 3/4는 독립적이므로 병렬 가능.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| tsx 런타임 오버헤드 | 훅 실행 지연 (특히 Stop) | tsx의 esbuild 기반 변환은 ~50ms. 10초 타임아웃 내 충분. 문제 시 Option B(빌드)로 전환 |
| `${CLAUDE_PLUGIN_ROOT}` 경로 해석 | hooks.json에서 경로 오류 | 공식 문서 확인됨. 플러그인 캐시에 복사 시 자동 치환 |
| `${CLAUDE_PLUGIN_DATA}` 미지원 시 | state.json 저장 위치 불명 | fallback: `${CLAUDE_PLUGIN_ROOT}/data/` 사용 |
| pngjs 네이티브 모듈 | npm install 실패 | pngjs는 순수 JS. 네이티브 모듈 아님 |
| 기존 state.json 마이그레이션 | 데이터 손실 | 마이그레이션 전 자동 백업, 스키마 버전 체크 |
| PowerShell 오디오 경로 | WSL2에서 wslpath 필요 | Node.js child_process로 wslpath 호출. 실패 시 무음 |

## Verification Steps

1. **타입체크**: `npx tsc --noEmit` 에러 0
2. **XP 공식 검증**: `node --import tsx src/core/xp.ts` 테스트 (Medium Slow Lv.16=2535, Slow Lv.14=3430)
3. **JSONL 파싱**: 실제 세션 JSONL로 `stop.ts` 실행 → state.json XP 변경 확인
4. **델타 추적**: 동일 세션 2회 실행 → 중복 XP 없음 확인
5. **CLI**: `node --import tsx src/cli/tokenmon.ts status` 실행 → 파티 출력 확인
6. **플러그인 로드**: `claude --plugin-dir ./tokenmon` → `/tokenmon` 자동완성 + 실행
7. **statusLine**: Claude Code에서 포켓몬 스프라이트 + XP바 표시 확인

---

## ADR

### Decision
tsx (esbuild 기반 TypeScript 실행기)로 빌드 없이 TypeScript를 직접 실행하는 Claude Code 플러그인 구조로 전환한다.

### Drivers
1. 마켓플레이스 배포를 위해 `.claude-plugin/` 구조 필수
2. bash/jq/python3 의존성 제거로 cross-platform + 유지보수성 확보
3. 빌드 스텝 없이 소스 = 실행 파일로 개발 속도 유지

### Alternatives Considered
- **빌드된 JS 배포**: tsc → dist/ 빌드. postinstall 빌드가 플러그인 캐시에서 불안정 → 기각
- **Bun 런타임**: TS 직접 실행 가능. 하지만 Claude Code 환경에서 bun 설치 보장 불가 → 기각
- **bash 유지 + npm 래핑만**: jq/python3 의존성 유지됨. 마켓플레이스 배포 시 사용자 환경 보장 불가 → 기각

### Why Chosen
tsx는 npm 패키지로 설치되어 Node.js만 있으면 동작. esbuild 기반이라 변환 속도가 빠르고, Claude Code가 이미 Node.js 환경을 보장하므로 추가 런타임 설치 불필요. 빌드 스텝 없이 소스를 직접 실행하여 플러그인 캐시 복사와의 호환성 문제 회피.

### Consequences
- tsx가 devDependency가 아닌 dependency (런타임 필수)
- 첫 실행 시 ~50ms esbuild 변환 오버헤드 (캐시 이후 무시 가능)
- Node.js 22+ 필요 (ESM import, --import 플래그)

### Follow-ups
- M2에서 marketplace.json 추가 + 공식 마켓플레이스 제출
- M2에서 Option B(빌드된 JS) 전환 검토 (마켓플레이스 안정성)
- 기존 bash 사용자 마이그레이션 가이드 README에 추가

---

## Consensus Review Results

- **Architect**: APPROVE_WITH_IMPROVEMENTS (6건)
- **Critic**: REVISE (7건 필수 수정)
- **Iterations**: 1 (개선사항 반영 후 확정)

### Applied Improvements
1. **[Critical] tsx 절대경로** — hooks.json, SKILL.md, postinstall 모두 `$CLAUDE_PLUGIN_ROOT/node_modules/.bin/tsx` 사용
2. **[Critical] 데이터 경로** — `${CLAUDE_PLUGIN_DATA}` 제거 → `CLAUDE_CONFIG_DIR ?? ~/.claude` + `/tokenmon/`. `src/core/paths.ts` 모듈 추가
3. **[High] moduleResolution** — `"bundler"` → `"node16"`
4. **[High] CLI shebang** — `#!/usr/bin/env -S npx tsx` 추가 명시
5. **[High] config.json 마이그레이션** — Step 7.2에 명시적 소스/대상 경로 + 필드 매핑
6. **[High] pruning 전략** — 값 기준 내림차순 정렬, 상위 10개 유지 (M0 동일)
7. **[Medium] State/Config 타입** — 모든 M0 필드 명시, session.json 포함
8. **[Medium] Node.js 22+ engines 필드** — package.json에 추가
9. **[Low] atomic write** — `statePath + '.tmp'` 사용 (같은 파일시스템 보장)
