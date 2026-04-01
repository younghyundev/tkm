---
description: "Tokenmon 언어 전환. 한국어 ↔ 영어 토글. Korean: 언어, 영어, 한국어, language, 언어 변경"
---

# Tokenmon Language Toggle

현재 언어를 확인하고 한국어 ↔ 영어로 전환합니다.

## Step 1: 현재 언어 확인

Bash로 현재 config를 읽어 language 값을 확인하세요:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude/tokenmon/config.json','utf8')).language ?? 'ko')"
```

## Step 2: 언어 선택

현재 언어를 보여주고 AskUserQuestion으로 전환 여부를 묻습니다:

- 현재 `ko`이면: "현재 **한국어** 모드입니다. 영어로 전환할까요?"
- 현재 `en`이면: "Currently in **English** mode. Switch to Korean?"

선택지: [전환 / Switch] [유지 / Keep]

## Step 3: 언어 변경

전환을 선택한 경우:

현재가 `ko`이면 영어로:
```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set language en
```

현재가 `en`이면 한국어로:
```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" config set language ko
```

## Step 4: 결과 확인

변경 후 status를 실행해 언어가 적용된 화면을 보여주세요:

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/tsx-resolve.sh" "${CLAUDE_PLUGIN_ROOT}/src/cli/tokenmon.ts" status
```
