# Tokénmon — Plugin Spec

## Goal

Claude Code용 독립형 플러그인. 세션 이벤트마다 4세대 포켓몬 울음소리가 재생되고, 상태바에 도트 스프라이트 아바타가 표시된다. 포켓몬이 소비한 토큰이 경험치가 되어 레벨업·진화하며, 업적 시스템으로 새 포켓몬을 해금할 수 있다. OMC 설치 여부와 무관하게 동작한다.

## Constraints

- **Claude Code hooks API만 사용** — settings.json hook 등록 방식
- **OMC 완전 독립** — OMC HUD, OMC 플러그인 시스템 미사용
- **PoC 단계: .sh 기반** — install.sh + bash hook 스크립트. 이후 npm 마이그레이션 예정
- **한국어 기준** — 포켓몬 이름, 업적명, 메시지 전부 한글. 다국어 backlog
- **4세대 (신오지방) 포켓몬** — 스프라이트·울음소리 전부 4세대 기준
- **WSL2/Linux 환경** — 오디오는 PowerShell MediaPlayer (WSL→Windows) 방식
- **의존성 최소화** — bash, jq, node(이미 있음), python3(있으면 스프라이트 변환 사용)

## Non-Goals (PoC 제외)

- 다국어(영어/일어 등) 지원
- 배틀 시스템 / 아이템 시스템
- npm 패키지 배포
- 클라우드 동기화 / 멀티 기기
- 포켓몬 트레이드 / 교환
- 업적 세부 콘텐츠 (틀만 구현, 내용은 backlog)

## Acceptance Criteria

### 핵심 기능 (PoC 완성 기준)

- [ ] `install.sh` 실행 시 settings.json에 hook 자동 등록 + statusLine 설정
- [ ] `uninstall.sh` 실행 시 완전 제거
- [ ] SessionStart, PermissionRequest, Stop, PostToolUseFailure 이벤트마다 현재 파티의 포켓몬 울음소리가 재생됨 (파티 2개 이상이면 랜덤)
- [ ] statusLine에 포켓몬 도트 스프라이트 + 이름 + 레벨 + XP 바 표시
- [ ] 세션 종료 시 JSONL 파싱으로 실제 토큰 소비량 XP 반영
- [ ] 레벨 공식: Medium Fast (`n³`) 적용, `tokens_per_xp: 10` (10토큰 = 1XP, 설정 가능)
- [ ] 정해진 레벨에 진화 (모부기 Lv.18/32, 불꽃숭이 Lv.14/36, 팽도리 Lv.16/36)
- [ ] 진화 시 울음소리 재생 + statusLine에 진화 알림
- [ ] 스타팅 포켓몬 선택 (최초 실행 시 모부기/불꽃숭이/팽도리 중 1택)
- [ ] 나머지 두 스타터: 초기 업적(쉬운 조건)으로 빠르게 해금 가능
- [ ] 파티 최대 6마리, 경험치 공유 (세션 XP ÷ 파티 수)
- [ ] SubagentStart 시 파티에서 포켓몬 1마리씩 배치, 부족하면 배치 없음
- [ ] SubagentStop 시 배치 해제
- [ ] 업적 프레임워크 동작 (업적 트리거 시 unlock + 알림, 콘텐츠는 샘플 3개)
- [ ] `tokenmon status` CLI로 현재 파티·레벨·XP 확인 가능

### 스프라이트

- [ ] Gen 4 공식 스프라이트 PNG (PokeAPI 소스: `sprites/pokemon/versions/generation-iv/diamond-pearl/{id}.png`)
- [ ] PNG → 터미널 블록 아트 변환 (Python 스크립트로 미리 변환해 캐시, 없으면 이름 텍스트 fallback)

## Pokémon Roster (PoC)

### 스타팅 라인 (기본 포함, 3라인 × 3단계 = 9마리)

