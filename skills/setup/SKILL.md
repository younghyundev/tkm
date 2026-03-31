---
description: Tokenmon 초기 설정 (의존성 설치 + StatusLine 통합 + 스타터 포켓몬 선택)
---
Tokenmon 플러그인 초기 설정을 진행합니다. 아래 단계를 순서대로 실행하세요.

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
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/setup/setup-statusline.ts"
```

- 기존 statusLine이 없으면: tokenmon을 직접 등록합니다.
- 기존 statusLine이 있으면: 두 출력을 합치는 래퍼 스크립트를 `~/.claude/tokenmon/status-wrapper.mjs`에 생성하고, settings.json을 업데이트합니다.
- 이미 설정된 경우: 건너뜁니다.

에러가 발생하면 사용자에게 보여주세요.

## Step 3: 스타터 포켓몬 선택

스타터를 이미 선택했는지 확인하세요:

```
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

출력에 파티에 포켓몬이 있으면 Step 4로 이동하세요.

파티가 비어있으면 AskUserQuestion 도구를 사용하여 다음 3가지 중 하나를 고르게 합니다:

1. 모부기 (풀 타입) -- Turtwig
2. 불꽃숭이 (불꽃 타입) -- Chimchar
3. 팽도리 (물 타입) -- Piplup

## Step 4: 스타터 초기화

사용자가 선택하면 Bash 도구로 다음 명령을 실행하세요:

```
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" starter <선택한_포켓몬_이름>
```

포켓몬 이름은 한글로 전달하세요 (모부기, 불꽃숭이, 팽도리 중 하나).

## Step 5: 완료 확인

최종 상태를 확인하세요:

```
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

설치 결과를 사용자에게 보여주세요. status 출력에 포켓몬이 보이면 설정 완료입니다.
Claude Code를 재시작하면 status bar에 tokenmon이 표시됩니다.

## 제거 안내

설정 완료 후, 다음 안내를 사용자에게 반드시 전달하세요:

> **주의**: 나중에 tokenmon을 제거할 때는 `/plugin uninstall` **전에** 반드시 다음을 먼저 실행하세요:
> ```
> tokenmon uninstall
> ```
> 이 명령이 statusLine 설정과 데이터 파일을 정리합니다.
> 이 단계를 건너뛰면 status bar에 에러가 남을 수 있습니다.
