---
description: Tokenmon 초기 설정 (의존성 설치 + 스타터 포켓몬 선택)
---
Tokenmon 플러그인 초기 설정을 진행합니다. 아래 단계를 순서대로 실행하세요.

## Step 1: 의존성 설치

Bash 도구로 다음 명령을 실행하세요:

```
cd "${CLAUDE_PLUGIN_ROOT}" && npm install
```

성공하면 Step 2로 진행하세요. 실패하면 에러를 사용자에게 보여주세요.

## Step 2: 스타터 포켓몬 선택

사용자에게 스타터 포켓몬을 선택하게 하세요. AskUserQuestion 도구를 사용하여 다음 3가지 중 하나를 고르게 합니다:

1. 모부기 (풀 타입) -- Turtwig
2. 불꽃숭이 (불꽃 타입) -- Chimchar
3. 팽도리 (물 타입) -- Piplup

## Step 3: 초기화 실행

사용자가 선택하면 Bash 도구로 다음 명령을 실행하세요:

```
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" choose-starter <선택한_포켓몬_이름>
```

포켓몬 이름은 한글로 전달하세요 (모부기, 불꽃숭이, 팽도리 중 하나).

만약 choose-starter 서브커맨드가 없으면, 대신 postinstall을 실행하세요:

```
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/setup/postinstall.ts"
```

그 후 상태를 확인하세요:

```
"${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```

## Step 4: 완료 확인

설치 결과를 사용자에게 보여주세요. status 출력에 포켓몬이 보이면 설정 완료입니다.
