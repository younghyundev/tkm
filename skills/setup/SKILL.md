---
description: Tokenmon 초기 설정 (의존성 설치 + StatusLine 통합 + 스타터 포켓몬 선택)
---
Tokenmon 플러그인 초기 설정을 진행합니다. 아래 단계를 순서대로 실행하세요.

## Step 0: 환경 검증

Bash 도구로 다음 명령을 실행하세요:

```
echo "CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT}" && test -n "${CLAUDE_PLUGIN_ROOT}" && test -f "${CLAUDE_PLUGIN_ROOT}/package.json" && echo "OK" || echo "FAIL"
```

- `OK`가 나오면 Step 1로 진행하세요.
- `FAIL`이 나오면 사용자에게 다음을 안내하세요:
  > `CLAUDE_PLUGIN_ROOT`가 설정되지 않았거나 경로에 package.json이 없습니다. 이 skill은 Claude Code 플러그인 환경에서만 실행할 수 있습니다.

## Step 1: 의존성 설치

Bash 도구로 다음 명령을 실행하세요:

```
cd "${CLAUDE_PLUGIN_ROOT}" && npm install
```

성공하면 Step 2로 진행하세요. 실패하면 에러를 사용자에게 보여주세요.

## Step 2: StatusLine 통합

다른 플러그인이 이미 StatusLine을 사용 중일 수 있으므로, 공존 처리를 자동으로 수행합니다.

Bash 도구로 다음 명령을 실행하세요:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/setup/setup-statusline.ts"
```

- 기존 statusLine이 없으면: tokenmon을 직접 등록합니다.
- 기존 statusLine이 있으면: 두 출력을 합치는 래퍼 스크립트를 `~/.claude/tokenmon/status-wrapper.mjs`에 생성하고, settings.json을 업데이트합니다.
- 이미 설정된 경우: 건너뜁니다.

에러가 발생하면 사용자에게 보여주세요.

## Step 3: 스타터 포켓몬 선택

스타터를 이미 선택했는지 확인하세요:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

출력에 파티에 포켓몬이 있으면 Step 4로 이동하세요.

파티가 비어있으면 AskUserQuestion 도구를 사용하여 다음 3가지 중 하나를 고르게 합니다:

1. 모부기 (풀 타입) -- Turtwig
2. 불꽃숭이 (불꽃 타입) -- Chimchar
3. 팽도리 (물 타입) -- Piplup

## Step 4: 스타터 초기화

사용자가 선택하면 Bash 도구로 다음 명령을 실행하세요:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" starter <선택한_포켓몬_이름>
```

포켓몬 이름은 한글로 전달하세요 (모부기, 불꽃숭이, 팽도리 중 하나).

## Step 5: Status Bar 표시 설정

AskUserQuestion 도구로 스프라이트 모드를 선택하게 합니다:

> Status Bar에 포켓몬을 어떻게 표시할까요?

선택지:
1. 전체 스프라이트 (기본) — 파티 전원의 Braille 스프라이트 표시
2. 대표만 스프라이트 — 에이스만 스프라이트, 나머지는 생략
3. 전체 이모지 — 타입 이모지로 간결하게 (1줄)
4. 대표 이모지만 — 에이스만 이모지, 나머지 생략

선택에 따라 실행:
```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set sprite_mode <all|ace_only|emoji_all|emoji_ace>
```

다음으로 정보 표시 모드를 선택하게 합니다:

> 포켓몬 정보를 어떻게 표시할까요?

선택지:
1. 대표 풀 정보 (기본) — 에이스: 이름/레벨/경험치바, 나머지: 이름/레벨
2. 전체 이름/레벨만 — 경험치바 없이 간결하게
3. 전체 풀 정보 — 모든 포켓몬에 경험치바 표시
4. 대표 이름/레벨, 나머지 이름만 — 가장 간결

선택에 따라 실행:
```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set info_mode <ace_full|name_level|all_full|ace_level>
```

## Step 6: 완료 확인

최종 상태를 확인하세요:

```
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

설치 결과를 사용자에게 보여주세요. status 출력에 포켓몬이 보이면 설정 완료입니다.
Claude Code를 재시작하면 status bar에 tokenmon이 표시됩니다.

## 제거 안내

설정 완료 후, 다음 안내를 사용자에게 반드시 전달하세요:

> **주의**: 나중에 tokenmon을 제거할 때는 `/plugin uninstall` **전에** 반드시 다음을 먼저 실행하세요:
> ```
> /tkm:uninstall
> ```
> 이 명령이 statusLine 설정과 데이터 파일을 정리합니다.
> 이 단계를 건너뛰면 status bar에 에러가 남을 수 있습니다.