| 단계 | 풀 | 불꽃 | 물 |
|------|-----|------|-----|
| 1단계 | 모부기 (#387) | 불꽃숭이 (#390) | 팽도리 (#393) |
| 2단계 | 수풀부기 (#388, Lv.18) | 파이숭이 (#391, Lv.14) | 팽태자 (#394, Lv.16) |
| 3단계 | 토대부기 (#389, Lv.32) | 초염몽 (#392, Lv.36) | 엠페르트 (#395, Lv.36) |

### 업적 해금 포켓몬 (PoC 8마리 추가)

| 포켓몬 | 번호 | 라인 | 업적 난이도 | 비고 |
|--------|------|------|-------------|------|
| 새박이 | #396 | →찌르버드→찌르호크 | ★☆☆ 쉬움 | 첫 번째 에러 발생 시 |
| 꼬지모 | #403 | →럭시오→럭시레이 | ★★☆ 보통 | 누적 10만 토큰 소비 |
| 리오르 | #447 | →루카리오 | ★★★ 어려움 | 누적 50만 토큰 소비 |
| 이상해씨 | #001 | 기존 라인 (외전 해금) | ★★★★ 매우 어려움 | 100만 토큰 milestone |

*나머지 스타터 2종: 각각 별도 쉬운 업적으로 빠르게 해금 (예: "첫 번째 세션 완료")*

## Technical Architecture

### 디렉토리 구조

```
~/.claude/hooks/tokenmon/
├── install.sh              # 설치 (settings.json 패치, 디렉토리 생성)
├── uninstall.sh            # 제거
├── tokenmon.sh             # CLI (tokenmon status, party, config)
├── config.json             # 사용자 설정
├── state.json              # 포켓몬 상태 (XP, 레벨, 업적)
├── session.json            # 현재 세션 임시 데이터
├── scripts/
│   ├── hook-session-start.sh     # SessionStart 훅
│   ├── hook-permission.sh        # PermissionRequest 훅
│   ├── hook-stop.sh              # Stop 훅 (JSONL 파싱 + XP 반영)
│   ├── hook-tool-fail.sh         # PostToolUseFailure 훅
│   ├── hook-subagent-start.sh    # SubagentStart 훅
│   ├── hook-subagent-stop.sh     # SubagentStop 훅
│   ├── status-line.sh            # statusLine 출력 스크립트
│   ├── play-cry.sh               # 울음소리 재생 (PowerShell)
│   └── tokenmon-play.ps1         # Windows PowerShell 오디오 플레이어
├── sprites/
│   ├── raw/                      # 다운로드된 PNG 원본
│   │   └── {id}.png
│   ├── terminal/                 # 변환된 터미널 아트 캐시
│   │   └── {id}.txt
│   └── convert.py               # PNG → 터미널 블록 아트 변환기
├── cries/
│   └── {id}.mp3 (또는 .wav)     # 울음소리 파일
└── data/
    ├── pokemon.json              # 포켓몬 데이터 (번호, 한국 이름, 타입, 진화 레벨)
    └── achievements.json         # 업적 정의
```

### config.json 스키마

```json
{
  "tokens_per_xp": 10,
  "party": ["모부기"],
  "starter_chosen": true,
  "volume": 0.5,
  "sprite_enabled": true,
  "cry_enabled": true,
  "xp_formula": "medium_fast"
}
```

### state.json 스키마

```json
{
  "pokemon": {
    "모부기": {
      "id": 387,
      "xp": 1240,
      "level": 11,
      "stage": 0,
      "species_line": ["모부기", "수풀부기", "토대부기"]
    }
  },
  "unlocked": ["모부기", "불꽃숭이"],
  "achievements": {
    "first_session": { "unlocked": true, "at": "2026-03-30T10:00:00Z" }
  },
  "total_tokens_consumed": 124000,
  "last_session_id": "abc123"
}
```

### XP 시스템

- **소스**: Stop 훅에서 `~/.claude/projects/<hash>/<session-id>.jsonl` 파싱
  - `message.usage.input_tokens + output_tokens` 합산
  - PreCompact 훅이 더 빠르면 `transcript_path` 필드로 직접 경로 획득
- **공식**: `xp_gained = total_tokens / tokens_per_xp`
- **레벨 공식 (Medium Fast)**: 레벨 n에 필요한 누적 XP = `n³`
  - Lv.1→2: 1 XP (1→8)
  - Lv.18: 5,832 누적 XP = 58,320 토큰
  - Lv.32: 32,768 누적 XP = 327,680 토큰
  - Lv.36: 46,656 누적 XP = 466,560 토큰
- **파티 공유**: `xp_per_pokemon = total_xp / party_size`

### 상태바 출력 (status-line.sh)

```
[🌿모부기 Lv.11 ████░░ 1240/1331] [🔥불꽃숭이 Lv.8 ██░░░░ 420/512]
```

- Python 미설치 시: 이름 + 레벨 텍스트만 표시
- Python 설치 시: PNG → 하프블록(`▀▄`) 미니 스프라이트 (4×4 셀 크기)
- `settings.json`의 `statusLine.command`를 `tokenmon status-line`으로 설정

### 스프라이트 소스

- **URL**: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/diamond-pearl/{id}.png`
- **install.sh 시 다운로드** 후 `sprites/raw/` 저장
- **convert.py**: PIL/Pillow 사용, 픽셀 → `▀▄` 매핑, ANSI 256색 또는 트루컬러
- Pillow 없으면 텍스트 fallback (자동 감지)

### 오디오 시스템

```bash
# play-cry.sh 구조
WIN_PATH=$(wslpath -w "$CRY_FILE")
PS_EXE=$(command -v powershell.exe || echo "/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe")
"$PS_EXE" -NoProfile -File "$TOKENMON_DIR/scripts/tokenmon-play.ps1" "$WIN_PATH" "$VOLUME" &
```

- `.mp3` → `tokenmon-play.ps1`에서 WPF MediaPlayer로 재생
- 파티 2마리 이상: 울음소리 랜덤 선택
- 울음소리 소스: [PokémonDB cries](https://play.pokemonshowdown.com/audio/cries/) 또는 PokeAPI audio
- **peon-ping 선택 통합**: 릴레이 서버 감지 시 `curl http://localhost:19998/play?category=task.complete` fallback 지원 (설정 opt-in)

### 멀티 에이전트 배치

```
SubagentStart → hook-subagent-start.sh
  - session.json에서 현재 배치된 agent_id 목록 확인
  - party에서 미배치 포켓몬 첫 번째 선택
  - session.json에 { agent_id: "...", pokemon: "모부기" } 추가
  - statusLine에 반영

SubagentStop → hook-subagent-stop.sh
  - session.json에서 해당 agent_id 배치 제거
```

### 업적 프레임워크 (PoC 샘플 3개)

```json
[
  {
    "id": "first_session",
    "name": "첫 만남",
    "description": "처음으로 Claude Code 세션을 시작했다",
    "trigger": "session_count >= 1",
    "reward": "새박이 해금",
    "rarity": "★☆☆"
  },
  {
    "id": "hundred_k_tokens",
    "name": "토큰 십만 돌파",
    "description": "누적 10만 토큰 소비 달성",
    "trigger": "total_tokens >= 100000",
    "reward": "꼬지모 해금",
    "rarity": "★★☆"
  },
  {
    "id": "first_evolution",
    "name": "첫 번째 진화",
    "description": "포켓몬을 처음으로 진화시켰다",
    "trigger": "evolution_count >= 1",
    "reward": "나머지 스타터 1종 해금",
    "rarity": "★☆☆"
  }
]
```

## Settings.json 패치 (install.sh)

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/tokenmon/scripts/hook-session-start.sh", "timeout": 10, "async": true }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/tokenmon/scripts/hook-permission.sh", "timeout": 10, "async": true }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/tokenmon/scripts/hook-stop.sh", "timeout": 30, "async": false }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/tokenmon/scripts/hook-tool-fail.sh", "timeout": 10, "async": true }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/tokenmon/scripts/hook-subagent-start.sh", "timeout": 5, "async": true }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/tokenmon/scripts/hook-subagent-stop.sh", "timeout": 5, "async": true }] }]
  },
  "statusLine": {
    "type": "command",
    "command": "~/.claude/hooks/tokenmon/scripts/status-line.sh"
  }
}
```

## Assumptions Exposed

- Claude Code가 WSL2 Linux 환경에서 실행되고 있으며 `powershell.exe`가 PATH에 있거나 `/mnt/c/WINDOWS/...`에 있음
- Stop 훅 payload에 토큰 수 없음 → JSONL 파싱으로 처리 (probe로 확인 권장)
- Python3가 있으면 Pillow로 스프라이트 변환, 없으면 텍스트 fallback
- PokeAPI Gen 4 D/P 스프라이트 URL이 유효함 (install.sh에서 검증)
- jq가 설치되어 있음 (JSON 파싱용)

## Technical Context

<trace-context>
- Hook 아키텍처: peon-ping 패턴 참고. settings.json → shell script → JSON stdin/stdout
- 오디오: WSL2에서 PowerShell MediaPlayer (WAV/MP3 직접 재생)
- 상태바: settings.json statusLine.command → stdout 출력
- 멀티 에이전트: SubagentStart/Stop hooks, agent_id 기반 상태 추적
- 토큰 XP: JSONL transcript 파싱 (PreCompact transcript_path 또는 Stop 시 직접 경로 계산)
- peon-ping 선택 연동: relay 서버 감지 시 통합, 없으면 standalone
</trace-context>

## Trace Findings

- **오디오**: Standalone PowerShell 방식으로 peon-ping 불필요. WAV/MP3 모두 지원. async: true로 비동기 실행
- **토큰 XP**: Hook payload에 토큰 없음 → JSONL 직접 파싱. PreCompact 훅에서 `transcript_path` 획득 가능
- **상태바**: 독자적인 statusLine 명령어로 OMC safeMode 제약 없음. Gen 4 PNG → 하프블록 터미널 아트 가능
- **멀티 에이전트**: SubagentStart payload에 `agent_id` 포함, subagent-tracker 패턴 그대로 활용

## Ontology

| 개념 | 정의 |
|------|------|
| 파티 | 현재 활성 포켓몬 목록 (최대 6마리) |
| XP | 세션 토큰 소비량 기반 경험치 |
| 레벨 | Medium Fast 공식 기반 성장 단계 |
| 진화 | 특정 레벨 달성 시 종 변화 |
| 업적 | 이벤트/토큰 조건 달성 시 새 포켓몬 해금 |
| 에이전트 배치 | SubagentStart 시 파티 포켓몬 1마리 → agent_id 매핑 |
| 스프라이트 | Gen 4 D/P PNG → 터미널 블록 아트 |

---
*Generated by deep-dive trace + interview pipeline. 2026-03-30*
